import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ActivityPoint,
  DashboardData,
  DashboardCounts,
  InventoryRisk,
  RequestStatusItem,
  TopCategoryItem,
  TopCategories
} from '../types';

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

const REQUEST_STATUS_DEFAULTS: Record<SolicitudesRow['estado'], number> = {
  pendiente: 0,
  aprobada: 0,
  rechazada: 0,
  entregada: 0
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const LOW_STOCK_THRESHOLD = 10;
const TOP_CATEGORIES_LIMIT = 5;

export const createDashboardDataService = (supabaseClient: SupabaseClient) => {
  const fetchDashboardData = async (): Promise<DashboardData> => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = startOfDay(subtractDays(now, 29));
    const pendingOverdueThreshold = new Date(now.getTime() - DAY_IN_MS);
    const next7Days = addDays(now, 7);
    const next30Days = addDays(now, 30);

    const [
      usuariosCountResult,
      solicitudesCountResult,
      solicitudesResult,
      solicitudesMesResult,
      pendientesVencidasResult,
      donacionesCountResult,
      donacionesResult,
      donacionesMesResult,
      inventoryRiskResult
    ] = await Promise.all([
      supabaseClient
        .from('usuarios')
        .select('*', { count: 'exact', head: true })
        .throwOnError(),
      supabaseClient
        .from('solicitudes')
        .select('*', { count: 'exact', head: true })
        .throwOnError(),
      supabaseClient
        .from('solicitudes')
        .select('estado, created_at, fecha_respuesta, tipo_alimento')
        .throwOnError(),
      supabaseClient
        .from('solicitudes')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth.toISOString())
        .throwOnError(),
      supabaseClient
        .from('solicitudes')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'pendiente')
        .lt('created_at', pendingOverdueThreshold.toISOString())
        .throwOnError(),
      supabaseClient
        .from('donaciones')
        .select('*', { count: 'exact', head: true })
        .throwOnError(),
      supabaseClient
        .from('donaciones')
        .select('estado, creado_en, categoria_comida')
        .throwOnError(),
      supabaseClient
        .from('donaciones')
        .select('*', { count: 'exact', head: true })
        .gte('creado_en', startOfMonth.toISOString())
        .throwOnError(),
      supabaseClient
        .from('entradas_inventario')
        .select(`
          cantidad_disponible,
          fecha_vencimiento
        `)
        .eq('estado', 'disponible')
        .gt('cantidad_disponible', 0)
        .throwOnError()
    ]);

    const solicitudes = (solicitudesResult.data ?? []) as SolicitudesRow[];
    const donaciones = (donacionesResult.data ?? []) as DonacionesRow[];
    const inventoryRows = (inventoryRiskResult.data ?? []) as InventoryRiskRow[];

    const totalUsuarios = usuariosCountResult.count ?? 0;
    const totalSolicitudes = solicitudesCountResult.count ?? solicitudes.length;
    const totalDonaciones = donacionesCountResult.count ?? donaciones.length;
    const donacionesPendientes = donaciones.filter(donacion => donacion.estado === 'Pendiente').length;

    const requestCounts = solicitudes.reduce(
      (acc, solicitud) => {
        acc[solicitud.estado] = (acc[solicitud.estado] ?? 0) + 1;
        return acc;
      },
      { ...REQUEST_STATUS_DEFAULTS }
    );

    const tasaAprobacionBase = requestCounts.aprobada + requestCounts.rechazada;
    const solicitudesResueltas = solicitudes.filter(isResolvedRequest);
    const respuestasDentro24Horas = Math.round(
      solicitudesResueltas.length > 0
        ? (solicitudesResueltas.reduce((count, solicitud) => {
          const createdAt = toDateOrNull(solicitud.created_at);
          const responseAt = toDateOrNull(solicitud.fecha_respuesta);

          if (!createdAt || !responseAt) {
            return count;
          }

          const responseTimeInHours = (responseAt.getTime() - createdAt.getTime()) / (60 * 60 * 1000);
          return count + (responseTimeInHours <= 24 ? 1 : 0);
        }, 0) / solicitudesResueltas.length) * 100
        : 0
    );

    const counts: DashboardCounts = {
      totalUsuarios,
      totalSolicitudes,
      totalDonaciones,
      donacionesPendientes,
      tasaAprobacion: tasaAprobacionBase > 0
        ? Math.round((requestCounts.aprobada / tasaAprobacionBase) * 100)
        : 0,
      pendientes: requestCounts.pendiente,
      solicitudesMes: solicitudesMesResult.count ?? 0,
      donacionesMes: donacionesMesResult.count ?? 0,
      pendientesVencidas: pendientesVencidasResult.count ?? 0,
      respuestasDentro24Horas
    };

    const inventoryRisk: InventoryRisk = inventoryRows.reduce(
      (acc, row) => {
        const cantidadDisponible = Number(row.cantidad_disponible ?? 0);
        const fechaCaducidad = toDateOrNull(row.fecha_vencimiento);

        if (cantidadDisponible > 0 && cantidadDisponible <= LOW_STOCK_THRESHOLD) {
          acc.stockBajo += 1;
        }

        if (!fechaCaducidad) {
          return acc;
        }

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
      {
        stockBajo: 0,
        vencidos: 0,
        porVencer7Dias: 0,
        porVencer30Dias: 0
      } satisfies InventoryRisk
    );

    const requestStatus: RequestStatusItem[] = [
      {
        label: 'Pendientes',
        count: requestCounts.pendiente,
        percentage: totalSolicitudes > 0 ? Math.round((requestCounts.pendiente / totalSolicitudes) * 100) : 0,
        accent: 'yellow'
      },
      {
        label: 'Aprobadas',
        count: requestCounts.aprobada,
        percentage: totalSolicitudes > 0 ? Math.round((requestCounts.aprobada / totalSolicitudes) * 100) : 0,
        accent: 'green'
      },
      {
        label: 'Rechazadas',
        count: requestCounts.rechazada,
        percentage: totalSolicitudes > 0 ? Math.round((requestCounts.rechazada / totalSolicitudes) * 100) : 0,
        accent: 'red'
      },
      {
        label: 'Entregadas',
        count: requestCounts.entregada,
        percentage: totalSolicitudes > 0 ? Math.round((requestCounts.entregada / totalSolicitudes) * 100) : 0,
        accent: 'blue'
      }
    ];

    const activity = {
      solicitudesUltimos30Dias: buildDailyActivitySeries(
        solicitudes,
        'created_at',
        thirtyDaysAgo,
        now
      ),
      donacionesUltimos30Dias: buildDailyActivitySeries(
        donaciones,
        'creado_en',
        thirtyDaysAgo,
        now
      )
    };

    const topCategories: TopCategories = {
      solicitadas: buildTopCategories(solicitudes, row => row.tipo_alimento),
      donadas: buildTopCategories(donaciones, row => row.categoria_comida)
    };

    return {
      counts,
      inventoryRisk,
      activity,
      topCategories,
      requestStatus
    };
  };

  return {
    fetchDashboardData
  };
};

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
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const isResolvedRequest = (solicitud: SolicitudesRow) => (
  ['aprobada', 'rechazada', 'entregada'].includes(solicitud.estado) &&
  Boolean(toDateOrNull(solicitud.fecha_respuesta)) &&
  Boolean(toDateOrNull(solicitud.created_at))
);

