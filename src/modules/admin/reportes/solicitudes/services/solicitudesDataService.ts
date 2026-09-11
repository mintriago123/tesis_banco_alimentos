import { and, desc, eq, gt, ilike, asc } from 'drizzle-orm';
import type { Tx } from '@/db/client';
import { depositos, entradasInventario, productosDonados, solicitudes, unidades, usuarios } from '@/db/schema';
import type { ConversionResolution } from '@/lib/unidadConversion';
import { resolverConversion } from '@/lib/unidadConversion';
import type { InventarioDisponible, ServiceResult, Solicitud } from '../types';
import { escapeLikePattern, parsePositiveIntegerValue } from '@/lib/validation-core';

const isDevelopment = process.env.NODE_ENV === 'development';

const logger = {
  info: (message: string, details?: unknown) => {
    if (isDevelopment) console.info(`[SolicitudesDataService] ${message}`, details);
  },
  error: (message: string, error?: unknown) => console.error(`[SolicitudesDataService] ${message}`, error),
};

const SOLICITUD_COLUMNS = {
  id: solicitudes.id,
  usuarioId: solicitudes.usuarioId,
  tipoAlimento: solicitudes.tipoAlimento,
  cantidad: solicitudes.cantidad,
  comentarios: solicitudes.comentarios,
  estado: solicitudes.estado,
  createdAt: solicitudes.createdAt,
  latitud: solicitudes.latitud,
  longitud: solicitudes.longitud,
  fechaRespuesta: solicitudes.fechaRespuesta,
  comentarioAdmin: solicitudes.comentarioAdmin,
  unidadId: solicitudes.unidadId,
  motivoRechazo: solicitudes.motivoRechazo,
  operadorRechazoId: solicitudes.operadorRechazoId,
  fechaRechazo: solicitudes.fechaRechazo,
  operadorAprobacionId: solicitudes.operadorAprobacionId,
  fechaAprobacion: solicitudes.fechaAprobacion,
  codigoComprobante: solicitudes.codigoComprobante,
  cantidadEntregada: solicitudes.cantidadEntregada,
  tieneEntregasParciales: solicitudes.tieneEntregasParciales,
  unidadNombre: unidades.nombre,
  unidadSimbolo: unidades.simbolo,
  unidadTipoMagnitudId: unidades.tipoMagnitudId,
  unidadEsBase: unidades.esBase,
  unidadEsDiscreta: unidades.esDiscreta,
  unidadPermiteFraccion: unidades.permiteFraccion,
  usuarioNombre: usuarios.nombre,
  usuarioCedula: usuarios.cedula,
  usuarioTelefono: usuarios.telefono,
  usuarioEmail: usuarios.email,
  usuarioDireccion: usuarios.direccion,
  usuarioTipoPersona: usuarios.tipoPersona,
} as const;

