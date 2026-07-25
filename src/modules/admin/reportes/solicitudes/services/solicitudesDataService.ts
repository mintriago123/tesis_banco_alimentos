/**
 * @fileoverview Servicio de datos para solicitudes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConversionResolution } from '@/lib/unidadConversion';
import { resolverConversion } from '@/lib/unidadConversion';
import type {
  InventarioDisponible,
  ServiceResult,
  Solicitud,
  SolicitudUsuario,
  SupabaseInventarioDisponibleRow,
  SupabaseSolicitudRow,
  SupabaseSolicitudUsuario
} from '../types';
import {
  escapeLikePattern,
  parsePositiveIntegerValue,
} from '@/lib/validation-core';

const isDevelopment = process.env.NODE_ENV === 'development';

const logger = {
  info: (message: string, details?: unknown) => {
    if (isDevelopment) {
      console.info(`[SolicitudesDataService] ${message}`, details);
    }
  },
  error: (message: string, error?: unknown) => console.error(`[SolicitudesDataService] ${message}`, error)
};

export const createSolicitudesDataService = (supabaseClient: SupabaseClient) => {
  const fetchSolicitudes = async (): Promise<ServiceResult<Solicitud[]>> => {
    try {
      const { data, error } = await supabaseClient
        .from('solicitudes')
        .select(`
          id,
          usuario_id,
          tipo_alimento,
          cantidad,
          comentarios,
          estado,
          created_at,
          latitud,
          longitud,
          fecha_respuesta,
          comentario_admin,
          unidad_id,
          motivo_rechazo,
          operador_rechazo_id,
          fecha_rechazo,
          operador_aprobacion_id,
          fecha_aprobacion,
          codigo_comprobante,
          unidades:unidad_id (
            id,
            nombre,
            simbolo,
            tipo_magnitud_id,
            es_base,
            es_discreta,
            permite_fraccion
          ),
          usuarios:usuario_id (
            nombre,
            cedula,
            telefono,
            email,
            direccion,
            tipo_persona
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error al consultar solicitudes', error);
        return {
          success: false,
          error: 'No fue posible obtener las solicitudes',
          errorDetails: error
        };
      }

      const solicitudes = ((data ?? []) as SupabaseSolicitudRow[]).map(mapSolicitudRowToDomain);

      return {
        success: true,
        data: solicitudes
      };
    } catch (err) {
      logger.error('Excepción inesperada al obtener solicitudes', err);
      return {
        success: false,
        error: 'Error inesperado al obtener solicitudes',
        errorDetails: err
      };
    }
  };

  const fetchInventarioDisponible = async (solicitud: Pick<Solicitud, 'tipo_alimento' | 'unidad_id'>): Promise<ServiceResult<InventarioDisponible[]>> => {
    try {
      const termino = solicitud.tipo_alimento.trim();
      if (!termino) {
        return {
          success: true,
          data: []
        };
      }

      const { data, error } = await supabaseClient
        .from('entradas_inventario')
        .select(`
          id_entrada,
          id_deposito,
          unidad_id,
          cantidad_disponible,
          fecha_ingreso,
          fecha_vencimiento,
          productos_donados!inner(
            nombre_producto,
            unidad_id,
            unidades(
              id,
              nombre,
              simbolo
            )
          ),
          depositos!inner(
            nombre
          )
        `)
        .ilike('productos_donados.nombre_producto', `%${escapeLikePattern(termino)}%`)
        .eq('estado', 'disponible')
        .gt('cantidad_disponible', 0)
        .order('fecha_ingreso', { ascending: true, nullsFirst: false });

      if (error) {
        logger.error('Error al consultar inventario disponible', error);
        return {
          success: false,
          error: 'No fue posible obtener el inventario disponible',
          errorDetails: error
        };
      }

      const inventarioFormateado = await Promise.all(
        ((data ?? []) as SupabaseInventarioDisponibleRow[]).map(row =>
          mapInventarioDisponibleRowToDomain(supabaseClient, row, solicitud.unidad_id)
        )
      );

      return {
        success: true,
        data: inventarioFormateado
      };
    } catch (err) {
      logger.error('Excepción inesperada al cargar inventario', err);
      return {
        success: false,
        error: 'Error inesperado al obtener inventario disponible',
        errorDetails: err
      };
    }
  };

  return {
    fetchSolicitudes,
    fetchInventarioDisponible
  };
};

const mapSolicitudRowToDomain = (row: SupabaseSolicitudRow): Solicitud => ({
  id: row.id,
  usuario_id: row.usuario_id,
  tipo_alimento: row.tipo_alimento ?? 'Producto desconocido',
  cantidad: row.cantidad ?? 0,
  comentarios: row.comentarios ?? undefined,
  estado: row.estado,
  created_at: row.created_at,
  latitud: row.latitud ?? undefined,
  longitud: row.longitud ?? undefined,
  fecha_respuesta: row.fecha_respuesta ?? undefined,
  comentario_admin: row.comentario_admin ?? undefined,
  unidad_id: row.unidad_id ?? undefined,
  motivo_rechazo: row.motivo_rechazo ?? undefined,
  operador_rechazo_id: row.operador_rechazo_id ?? undefined,
  fecha_rechazo: row.fecha_rechazo ?? undefined,
  operador_aprobacion_id: row.operador_aprobacion_id ?? undefined,
  fecha_aprobacion: row.fecha_aprobacion ?? undefined,
  unidades: mapSolicitudUnidad(row.unidades),
  usuarios: mapSolicitudUsuario(row.usuarios),
  codigo_comprobante: row.codigo_comprobante ?? undefined
});

const mapSolicitudUsuario = (usuario: SupabaseSolicitudUsuario | null): SolicitudUsuario | null => {
  if (!usuario) {
    return null;
  }

  return {
    nombre: usuario.nombre ?? 'N/A',
    cedula: usuario.cedula ?? 'N/A',
    telefono: usuario.telefono ?? 'N/A',
    email: usuario.email ?? undefined,
    direccion: usuario.direccion ?? undefined,
    tipo_persona: usuario.tipo_persona ?? undefined
  };
};

const mapSolicitudUnidad = (unidad: unknown): import('../types').SolicitudUnidad | null => {
  const normalized = normalizeRelation(unidad);
  
  if (!normalized || typeof normalized !== 'object') {
    return null;
  }

  const u = normalized as { 
    id?: number | null;
    nombre?: string | null;
    simbolo?: string | null;
    tipo_magnitud_id?: number | null;
    es_base?: boolean | null;
    es_discreta?: boolean | null;
    permite_fraccion?: boolean | null;
  };

  if (!u.id || !u.nombre || !u.simbolo || u.tipo_magnitud_id === null || u.tipo_magnitud_id === undefined) {
    return null;
  }

  return {
    id: u.id,
    nombre: u.nombre,
    simbolo: u.simbolo,
    tipo_magnitud_id: u.tipo_magnitud_id,
    es_base: u.es_base ?? false,
    es_discreta: u.es_discreta ?? undefined,
    permite_fraccion: u.permite_fraccion ?? undefined,
  };
};

const normalizeRelation = <T>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }

  return (value ?? null) as T | null;
};

const mapInventarioDisponibleRowToDomain = (
  supabaseClient: SupabaseClient,
  row: SupabaseInventarioDisponibleRow,
  unidadSolicitudId?: number
): Promise<InventarioDisponible> => {
  return mapInventarioDisponibleRowToDomainInternal(supabaseClient, row, unidadSolicitudId);
};

const mapInventarioDisponibleRowToDomainInternal = async (
  supabaseClient: SupabaseClient,
  row: SupabaseInventarioDisponibleRow,
  unidadSolicitudId?: number
): Promise<InventarioDisponible> => {
  const producto = normalizeRelation(row.productos_donados);
  const deposito = normalizeRelation(row.depositos);
  const unidad = producto?.unidades ? normalizeRelation(producto.unidades) : null;
  const cantidadOriginal = row.cantidad_disponible ?? 0;
  const unidadProductoId = row.unidad_id ?? producto?.unidad_id ?? undefined;

  let cantidadDisponible = cantidadOriginal;
  let unidadNombre = unidad?.nombre ?? undefined;
  let unidadSimbolo = unidad?.simbolo ?? undefined;
  let fueConvertido = false;

  if (unidadSolicitudId && unidadProductoId && unidadSolicitudId !== unidadProductoId) {
    const resolution = await obtenerConversion(
      supabaseClient,
      unidadProductoId,
      unidadSolicitudId
    );

    if (resolution.convertible) {
      cantidadDisponible = cantidadOriginal * resolution.factor;
      fueConvertido = true;

      const unidadSolicitud = await obtenerUnidadPorId(supabaseClient, unidadSolicitudId);
      if (unidadSolicitud) {
        unidadNombre = unidadSolicitud.nombre ?? undefined;
        unidadSimbolo = unidadSolicitud.simbolo ?? undefined;
      }
    }
  }

  return {
    id: String(row.id_entrada),
    id_deposito: row.id_deposito,
    tipo_alimento: producto?.nombre_producto ?? 'Producto desconocido',
    cantidad_disponible: cantidadDisponible,
    cantidad_disponible_original: cantidadOriginal,
    deposito: deposito?.nombre ?? 'Depósito desconocido',
    fecha_vencimiento: row.fecha_vencimiento ?? row.fecha_ingreso ?? null,
    unidad_id: row.unidad_id ?? unidadProductoId,
    unidad_nombre: unidadNombre,
    unidad_simbolo: unidadSimbolo,
    unidad_nombre_original: unidad?.nombre ?? undefined,
    unidad_simbolo_original: unidad?.simbolo ?? undefined,
    fue_convertido: fueConvertido
  };
};

const obtenerUnidadPorId = async (
  supabaseClient: SupabaseClient,
  unidadId: number
): Promise<{ nombre?: string | null; simbolo?: string | null } | null> => {
  const parsedUnidadId = parsePositiveIntegerValue(unidadId, { name: 'unidadId', min: 1 });
  if (!parsedUnidadId.success) {
    return null;
  }

  const { data, error } = await supabaseClient
    .from('unidades')
    .select('nombre, simbolo')
    .eq('id', parsedUnidadId.value)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
};

const obtenerConversion = async (
  supabaseClient: SupabaseClient,
  unidadOrigenId: number,
  unidadDestinoId: number
): Promise<ConversionResolution> => {
  const origen = parsePositiveIntegerValue(unidadOrigenId, { name: 'unidadOrigenId', min: 1 });
  const destino = parsePositiveIntegerValue(unidadDestinoId, { name: 'unidadDestinoId', min: 1 });

  if (!origen.success || !destino.success) {
    return { convertible: false, reason: 'no_conversion' };
  }

  return resolverConversion(supabaseClient, origen.value, destino.value);
};
