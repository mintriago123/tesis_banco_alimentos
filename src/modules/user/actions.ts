'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { withRlsContext, type Tx } from '@/db/client';
import { conversiones, solicitudes, unidades, usuarios } from '@/db/schema';
import { requireAuth } from '@/lib/server-auth';
import type { ConversionData } from '@/lib/unidadConversion';
import { parseEnumValue, parseFiniteNumberValue, parseOptionalTextValue, parsePositiveIntegerValue, parseUuidValue } from '@/lib/validation-core';
import { agruparStockPorUnidad, calcularTotalPorUnidades, crearCantidadFormateada, emptySummary, type StockInfo, type StockSummary } from './services/stockCalculations';
import type { Alimento, FiltroEstadoSolicitud, Solicitud, SolicitudEditData, SolicitudFormData, Unidad, UnidadAlimento } from './types';

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

type AlimentoStockRow = { id: number; nombre: string; categoria: string } & Record<string, unknown>;
type UnidadAlimentoRpcRow = {
  unidad_id: number;
  nombre: string;
  simbolo: string;
  tipo_magnitud_id: number;
  tipo_magnitud_nombre: string;
  es_base: boolean;
  es_principal: boolean;
} & Record<string, unknown>;
type StockRpcRow = {
  id_entrada: string;
  id_deposito: string;
  cantidad_disponible: string | number | null;
  fecha_ingreso: string | null;
  unidad_id: number | null;
  unidad_nombre: string | null;
  unidad_simbolo: string | null;
  deposito: string | null;
} & Record<string, unknown>;

const ESTADOS_SOLICITUD_FILTRO = ['pendiente', 'aprobada', 'rechazada', 'entregada'] as const;

async function requireSolicitante() {
  return requireAuth();
}

export async function fetchAlimentosConStockAction(): Promise<ActionResult<Alimento[]>> {
  const auth = await requireSolicitante();
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const rows = await tx.execute<AlimentoStockRow>(sql`select * from obtener_alimentos_con_stock()`);

      const alimentosConUnidades = await Promise.all(
        rows.map(async (alimento) => {
          const unidadesRows = await tx.execute<UnidadAlimentoRpcRow>(sql`select * from obtener_unidades_alimento(${alimento.id}::bigint)`);
          const unidadesAlimento: UnidadAlimento[] = unidadesRows.map((u) => ({
            unidad_id: u.unidad_id,
            nombre: u.nombre,
            simbolo: u.simbolo,
            tipo_magnitud_id: u.tipo_magnitud_id,
            tipo_magnitud_nombre: u.tipo_magnitud_nombre,
            es_base: u.es_base,
            es_principal: u.es_principal,
          }));

          return { id: alimento.id, nombre: alimento.nombre, categoria: alimento.categoria, unidades: unidadesAlimento } satisfies Alimento;
        }),
      );

      return { success: true, data: alimentosConUnidades };
    } catch (error) {
      console.error('Error fetching alimentos con stock:', error);
      return { success: false, error: 'Error al cargar los alimentos disponibles' };
    }
  });
}

export async function fetchUnidadesAction(): Promise<ActionResult<Unidad[]>> {
  const auth = await requireSolicitante();
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const rows = await tx
        .select({
          id: unidades.id,
          nombre: unidades.nombre,
          simbolo: unidades.simbolo,
          tipo_magnitud_id: unidades.tipoMagnitudId,
          es_base: unidades.esBase,
          activa: unidades.activa,
          es_discreta: unidades.esDiscreta,
          es_presentacion: unidades.esPresentacion,
          permite_fraccion: unidades.permiteFraccion,
        })
        .from(unidades)
        .where(eq(unidades.activa, true))
        .orderBy(unidades.nombre);

      return { success: true, data: rows };
    } catch (error) {
      console.error('Error fetching unidades:', error);
      return { success: false, error: 'Error al cargar las unidades' };
    }
  });
}