function mapSolicitudRow(row: {
  id: string;
  usuarioId: string;
  tipoAlimento: string;
  cantidad: string;
  comentarios: string | null;
  estado: string;
  createdAt: Date;
  latitud: number | null;
  longitud: number | null;
  fechaRespuesta: Date | null;
  comentarioAdmin: string | null;
  unidadId: number | null;
  motivoRechazo: string | null;
  operadorRechazoId: string | null;
  fechaRechazo: Date | null;
  operadorAprobacionId: string | null;
  fechaAprobacion: Date | null;
  codigoComprobante: string | null;
  cantidadEntregada: string | null;
  tieneEntregasParciales: boolean | null;
  unidadNombre: string | null;
  unidadSimbolo: string | null;
  unidadTipoMagnitudId: number | null;
  unidadEsBase: boolean | null;
  unidadEsDiscreta: boolean | null;
  unidadPermiteFraccion: boolean | null;
  usuarioNombre: string | null;
  usuarioCedula: string | null;
  usuarioTelefono: string | null;
  usuarioEmail: string | null;
  usuarioDireccion: string | null;
  usuarioTipoPersona: string | null;
}): Solicitud {
  return {
    id: row.id,
    usuario_id: row.usuarioId,
    tipo_alimento: row.tipoAlimento ?? 'Producto desconocido',
    cantidad: Number(row.cantidad ?? 0),
    comentarios: row.comentarios ?? undefined,
    estado: row.estado as Solicitud['estado'],
    created_at: row.createdAt.toISOString(),
    latitud: row.latitud ?? undefined,
    longitud: row.longitud ?? undefined,
    fecha_respuesta: row.fechaRespuesta?.toISOString(),
    comentario_admin: row.comentarioAdmin ?? undefined,
    unidad_id: row.unidadId ?? undefined,
    motivo_rechazo: row.motivoRechazo ?? undefined,
    operador_rechazo_id: row.operadorRechazoId ?? undefined,
    fecha_rechazo: row.fechaRechazo?.toISOString(),
    operador_aprobacion_id: row.operadorAprobacionId ?? undefined,
    fecha_aprobacion: row.fechaAprobacion?.toISOString(),
    cantidad_entregada: row.cantidadEntregada ? Number(row.cantidadEntregada) : undefined,
    tiene_entregas_parciales: row.tieneEntregasParciales ?? undefined,
    codigo_comprobante: row.codigoComprobante ?? undefined,
    unidades: row.unidadId
      ? {
          id: row.unidadId,
          nombre: row.unidadNombre ?? '',
          simbolo: row.unidadSimbolo ?? '',
          tipo_magnitud_id: row.unidadTipoMagnitudId ?? 0,
          es_base: row.unidadEsBase ?? false,
          es_discreta: row.unidadEsDiscreta ?? undefined,
          permite_fraccion: row.unidadPermiteFraccion ?? undefined,
        }
      : null,
    usuarios: row.usuarioNombre
      ? {
          nombre: row.usuarioNombre ?? 'N/A',
          cedula: row.usuarioCedula ?? 'N/A',
          telefono: row.usuarioTelefono ?? 'N/A',
          email: row.usuarioEmail ?? undefined,
          direccion: row.usuarioDireccion ?? undefined,
          tipo_persona: row.usuarioTipoPersona ?? undefined,
        }
      : null,
  };
}

