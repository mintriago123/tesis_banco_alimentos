/**
 * Consulta de stock sin sumar saldos de unidades no equivalentes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CantidadFormateada, ConversionData } from '@/lib/unidadConversion';
import {
  aplicarConversion,
  redondear,
  resolverConversionLocal,
} from '@/lib/unidadConversion';
import {
  escapeLikePattern,
  parseFiniteNumberValue,
  parseOptionalTextValue,
} from '@/lib/validation-core';

export type StockStatus =
  | 'sin_stock'
  | 'disponible'
  | 'stock_en_otra_unidad'
  | 'unidades_no_convertibles';

export interface StockInfo {
  id_entrada: string;
  id_deposito: string;
  cantidad_disponible: number;
  deposito: string;
  fecha_actualizacion: string | null;
  unidad_id?: number;
  unidad_nombre?: string;
  unidad_simbolo?: string;
  cantidad_formateada?: CantidadFormateada;
}

export interface StockSummary {
  /** Es cero cuando no existe una unidad común calculable. */
  total_disponible: number;
  total_calculable: boolean;
  depositos: StockInfo[];
  producto_encontrado: boolean;
  estado_stock: StockStatus;
  unidad_id?: number;
  unidad_nombre?: string;
  unidad_simbolo?: string;
  total_formateado?: CantidadFormateada;
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

type UnidadRelation = {
  id?: number | null;
  nombre?: string | null;
  simbolo?: string | null;
} | null;

type ConversionRow = {
  unidad_origen_id: number;
  unidad_destino_id: number;
  factor_conversion: number | string | null;
  activo: boolean | null;
  unidad_origen: UnidadRelation | UnidadRelation[];
  unidad_destino: UnidadRelation | UnidadRelation[];
};

type StockInventarioRow = {
  id_entrada: string;
  id_deposito: string;
  cantidad_disponible: number | null;
  fecha_ingreso: string | null;
  unidad_id: number | null;
  productos_donados: {
    id_producto?: string | null;
    nombre_producto?: string | null;
    unidad_id?: number | null;
    unidades?: UnidadRelation | UnidadRelation[];
  } | null;
  depositos: {
    nombre?: string | null;
  } | null;
};

const singleRelation = <T>(relation: T | T[] | null | undefined): T | null => {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }
  return relation ?? null;
};

const isDevelopment = process.env.NODE_ENV === 'development';

const logger = {
  info: (message: string, details?: unknown) => {
    if (isDevelopment) {
      console.info(`[InventoryStockService] ${message}`, details);
    }
  },
  error: (message: string, error?: unknown) => console.error(`[InventoryStockService] ${message}`, error),
};

const emptySummary = (): StockSummary => ({
  total_disponible: 0,
  total_calculable: false,
  depositos: [],
  producto_encontrado: false,
  estado_stock: 'sin_stock',
});

const crearCantidadFormateada = (
  cantidad: number,
  simbolo: string,
  nombreUnidad: string,
): CantidadFormateada => ({
  cantidad: redondear(cantidad),
  simbolo,
  unidad_nombre: nombreUnidad,
  cantidad_original: cantidad,
  simbolo_original: simbolo,
  fue_convertido: false,
});

const obtenerUnidadIdPorSimbolo = (
  simbolo: string,
  conversiones: ConversionData[],
): number | undefined => {
  const conversion = conversiones.find(item =>
    item.simbolo_origen === simbolo || item.simbolo_destino === simbolo
  );

  if (!conversion) return undefined;
  return conversion.simbolo_origen === simbolo
    ? conversion.unidad_origen_id
    : conversion.unidad_destino_id;
};

export interface StockTotalResolution {
  calculable: boolean;
  cantidad: number;
}

export const calcularTotalPorUnidades = (
  saldos: Pick<StockInfo, 'cantidad_disponible' | 'unidad_id' | 'unidad_simbolo'>[],
  conversiones: ConversionData[],
): StockTotalResolution => {
  const unidadObjetivo = saldos[0];
  if (!unidadObjetivo?.unidad_id) {
    return { calculable: false, cantidad: 0 };
  }

  return saldos.reduce<StockTotalResolution>(
    (resultado, saldo) => {
      if (!resultado.calculable || !saldo.unidad_id) {
        return { calculable: false, cantidad: 0 };
      }

      const resolution = resolverConversionLocal(
        saldo.unidad_id,
        unidadObjetivo.unidad_id as number,
        conversiones,
      );
      if (!resolution.convertible) {
        return { calculable: false, cantidad: 0 };
      }

      return {
        calculable: true,
        cantidad: resultado.cantidad + saldo.cantidad_disponible * resolution.factor,
      };
    },
    { calculable: true, cantidad: 0 },
  );
};