async function obtenerConversiones(tx: Tx): Promise<ConversionData[]> {
  const origen = unidades;
  const rows = await tx
    .select({
      unidadOrigenId: conversiones.unidadOrigenId,
      unidadDestinoId: conversiones.unidadDestinoId,
      factorConversion: conversiones.factorConversion,
      activo: conversiones.activo,
      origenNombre: origen.nombre,
      origenSimbolo: origen.simbolo,
    })
    .from(conversiones)
    .innerJoin(origen, eq(conversiones.unidadOrigenId, origen.id))
    .where(eq(conversiones.activo, true));

  // Fetch destino names in a second pass keyed by id (avoids the
  // double-alias ceremony Drizzle needs for self-joins on the same table).
  const destinoIds = [...new Set(rows.map((r) => r.unidadDestinoId))];
  const destinoRows = destinoIds.length
    ? await tx.select({ id: unidades.id, nombre: unidades.nombre, simbolo: unidades.simbolo }).from(unidades).where(sql`${unidades.id} = any(${destinoIds})`)
    : [];
  const destinoById = new Map(destinoRows.map((d) => [d.id, d]));

  return rows.flatMap((row) => {
    const destino = destinoById.get(row.unidadDestinoId);
    const factor = Number(row.factorConversion);

    if (!destino || !Number.isFinite(factor) || factor <= 0) {
      return [];
    }

    return [
      {
        unidad_origen_id: row.unidadOrigenId,
        unidad_destino_id: row.unidadDestinoId,
        unidad_origen: row.origenNombre ?? '',
        simbolo_origen: row.origenSimbolo,
        unidad_destino: destino.nombre ?? '',
        simbolo_destino: destino.simbolo,
        factor_conversion: factor,
        activo: row.activo ?? false,
      },
    ];
  });
}

export async function fetchConversionesAction(): Promise<ActionResult<ConversionData[]>> {
  const auth = await requireSolicitante();
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      return { success: true, data: await obtenerConversiones(tx) };
    } catch (error) {
      console.error('[fetchConversionesAction] Error:', error);
      return { success: false, error: 'Error al cargar las conversiones' };
    }
  });
}

export async function checkStockAction(nombreProducto: string): Promise<ActionResult<StockSummary>> {
  const auth = await requireSolicitante();
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  const nombre = parseOptionalTextValue(nombreProducto, { name: 'nombreProducto', maxLength: 150 });
  if (!nombre.success) {
    return { success: false, error: nombre.error };
  }
  if (!nombre.value) {
    return { success: true, data: emptySummary() };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const conversionesData = await obtenerConversiones(tx);
      const rows = await tx.execute<StockRpcRow>(sql`select * from obtener_stock_por_producto(${nombre.value})`);

      if (rows.length === 0) {
        return { success: true, data: emptySummary() };
      }

      const stockPorDepositoYUnidad = new Map<string, StockInfo>();

      for (const row of rows) {
        const cantidad = Number(row.cantidad_disponible ?? 0);
        if (!Number.isFinite(cantidad) || cantidad <= 0 || !row.unidad_id) continue;

        const key = `${row.id_deposito}:${row.unidad_id}`;
        const existente = stockPorDepositoYUnidad.get(key);
        if (existente) {
          existente.cantidad_disponible += cantidad;
          existente.cantidad_formateada = crearCantidadFormateada(existente.cantidad_disponible, existente.unidad_simbolo ?? '', existente.unidad_nombre ?? '');
          if (row.fecha_ingreso && (!existente.fecha_actualizacion || row.fecha_ingreso > existente.fecha_actualizacion)) {
            existente.fecha_actualizacion = row.fecha_ingreso;
          }
          continue;
        }

        stockPorDepositoYUnidad.set(key, {
          id_entrada: row.id_entrada,
          id_deposito: row.id_deposito,
          cantidad_disponible: cantidad,
          deposito: row.deposito ?? 'Sin depósito',
          fecha_actualizacion: row.fecha_ingreso,
          unidad_id: row.unidad_id,
          unidad_nombre: row.unidad_nombre ?? undefined,
          unidad_simbolo: row.unidad_simbolo ?? undefined,
          cantidad_formateada: crearCantidadFormateada(cantidad, row.unidad_simbolo ?? '', row.unidad_nombre ?? ''),
        });
      }

      const depositosList = [...stockPorDepositoYUnidad.values()];
      if (depositosList.length === 0) {
        return { success: true, data: { ...emptySummary(), producto_encontrado: true } };
      }

      const unidadObjetivo = depositosList[0];
      const unidadesDisponibles = agruparStockPorUnidad(depositosList);
      const total = calcularTotalPorUnidades(depositosList, conversionesData);

      const summary: StockSummary = {
        total_disponible: total.calculable ? total.cantidad : 0,
        total_calculable: total.calculable,
        depositos: depositosList,
        unidades_disponibles: unidadesDisponibles,
        producto_encontrado: true,
        estado_stock: total.calculable ? 'disponible' : 'unidades_no_convertibles',
        unidad_id: unidadObjetivo.unidad_id,
        unidad_nombre: unidadObjetivo.unidad_nombre,
        unidad_simbolo: unidadObjetivo.unidad_simbolo,
        total_formateado: total.calculable ? crearCantidadFormateada(total.cantidad, unidadObjetivo.unidad_simbolo ?? '', unidadObjetivo.unidad_nombre ?? '') : undefined,
      };

      return { success: true, data: summary };
    } catch (error) {
      console.error('Excepción consultando stock', error);
      return { success: false, error: 'Error inesperado al consultar inventario' };
    }
  });
}