const buildDailyActivitySeries = <T>(
  rows: T[],
  dateField: keyof T,
  startDate: Date,
  endDate: Date
): ActivityPoint[] => {
  const totalsByDate = new Map<string, number>();

  rows.forEach(row => {
    const rawDate = row[dateField];
    const date = toDateOrNull(typeof rawDate === 'string' ? rawDate : null);

    if (!date || date < startDate || date > endDate) {
      return;
    }

    const dateKey = formatDateKey(date);
    totalsByDate.set(dateKey, (totalsByDate.get(dateKey) ?? 0) + 1);
  });

  const points: ActivityPoint[] = [];
  const cursor = startOfDay(startDate);
  const lastDate = startOfDay(endDate);

  while (cursor <= lastDate) {
    const key = formatDateKey(cursor);
    points.push({
      fecha: key,
      total: totalsByDate.get(key) ?? 0
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return points;
};

const buildTopCategories = <T>(
  rows: T[],
  getCategory: (row: T) => string | null
): TopCategoryItem[] => {
  const counts = rows.reduce((acc, row) => {
    const rawCategory = getCategory(row);
    const category = rawCategory?.trim();

    if (!category) {
      return acc;
    }

    acc.set(category, (acc.get(category) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
    .slice(0, TOP_CATEGORIES_LIMIT)
    .map(([label, total]) => ({ label, total }));
};