export const createSolicitudesDataService = (db: Tx) => {
  const fetchSolicitudes = async (): Promise<ServiceResult<Solicitud[]>> => {
    try {
      const rows = await db
        .select(SOLICITUD_COLUMNS)
        .from(solicitudes)
        .leftJoin(unidades, eq(solicitudes.unidadId, unidades.id))
        .leftJoin(usuarios, eq(solicitudes.usuarioId, usuarios.id))
        .orderBy(desc(solicitudes.createdAt));

      return { success: true, data: rows.map(mapSolicitudRow) };
    } catch (err) {
      logger.error('Excepción inesperada al obtener solicitudes', err);
      return { success: false, error: 'Error inesperado al obtener solicitudes', errorDetails: err };
    }
  };

  const fetchSolicitudById = async (solicitudId: string): Promise<ServiceResult<Solicitud>> => {
    try {
      const [row] = await db
        .select(SOLICITUD_COLUMNS)
        .from(solicitudes)
        .leftJoin(unidades, eq(solicitudes.unidadId, unidades.id))
        .leftJoin(usuarios, eq(solicitudes.usuarioId, usuarios.id))
        .where(eq(solicitudes.id, solicitudId))
        .limit(1);

      if (!row) {
        return { success: false, error: 'Solicitud no encontrada' };
      }

      return { success: true, data: mapSolicitudRow(row) };
    } catch (err) {
      logger.error('Excepción inesperada al obtener la solicitud', err);
      return { success: false, error: 'Error inesperado al obtener la solicitud', errorDetails: err };
    }
  };

  const fetchInventarioDisponible = async (
    solicitud: Pick<Solicitud, 'tipo_alimento' | 'unidad_id'>,
  ): Promise<ServiceResult<InventarioDisponible[]>> => {
    try {
      const termino = solicitud.tipo_alimento.trim();
      if (!termino) {
        return { success: true, data: [] };
      }

      const rows = await db
        .select({
          idEntrada: entradasInventario.idEntrada,
          idDeposito: entradasInventario.idDeposito,
          unidadId: entradasInventario.unidadId,
          cantidadDisponible: entradasInventario.cantidadDisponible,
          fechaIngreso: entradasInventario.fechaIngreso,
          fechaVencimiento: entradasInventario.fechaVencimiento,
          productoNombre: productosDonados.nombreProducto,
          productoUnidadId: productosDonados.unidadId,
          productoUnidadNombre: unidades.nombre,
          productoUnidadSimbolo: unidades.simbolo,
          depositoNombre: depositos.nombre,
        })
        .from(entradasInventario)
        .innerJoin(productosDonados, eq(entradasInventario.idProducto, productosDonados.idProducto))
        .innerJoin(depositos, eq(entradasInventario.idDeposito, depositos.idDeposito))
        .leftJoin(unidades, eq(productosDonados.unidadId, unidades.id))
        .where(
          and(
            ilike(productosDonados.nombreProducto, `%${escapeLikePattern(termino)}%`),
            eq(entradasInventario.estado, 'disponible'),
            gt(entradasInventario.cantidadDisponible, '0'),
          ),
        )
        .orderBy(asc(entradasInventario.fechaIngreso));

      const inventarioFormateado = await Promise.all(
        rows.map(async (row) => {
          const cantidadOriginal = Number(row.cantidadDisponible ?? 0);
          const unidadProductoId = row.unidadId ?? row.productoUnidadId ?? undefined;

          let cantidadDisponible = cantidadOriginal;
          let unidadNombre = row.productoUnidadNombre ?? undefined;
          let unidadSimbolo = row.productoUnidadSimbolo ?? undefined;
          let fueConvertido = false;

          if (solicitud.unidad_id && unidadProductoId && solicitud.unidad_id !== unidadProductoId) {
            const resolution = await obtenerConversion(db, unidadProductoId, solicitud.unidad_id);

            if (resolution.convertible) {
              cantidadDisponible = cantidadOriginal * resolution.factor;
              fueConvertido = true;

              const unidadSolicitud = await obtenerUnidadPorId(db, solicitud.unidad_id);
              if (unidadSolicitud) {
                unidadNombre = unidadSolicitud.nombre ?? undefined;
                unidadSimbolo = unidadSolicitud.simbolo ?? undefined;
              }
            }
          }

          return {
            id: String(row.idEntrada),
            id_deposito: row.idDeposito,
            tipo_alimento: row.productoNombre ?? 'Producto desconocido',
            cantidad_disponible: cantidadDisponible,
            cantidad_disponible_original: cantidadOriginal,
            deposito: row.depositoNombre ?? 'Depósito desconocido',
            fecha_vencimiento: row.fechaVencimiento ?? row.fechaIngreso?.toISOString() ?? null,
            unidad_id: row.unidadId ?? unidadProductoId,
            unidad_nombre: unidadNombre,
            unidad_simbolo: unidadSimbolo,
            unidad_nombre_original: row.productoUnidadNombre ?? undefined,
            unidad_simbolo_original: row.productoUnidadSimbolo ?? undefined,
            fue_convertido: fueConvertido,
          } satisfies InventarioDisponible;
        }),
      );

      return { success: true, data: inventarioFormateado };
    } catch (err) {
      logger.error('Excepción inesperada al cargar inventario', err);
      return { success: false, error: 'Error inesperado al obtener inventario disponible', errorDetails: err };
    }
  };

  return { fetchSolicitudes, fetchSolicitudById, fetchInventarioDisponible };
};

const obtenerUnidadPorId = async (db: Tx, unidadId: number): Promise<{ nombre?: string | null; simbolo?: string | null } | null> => {
  const parsedUnidadId = parsePositiveIntegerValue(unidadId, { name: 'unidadId', min: 1 });
  if (!parsedUnidadId.success) {
    return null;
  }

  const [row] = await db.select({ nombre: unidades.nombre, simbolo: unidades.simbolo }).from(unidades).where(eq(unidades.id, parsedUnidadId.value)).limit(1);
  return row ?? null;
};

const obtenerConversion = async (db: Tx, unidadOrigenId: number, unidadDestinoId: number): Promise<ConversionResolution> => {
  const origen = parsePositiveIntegerValue(unidadOrigenId, { name: 'unidadOrigenId', min: 1 });
  const destino = parsePositiveIntegerValue(unidadDestinoId, { name: 'unidadDestinoId', min: 1 });

  if (!origen.success || !destino.success) {
    return { convertible: false, reason: 'no_conversion' };
  }

  return resolverConversion(db, origen.value, destino.value);
};