export const createInventoryStockService = (supabaseClient: SupabaseClient) => {
  const obtenerConversiones = async (): Promise<ConversionData[]> => {
    const { data, error } = await supabaseClient
      .from('conversiones')
      .select(`
        unidad_origen_id,
        unidad_destino_id,
        factor_conversion,
        activo,
        unidad_origen:unidades!conversiones_unidad_origen_id_fkey(id, nombre, simbolo),
        unidad_destino:unidades!conversiones_unidad_destino_id_fkey(id, nombre, simbolo)
      `)
      .eq('activo', true);

    if (error || !data) {
      logger.error('Error obteniendo conversiones', error);
      return [];
    }

    return (data as ConversionRow[]).flatMap(row => {
      const unidadOrigen = singleRelation(row.unidad_origen);
      const unidadDestino = singleRelation(row.unidad_destino);
      const factor = Number(row.factor_conversion);

      if (
        !unidadOrigen?.id ||
        !unidadDestino?.id ||
        !unidadOrigen.simbolo ||
        !unidadDestino.simbolo ||
        !Number.isFinite(factor) ||
        factor <= 0
      ) {
        return [];
      }

      return [{
        unidad_origen_id: row.unidad_origen_id,
        unidad_destino_id: row.unidad_destino_id,
        unidad_origen: unidadOrigen.nombre ?? '',
        simbolo_origen: unidadOrigen.simbolo,
        unidad_destino: unidadDestino.nombre ?? '',
        simbolo_destino: unidadDestino.simbolo,
        factor_conversion: factor,
        activo: row.activo ?? false,
      }];
    });
  };

  const getStockByProductName = async (nombreProducto: string): Promise<ServiceResult<StockSummary>> => {
    const nombre = parseOptionalTextValue(nombreProducto, {
      name: 'nombreProducto',
      maxLength: 150,
    });

    if (!nombre.success) {
      return { success: false, error: nombre.error };
    }

    if (!nombre.value) {
      return { success: true, data: emptySummary() };
    }

    try {
      const conversiones = await obtenerConversiones();
      const { data, error } = await supabaseClient
        .from('entradas_inventario')
        .select(`
          id_entrada,
          id_deposito,
          unidad_id,
          cantidad_disponible,
          fecha_ingreso,
          productos_donados!inner(
            id_producto,
            nombre_producto,
            unidad_id,
            unidades!inner(id, nombre, simbolo)
          ),
          depositos!inner(nombre)
        `)
        .ilike('productos_donados.nombre_producto', `%${escapeLikePattern(nombre.value)}%`)
        .order('cantidad_disponible', { ascending: false });

      if (error) {
        logger.error('Error consultando stock disponible', error);
        return { success: false, error: 'No fue posible consultar el inventario' };
      }

      if (!data || data.length === 0) {
        return { success: true, data: emptySummary() };
      }

      const stockPorDepositoYUnidad = new Map<string, StockInfo>();

      for (const row of data as StockInventarioRow[]) {
        const producto = singleRelation(row.productos_donados);
        const unidad = singleRelation(producto?.unidades);
        const cantidad = Number(row.cantidad_disponible ?? 0);
        if (!Number.isFinite(cantidad) || cantidad <= 0 || !producto?.unidad_id) {
          continue;
        }

        const deposito = singleRelation(row.depositos);
        const key = `${row.id_deposito}:${producto.unidad_id}`;
        const existente = stockPorDepositoYUnidad.get(key);
        if (existente) {
          existente.cantidad_disponible += cantidad;
          existente.cantidad_formateada = crearCantidadFormateada(
            existente.cantidad_disponible,
            existente.unidad_simbolo ?? '',
            existente.unidad_nombre ?? '',
          );
          if (
            row.fecha_ingreso &&
            (!existente.fecha_actualizacion || row.fecha_ingreso > existente.fecha_actualizacion)
          ) {
            existente.fecha_actualizacion = row.fecha_ingreso;
          }
          continue;
        }

        stockPorDepositoYUnidad.set(key, {
          id_entrada: row.id_entrada,
          id_deposito: row.id_deposito,
          cantidad_disponible: cantidad,
          deposito: deposito?.nombre ?? 'Sin depósito',
          fecha_actualizacion: row.fecha_ingreso,
          unidad_id: row.unidad_id ?? producto.unidad_id,
          unidad_nombre: unidad?.nombre ?? undefined,
          unidad_simbolo: unidad?.simbolo ?? undefined,
          cantidad_formateada: crearCantidadFormateada(
            cantidad,
            unidad?.simbolo ?? '',
            unidad?.nombre ?? '',
          ),
        });
      }

      const depositos = [...stockPorDepositoYUnidad.values()];
      if (depositos.length === 0) {
        return {
          success: true,
          data: {
            ...emptySummary(),
            producto_encontrado: true,
          },
        };
      }

      const unidadObjetivo = depositos[0];
      const total = calcularTotalPorUnidades(depositos, conversiones);

      const summary: StockSummary = {
        total_disponible: total.calculable ? total.cantidad : 0,
        total_calculable: total.calculable,
        depositos,
        producto_encontrado: true,
        estado_stock: total.calculable ? 'disponible' : 'unidades_no_convertibles',
        unidad_id: unidadObjetivo.unidad_id,
        unidad_nombre: unidadObjetivo.unidad_nombre,
        unidad_simbolo: unidadObjetivo.unidad_simbolo,
        total_formateado: total.calculable
          ? crearCantidadFormateada(
              total.cantidad,
              unidadObjetivo.unidad_simbolo ?? '',
              unidadObjetivo.unidad_nombre ?? '',
            )
          : undefined,
      };

      return { success: true, data: summary };
    } catch (error) {
      logger.error('Excepción consultando stock', error);
      return { success: false, error: 'Error inesperado al consultar inventario' };
    }
  };

  const checkStockSufficiency = async (
    nombreProducto: string,
    cantidadSolicitada: number,
  ): Promise<ServiceResult<{ sufficient: boolean; available: number; missing: number }>> => {
    const cantidad = parseFiniteNumberValue(cantidadSolicitada, {
      name: 'cantidadSolicitada',
      min: 0,
    });
    if (!cantidad.success || cantidad.value <= 0) {
      return {
        success: false,
        error: cantidad.success ? 'cantidadSolicitada debe ser mayor a 0.' : cantidad.error,
      };
    }

    const stockResult = await getStockByProductName(nombreProducto);
    if (!stockResult.success || !stockResult.data) {
      return { success: false, error: stockResult.error || 'Error verificando stock' };
    }

    if (!stockResult.data.total_calculable) {
      return { success: false, error: 'El stock está separado en unidades no convertibles' };
    }

    const available = stockResult.data.total_disponible;
    return {
      success: true,
      data: {
        sufficient: available >= cantidad.value,
        available,
        missing: available >= cantidad.value ? 0 : cantidad.value - available,
      },
    };
  };

  const checkStockSufficiencyWithConversion = async (
    nombreProducto: string,
    cantidadSolicitada: number,
    simboloUnidadSolicitada: string,
  ): Promise<ServiceResult<{
    sufficient: boolean;
    available: number;
    availableSymbol: string;
    requested: number;
    requestedSymbol: string;
    requestedInBaseUnit: number;
    missing: number;
  }>> => {
    const cantidad = parseFiniteNumberValue(cantidadSolicitada, {
      name: 'cantidadSolicitada',
      min: 0,
    });
    if (!cantidad.success || cantidad.value <= 0) {
      return {
        success: false,
        error: cantidad.success ? 'cantidadSolicitada debe ser mayor a 0.' : cantidad.error,
      };
    }

    const stockResult = await getStockByProductName(nombreProducto);
    if (!stockResult.success || !stockResult.data) {
      return { success: false, error: stockResult.error || 'Error verificando stock' };
    }

    const stockData = stockResult.data;
    if (!stockData.total_calculable) {
      return { success: false, error: 'El stock está separado en unidades no convertibles' };
    }

    const conversiones = await obtenerConversiones();
    const unidadOrigenId = obtenerUnidadIdPorSimbolo(simboloUnidadSolicitada, conversiones);
    const unidadDestinoId = stockData.unidad_id;
    if (!unidadOrigenId || !unidadDestinoId) {
      return {
        success: false,
        error: `No se puede resolver la unidad ${simboloUnidadSolicitada}`,
      };
    }

    const conversion = aplicarConversion(
      cantidad.value,
      resolverConversionLocal(unidadOrigenId, unidadDestinoId, conversiones),
    );
    if (!conversion.success) {
      return {
        success: false,
        error: `No se puede convertir de ${simboloUnidadSolicitada} a ${stockData.unidad_simbolo ?? ''}`,
      };
    }

    const sufficient = stockData.total_disponible >= conversion.cantidad;
    return {
      success: true,
      data: {
        sufficient,
        available: stockData.total_disponible,
        availableSymbol: stockSymbol,
        requested: cantidad.value,
        requestedSymbol: simboloUnidadSolicitada,
        requestedInBaseUnit: conversion.cantidad,
        missing: sufficient ? 0 : conversion.cantidad - stockData.total_disponible,
      },
    };
  };

  return {
    getStockByProductName,
    checkStockSufficiency,
    checkStockSufficiencyWithConversion,
  };
};