function mapSolicitudRow(row: {
  id: string;
  usuarioId: string;
  tipoAlimento: string;
  cantidad: string;
  unidadId: number | null;
  comentarios: string | null;
  estado: string;
  latitud: number | null;
  longitud: number | null;
  createdAt: Date;
  codigoComprobante: string | null;
  fechaRespuesta: Date | null;
  comentarioAdmin: string | null;
  motivoRechazo: string | null;
  fechaRechazo: Date | null;
  operadorRechazoId: string | null;
  fechaAprobacion: Date | null;
  operadorAprobacionId: string | null;
  unidadSimbolo: string | null;
}): Solicitud {
  return {
    id: row.id,
    usuario_id: row.usuarioId,
    tipo_alimento: row.tipoAlimento,
    cantidad: Number(row.cantidad),
    unidad_id: row.unidadId ?? 0,
    comentarios: row.comentarios,
    estado: row.estado as Solicitud['estado'],
    latitud: row.latitud,
    longitud: row.longitud,
    created_at: row.createdAt.toISOString(),
    codigo_comprobante: row.codigoComprobante ?? undefined,
    fecha_respuesta: row.fechaRespuesta?.toISOString(),
    comentario_admin: row.comentarioAdmin ?? undefined,
    unidad_simbolo: row.unidadSimbolo ?? 'unidades',
    motivo_rechazo: row.motivoRechazo,
    fecha_rechazo: row.fechaRechazo?.toISOString() ?? null,
    operador_rechazo_id: row.operadorRechazoId,
    fecha_aprobacion: row.fechaAprobacion?.toISOString() ?? null,
    operador_aprobacion_id: row.operadorAprobacionId,
  };
}

export async function fetchSolicitudesAction(filtroEstado: FiltroEstadoSolicitud = 'TODOS'): Promise<ActionResult<Solicitud[]>> {
  const auth = await requireSolicitante();
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const conditions = [eq(solicitudes.usuarioId, auth.profile.id)];

      if (filtroEstado !== 'TODOS') {
        const estado = parseEnumValue(filtroEstado, ESTADOS_SOLICITUD_FILTRO, { name: 'filtroEstado' });
        if (!estado.success) {
          return { success: false, error: estado.error };
        }
        conditions.push(eq(solicitudes.estado, estado.value));
      }

      const rows = await tx
        .select({
          id: solicitudes.id,
          usuarioId: solicitudes.usuarioId,
          tipoAlimento: solicitudes.tipoAlimento,
          cantidad: solicitudes.cantidad,
          unidadId: solicitudes.unidadId,
          comentarios: solicitudes.comentarios,
          estado: solicitudes.estado,
          latitud: solicitudes.latitud,
          longitud: solicitudes.longitud,
          createdAt: solicitudes.createdAt,
          codigoComprobante: solicitudes.codigoComprobante,
          fechaRespuesta: solicitudes.fechaRespuesta,
          comentarioAdmin: solicitudes.comentarioAdmin,
          motivoRechazo: solicitudes.motivoRechazo,
          fechaRechazo: solicitudes.fechaRechazo,
          operadorRechazoId: solicitudes.operadorRechazoId,
          fechaAprobacion: solicitudes.fechaAprobacion,
          operadorAprobacionId: solicitudes.operadorAprobacionId,
          unidadSimbolo: unidades.simbolo,
        })
        .from(solicitudes)
        .leftJoin(unidades, eq(solicitudes.unidadId, unidades.id))
        .where(and(...conditions))
        .orderBy(desc(solicitudes.createdAt));

      return { success: true, data: rows.map(mapSolicitudRow) };
    } catch (error) {
      console.error('Error fetching solicitudes:', error);
      return { success: false, error: 'Error al cargar las solicitudes.' };
    }
  });
}

