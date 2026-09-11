'use server';

import { and, eq, gt, gte, lt, sql } from 'drizzle-orm';
import { withRlsContext, type Tx } from '@/db/client';
import { donaciones, entradasInventario, solicitudes, usuarios } from '@/db/schema';
import { requireRole } from '@/lib/server-auth';
import type { ActivityPoint, DashboardCounts, DashboardData, InventoryRisk, RequestStatusItem, TopCategories, TopCategoryItem } from './types';

interface SolicitudesRow {
  estado: 'pendiente' | 'aprobada' | 'rechazada' | 'entregada';
  created_at: string | null;
  fecha_respuesta: string | null;
  tipo_alimento: string | null;
}

interface DonacionesRow {
  estado: 'Pendiente' | 'Aprobada' | 'Cancelada';
  creado_en: string | null;
  categoria_comida: string | null;
}

interface InventoryRiskRow {
  cantidad_disponible: number | null;
  fecha_vencimiento: string | null;
}

const REQUEST_STATUS_DEFAULTS: Record<SolicitudesRow['estado'], number> = { pendiente: 0, aprobada: 0, rechazada: 0, entregada: 0 };

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const LOW_STOCK_THRESHOLD = 10;
const TOP_CATEGORIES_LIMIT = 5;

async function countRows(tx: Tx, table: typeof solicitudes | typeof donaciones | typeof usuarios, where?: ReturnType<typeof and>): Promise<number> {
  const query = tx.select({ count: sql<number>`count(*)::int` }).from(table as typeof solicitudes);
  const [row] = where ? await query.where(where) : await query;
  return row?.count ?? 0;
}

async function fetchDashboardData(tx: Tx): Promise<DashboardData> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = startOfDay(subtractDays(now, 29));
  const pendingOverdueThreshold = new Date(now.getTime() - DAY_IN_MS);
  const next7Days = addDays(now, 7);
  const next30Days = addDays(now, 30);

  const [
    totalUsuarios,
    totalSolicitudes,
    solicitudesRows,
    solicitudesMes,
    pendientesVencidas,
    totalDonaciones,
    donacionesRows,
    donacionesMes,
    inventoryRiskRows,
  ] = await Promise.all([
    countRows(tx, usuarios),
    countRows(tx, solicitudes),
    tx.select({ estado: solicitudes.estado, created_at: solicitudes.createdAt, fecha_respuesta: solicitudes.fechaRespuesta, tipo_alimento: solicitudes.tipoAlimento }).from(solicitudes),
    countRows(tx, solicitudes, and(gte(solicitudes.createdAt, startOfMonth))),
    countRows(tx, solicitudes, and(eq(solicitudes.estado, 'pendiente'), lt(solicitudes.createdAt, pendingOverdueThreshold))),
    countRows(tx, donaciones),
    tx.select({ estado: donaciones.estado, creado_en: donaciones.creadoEn, categoria_comida: donaciones.categoriaComida }).from(donaciones),
    countRows(tx, donaciones, and(gte(donaciones.creadoEn, startOfMonth))),
    tx
      .select({ cantidad_disponible: entradasInventario.cantidadDisponible, fecha_vencimiento: entradasInventario.fechaVencimiento })
      .from(entradasInventario)
      .where(and(eq(entradasInventario.estado, 'disponible'), gt(entradasInventario.cantidadDisponible, '0'))),
  ]);

  const solicitudesData: SolicitudesRow[] = solicitudesRows.map((r) => ({
    estado: r.estado as SolicitudesRow['estado'],
    created_at: r.created_at?.toISOString() ?? null,
    fecha_respuesta: r.fecha_respuesta?.toISOString() ?? null,
    tipo_alimento: r.tipo_alimento,
  }));
  const donacionesData: DonacionesRow[] = donacionesRows.map((r) => ({
    estado: r.estado as DonacionesRow['estado'],
    creado_en: r.creado_en?.toISOString() ?? null,
    categoria_comida: r.categoria_comida,
  }));
  const inventoryRows: InventoryRiskRow[] = inventoryRiskRows.map((r) => ({
    cantidad_disponible: r.cantidad_disponible ? Number(r.cantidad_disponible) : 0,
    fecha_vencimiento: r.fecha_vencimiento,
  }));

  const donacionesPendientes = donacionesData.filter((d) => d.estado === 'Pendiente').length;

  const requestCounts = solicitudesData.reduce((acc, s) => {
    acc[s.estado] = (acc[s.estado] ?? 0) + 1;
    return acc;
  }, { ...REQUEST_STATUS_DEFAULTS });

  const tasaAprobacionBase = requestCounts.aprobada + requestCounts.rechazada;
  const solicitudesResueltas = solicitudesData.filter(isResolvedRequest);
  const respuestasDentro24Horas = Math.round(
    solicitudesResueltas.length > 0
      ? (solicitudesResueltas.reduce((count, s) => {
          const createdAt = toDateOrNull(s.created_at);
          const responseAt = toDateOrNull(s.fecha_respuesta);
          if (!createdAt || !responseAt) return count;
          const responseTimeInHours = (responseAt.getTime() - createdAt.getTime()) / (60 * 60 * 1000);
          return count + (responseTimeInHours <= 24 ? 1 : 0);
        }, 0) /
          solicitudesResueltas.length) *
        100
      : 0,
  );

  const counts: DashboardCounts = {
    totalUsuarios,
    totalSolicitudes,
    totalDonaciones,
    donacionesPendientes,
    tasaAprobacion: tasaAprobacionBase > 0 ? Math.round((requestCounts.aprobada / tasaAprobacionBase) * 100) : 0,
    pendientes: requestCounts.pendiente,
    solicitudesMes,
    donacionesMes,
    pendientesVencidas,
    respuestasDentro24Horas,
  };

  const inventoryRisk: InventoryRisk = inventoryRows.reduce(
    (acc, row) => {
      const cantidadDisponible = Number(row.cantidad_disponible ?? 0);
      const fechaCaducidad = toDateOrNull(row.fecha_vencimiento);

      if (cantidadDisponible > 0 && cantidadDisponible <= LOW_STOCK_THRESHOLD) {
        acc.stockBajo += 1;
      }
      if (!fechaCaducidad) return acc;
      if (fechaCaducidad < now) {
        acc.vencidos += 1;
      } else if (fechaCaducidad <= next7Days) {
        acc.porVencer7Dias += 1;
        acc.porVencer30Dias += 1;
      } else if (fechaCaducidad <= next30Days) {
        acc.porVencer30Dias += 1;
      }
      return acc;
    },
    { stockBajo: 0, vencidos: 0, porVencer7Dias: 0, porVencer30Dias: 0 } satisfies InventoryRisk,
  );

  const requestStatus: RequestStatusItem[] = [
    { label: 'Pendientes', count: requestCounts.pendiente, percentage: totalSolicitudes > 0 ? Math.round((requestCounts.pendiente / totalSolicitudes) * 100) : 0, accent: 'yellow' },
    { label: 'Aprobadas', count: requestCounts.aprobada, percentage: totalSolicitudes > 0 ? Math.round((requestCounts.aprobada / totalSolicitudes) * 100) : 0, accent: 'green' },
    { label: 'Rechazadas', count: requestCounts.rechazada, percentage: totalSolicitudes > 0 ? Math.round((requestCounts.rechazada / totalSolicitudes) * 100) : 0, accent: 'red' },
    { label: 'Entregadas', count: requestCounts.entregada, percentage: totalSolicitudes > 0 ? Math.round((requestCounts.entregada / totalSolicitudes) * 100) : 0, accent: 'blue' },
  ];

  const activity = {
    solicitudesUltimos30Dias: buildDailyActivitySeries(solicitudesData, 'created_at', thirtyDaysAgo, now),
    donacionesUltimos30Dias: buildDailyActivitySeries(donacionesData, 'creado_en', thirtyDaysAgo, now),
  };

  const topCategories: TopCategories = {
    solicitadas: buildTopCategories(solicitudesData, (row) => row.tipo_alimento),
    donadas: buildTopCategories(donacionesData, (row) => row.categoria_comida),
  };

  return { counts, inventoryRisk, activity, topCategories, requestStatus };
}

