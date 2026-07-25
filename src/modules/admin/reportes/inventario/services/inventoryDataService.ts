/**
 * @fileoverview Servicio de datos para inventario.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InventarioItem,
  Deposito,
  ServiceResult,
  SupabaseInventarioRow,
} from '../types';
const isDevelopment = process.env.NODE_ENV === 'development';

const logger = {
  info: (message: string, details?: unknown) => {
    if (isDevelopment) {
      console.info(`[InventoryDataService] ${message}`, details);
    }
  },
  error: (message: string, error?: unknown) => console.error(`[InventoryDataService] ${message}`, error)
};

export const createInventoryDataService = (supabaseClient: SupabaseClient) => {
  const fetchInventario = async (): Promise<ServiceResult<InventarioItem[]>> => {
    try {
      const { data, error } = await supabaseClient
        .from('entradas_inventario')
        .select(`
          id_entrada,
          id_deposito,
          id_producto,
          unidad_id,
          cantidad_disponible,
          fecha_ingreso,
          fecha_vencimiento,
          updated_at,
          depositos!inner(
            id_deposito,
            nombre,
            descripcion
          ),
          productos:productos_donados!inner(
            id_producto,
            id_usuario,
            nombre_producto,
            descripcion,
            unidad_id,
            alimento_id,
            unidades:unidades(
              id,
              nombre,
              simbolo
            ),
            alimentos:alimentos(
              id,
              nombre,
              categoria
            )
          )
        `)
        .eq('estado', 'disponible')
        .gt('cantidad_disponible', 0)
        .order('updated_at', { ascending: false });

      if (error) {
        logger.error('Error consultando inventario', error);
        return {
          success: false,
          error: 'Error al cargar el inventario',
          errorDetails: error
        };
      }

      const inventarioRows = (data ?? []) as SupabaseInventarioRow[];
      const inventario = inventarioRows.map(row => mapInventarioRowToDomain(row));

      return {
        success: true,
        data: inventario
      };
    } catch (error) {
      logger.error('Excepción obteniendo inventario', error);
      return {
        success: false,
        error: 'Error inesperado al cargar inventario',
        errorDetails: error
      };
    }
  };

  const fetchDepositos = async (): Promise<ServiceResult<Deposito[]>> => {
    try {
      const { data, error } = await supabaseClient
        .from('depositos')
        .select('id_deposito, nombre, descripcion')
        .eq('activo', true)
        .order('nombre', { ascending: true });

      if (error) {
        logger.error('Error consultando depósitos', error);
        return {
          success: false,
          error: 'Error al cargar los depósitos',
          errorDetails: error
        };
      }

      return {
        success: true,
        data: data || []
      };
    } catch (error) {
      logger.error('Excepción obteniendo depósitos', error);
      return {
        success: false,
        error: 'Error inesperado al cargar depósitos',
        errorDetails: error
      };
    }
  };

  return {
    fetchInventario,
    fetchDepositos
  };
};

const normalizeRelation = <T>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }

  return (value ?? null) as T | null;
};

const mapInventarioRowToDomain = (
  row: SupabaseInventarioRow
): InventarioItem => {
  const deposito = normalizeRelation(row.depositos);
  const producto = normalizeRelation(row.productos);

  // Normalizar la información de unidad
  const unidadInfo = producto?.unidades;
  const unidadNormalizada = unidadInfo 
    ? (Array.isArray(unidadInfo) ? unidadInfo[0] : unidadInfo)
    : null;

  // Normalizar la información del alimento
  const alimentoInfo = producto?.alimentos;
  const alimentoNormalizado = alimentoInfo 
    ? (Array.isArray(alimentoInfo) ? alimentoInfo[0] : alimentoInfo)
    : null;

  return {
    id_entrada: row.id_entrada,
    id_deposito: deposito?.id_deposito ?? row.id_deposito,
    id_producto: row.id_producto,
    cantidad_disponible: row.cantidad_disponible ?? 0,
    fecha_actualizacion: row.updated_at ?? row.fecha_ingreso ?? null,
    deposito: {
      id_deposito: deposito?.id_deposito ?? row.id_deposito,
      nombre: deposito?.nombre ?? 'Sin depósito',
      descripcion: deposito?.descripcion ?? null
    },
    producto: {
      id_producto: producto?.id_producto ?? row.id_producto,
      nombre_producto: producto?.nombre_producto ?? 'Sin nombre',
      descripcion: producto?.descripcion ?? null,
      categoria: alimentoNormalizado?.categoria ?? null,
      unidad_id: row.unidad_id ?? producto?.unidad_id ?? null,
      unidad_nombre: unidadNormalizada?.nombre ?? null,
      unidad_simbolo: unidadNormalizada?.simbolo ?? null,
      fecha_caducidad: row.fecha_vencimiento ?? null,
      fecha_donacion: row.fecha_ingreso ?? null
    }
  };
};