export async function createSolicitudAction(data: SolicitudFormData): Promise<ActionResult<Solicitud>> {
  const auth = await requireSolicitante();
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  const cantidad = parseFiniteNumberValue(data.cantidad, { name: 'cantidad', min: 0 });
  if (!cantidad.success || cantidad.value <= 0) {
    return { success: false, error: cantidad.success ? 'cantidad debe ser mayor a 0.' : cantidad.error };
  }

  const unidadId = parsePositiveIntegerValue(data.unidad_id, { name: 'unidad_id', min: 1 });
  if (!unidadId.success) {
    return { success: false, error: unidadId.error };
  }

  const comentarios = parseOptionalTextValue(data.comentarios, { name: 'comentarios', maxLength: 500 });
  if (!comentarios.success) {
    return { success: false, error: comentarios.error };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const [row] = await tx
        .insert(solicitudes)
        .values({
          usuarioId: auth.profile.id,
          tipoAlimento: data.tipo_alimento,
          cantidad: String(cantidad.value),
          unidadId: unidadId.value,
          comentarios: comentarios.value,
          latitud: data.latitud ?? null,
          longitud: data.longitud ?? null,
        })
        .returning();

      if (!row) {
        return { success: false, error: 'Error al enviar la solicitud' };
      }

      revalidatePath('/user/solicitudes');
      return {
        success: true,
        data: mapSolicitudRow({ ...row, unidadSimbolo: null }),
      };
    } catch (error) {
      console.error('[createSolicitudAction] Error:', error);
      return { success: false, error: 'Error al enviar la solicitud' };
    }
  });
}

export async function updateSolicitudAction(id: string, data: SolicitudEditData): Promise<ActionResult<{ id: string }>> {
  const auth = await requireSolicitante();
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  const solicitudId = parseUuidValue(id, { name: 'solicitudId' });
  if (!solicitudId.success) {
    return { success: false, error: solicitudId.error };
  }

  const comentarios = parseOptionalTextValue(data.comentarios, { name: 'comentarios', maxLength: 500 });
  if (!comentarios.success) {
    return { success: false, error: comentarios.error };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      await tx.update(solicitudes).set({ comentarios: comentarios.value }).where(and(eq(solicitudes.id, solicitudId.value), eq(solicitudes.usuarioId, auth.profile.id)));
      revalidatePath('/user/solicitudes');
      return { success: true, data: { id: solicitudId.value } };
    } catch (error) {
      console.error('[updateSolicitudAction] Error:', error);
      return { success: false, error: 'Error al actualizar la solicitud.' };
    }
  });
}

/**
 * Displays who reviewed a request (approve/reject), on demand. RLS on
 * `usuarios` only lets a caller see staff rows or their own, so a fallback
 * generic label is expected and handled — same defensive behavior the old
 * client-side query already had.
 */
export async function fetchOperadorInfoAction(operadorId: string): Promise<ActionResult<{ nombre: string; rol: string }>> {
  const auth = await requireSolicitante();
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  const parsedId = parseUuidValue(operadorId, { name: 'operadorId' });
  if (!parsedId.success) {
    return { success: true, data: { nombre: 'Personal Administrativo', rol: 'STAFF' } };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    const [row] = await tx.select({ nombre: usuarios.nombre, rol: usuarios.rol }).from(usuarios).where(eq(usuarios.id, parsedId.value)).limit(1);

    if (!row) {
      return { success: true, data: { nombre: 'Personal Administrativo', rol: 'STAFF' } };
    }

    return { success: true, data: { nombre: row.nombre || 'Sistema', rol: row.rol || 'OPERADOR' } };
  });
}

export async function deleteSolicitudAction(id: string): Promise<ActionResult<{ id: string }>> {
  const auth = await requireSolicitante();
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  const solicitudId = parseUuidValue(id, { name: 'id' });
  if (!solicitudId.success) {
    return { success: false, error: solicitudId.error };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      await tx.delete(solicitudes).where(and(eq(solicitudes.id, solicitudId.value), eq(solicitudes.usuarioId, auth.profile.id)));
      revalidatePath('/user/solicitudes');
      return { success: true, data: { id: solicitudId.value } };
    } catch (error) {
      console.error('[deleteSolicitudAction] Error:', error);
      return { success: false, error: 'Error al eliminar la solicitud.' };
    }
  });
}