export async function getDashboardDataAction(): Promise<{ success: true; data: DashboardData } | { success: false; error: string }> {
  const auth = await requireRole(['ADMINISTRADOR']);
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  try {
    const data = await withRlsContext(auth.profile.id, (tx) => fetchDashboardData(tx));
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado al cargar el dashboard';
    return { success: false, error: message };
  }
}

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const subtractDays = (date: Date, days: number) => addDays(date, -days);
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDateOrNull = (value: string | null) => {
  if (!value) return null;
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const isResolvedRequest = (solicitud: SolicitudesRow) =>
  ['aprobada', 'rechazada', 'entregada'].includes(solicitud.estado) && Boolean(toDateOrNull(solicitud.fecha_respuesta)) && Boolean(toDateOrNull(solicitud.created_at));

const buildDailyActivitySeries = <T>(rows: T[], dateField: keyof T, startDate: Date, endDate: Date): ActivityPoint[] => {
  const totalsByDate = new Map<string, number>();

  rows.forEach((row) => {
    const rawDate = row[dateField];
    const date = toDateOrNull(typeof rawDate === 'string' ? rawDate : null);
    if (!date || date < startDate || date > endDate) return;
    const dateKey = formatDateKey(date);
    totalsByDate.set(dateKey, (totalsByDate.get(dateKey) ?? 0) + 1);
  });

  const points: ActivityPoint[] = [];
  const cursor = startOfDay(startDate);
  const lastDate = startOfDay(endDate);

  while (cursor <= lastDate) {
    const key = formatDateKey(cursor);
    points.push({ fecha: key, total: totalsByDate.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return points;
};

const buildTopCategories = <T>(rows: T[], getCategory: (row: T) => string | null): TopCategoryItem[] => {
  const counts = rows.reduce((acc, row) => {
    const category = getCategory(row)?.trim();
    if (!category) return acc;
    acc.set(category, (acc.get(category) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
    .slice(0, TOP_CATEGORIES_LIMIT)
    .map(([label, total]) => ({ label, total }));
};
