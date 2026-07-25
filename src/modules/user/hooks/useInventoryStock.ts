/**
 * @fileoverview Hook para obtener información de stock disponible en tiempo real
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createInventoryStockService,
  type StockSummary,
  type StockUnitSummary,
} from '../services/inventoryStockService';
import type { ConversionData } from '@/lib/unidadConversion';
import { redondear, resolverConversionLocal } from '@/lib/unidadConversion';

type LoadingState = 'idle' | 'loading' | 'success' | 'error';

type UnidadRelation = {
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

const singleRelation = <T>(relation: T | T[] | null | undefined): T | null => {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }
  return relation ?? null;
};

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

type StockInfoForUnits = Pick<
  StockSummary,
  'unidades_disponibles' | 'unidad_id' | 'unidad_nombre' | 'unidad_simbolo' | 'total_disponible' | 'depositos'
>;

const obtenerUnidadesDisponibles = (stockInfo: StockInfoForUnits): StockUnitSummary[] => {
  if (stockInfo.unidades_disponibles.length > 0) {
    return stockInfo.unidades_disponibles;
  }

  if (!stockInfo.unidad_id) return [];

  return [{
    unidad_id: stockInfo.unidad_id,
    unidad_nombre: stockInfo.unidad_nombre,
    unidad_simbolo: stockInfo.unidad_simbolo,
    cantidad_disponible: stockInfo.total_disponible,
    cantidad_formateada: {
      cantidad: stockInfo.total_disponible,
      simbolo: stockInfo.unidad_simbolo ?? '',
      unidad_nombre: stockInfo.unidad_nombre ?? '',
      cantidad_original: stockInfo.total_disponible,
      simbolo_original: stockInfo.unidad_simbolo ?? '',
      fue_convertido: false,
    },
    depositos: stockInfo.depositos,
  }];
};

interface StockForRequestedUnit {
  cantidad_disponible: number;
  simbolo: string;
  unidad_nombre: string;
}

const obtenerStockParaUnidad = (
  stockInfo: StockInfoForUnits,
  simboloUnidad: string,
  conversiones: ConversionData[],
): StockForRequestedUnit | null => {
  const unidadesDisponibles = obtenerUnidadesDisponibles(stockInfo);
  const simboloNormalizado = simboloUnidad.toLowerCase();
  const unidadSolicitadaId = unidadesDisponibles.find(
    unidad => unidad.unidad_simbolo?.toLowerCase() === simboloNormalizado,
  )?.unidad_id ?? obtenerUnidadIdPorSimbolo(simboloUnidad, conversiones);

  if (!unidadSolicitadaId) return null;

  let cantidadDisponible = 0;
  let simboloResultado = simboloUnidad;
  let nombreResultado = '';
  let encontroUnidadCompatible = false;

  for (const unidad of unidadesDisponibles) {
    if (unidad.unidad_simbolo?.toLowerCase() === simboloNormalizado) {
      cantidadDisponible += unidad.cantidad_disponible;
      simboloResultado = unidad.unidad_simbolo ?? simboloUnidad;
      nombreResultado = unidad.unidad_nombre ?? nombreResultado;
      encontroUnidadCompatible = true;
      continue;
    }

    const conversion = resolverConversionLocal(
      unidad.unidad_id,
      unidadSolicitadaId,
      conversiones,
    );
    if (!conversion.convertible) continue;

    cantidadDisponible += unidad.cantidad_disponible * conversion.factor;
    encontroUnidadCompatible = true;
  }

  if (!encontroUnidadCompatible) return null;

  return {
    cantidad_disponible: cantidadDisponible,
    simbolo: simboloResultado,
    unidad_nombre: nombreResultado,
  };
};

export const getUnitCompatibilityMessage = (
  stockInfo: (Pick<StockSummary, 'producto_encontrado'> & StockInfoForUnits) | null,
  conversiones: ConversionData[],
  simboloUnidad?: string,
): string | null => {
  if (!stockInfo?.producto_encontrado || !simboloUnidad) {
    return null;
  }

  const unidadesDisponibles = obtenerUnidadesDisponibles(stockInfo);
  if (unidadesDisponibles.some(
    unidad => unidad.unidad_simbolo?.toLowerCase() === simboloUnidad.toLowerCase(),
  )) {
    return null;
  }

  if (!obtenerStockParaUnidad(stockInfo, simboloUnidad, conversiones)) {
    const unidadesTexto = unidadesDisponibles
      .map(unidad => unidad.unidad_simbolo || unidad.unidad_nombre || 'unidad')
      .join(', ');
    return `No existe una conversión registrada de ${simboloUnidad} a las unidades disponibles (${unidadesTexto}).`;
  }

  return null;
};

interface UseInventoryStockResult {
  stockInfo: StockSummary | null;
  loadingState: LoadingState;
  errorMessage?: string;
  conversiones: ConversionData[];
  checkStock: (nombreProducto: string) => Promise<void>;
  clearStock: () => void;
  isStockSufficient: (cantidadSolicitada: number, simboloUnidad?: string) => boolean;
  getUnitCompatibilityMessage: (simboloUnidad?: string) => string | null;
  getStockMessage: (cantidadSolicitada?: number, simboloUnidad?: string) => string;
}

export const useInventoryStock = (supabaseClient: SupabaseClient): UseInventoryStockResult => {
  const [stockInfo, setStockInfo] = useState<StockSummary | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [conversiones, setConversiones] = useState<ConversionData[]>([]);

  const service = useMemo(
    () => createInventoryStockService(supabaseClient),
    [supabaseClient]
  );

  // Cargar conversiones al montar
  useEffect(() => {
    const cargarConversiones = async () => {
      try {
        const { data } = await supabaseClient
          .from('conversiones')
          .select(`
          unidad_origen_id,
          unidad_destino_id,
          factor_conversion,
          unidad_origen:unidades!conversiones_unidad_origen_id_fkey(nombre, simbolo),
          unidad_destino:unidades!conversiones_unidad_destino_id_fkey(nombre, simbolo)
          `)
          .eq('activo', true);

        if (data) {
          const conversionesData = (data as ConversionRow[]).flatMap(row => {
            const unidadOrigen = singleRelation(row.unidad_origen);
            const unidadDestino = singleRelation(row.unidad_destino);
            const factor = Number(row.factor_conversion);

            if (
              !Number.isInteger(row.unidad_origen_id) ||
              !Number.isInteger(row.unidad_destino_id) ||
              !Number.isFinite(factor) ||
              factor <= 0 ||
              !unidadOrigen?.simbolo ||
              !unidadDestino?.simbolo
            ) {
              return [];
            }

            return [{
              unidad_origen_id: row.unidad_origen_id,
              unidad_destino_id: row.unidad_destino_id,
              unidad_origen: unidadOrigen?.nombre || '',
              simbolo_origen: unidadOrigen?.simbolo || '',
              unidad_destino: unidadDestino?.nombre || '',
              simbolo_destino: unidadDestino?.simbolo || '',
              factor_conversion: factor,
              activo: row.activo ?? false,
            }];
          });
          setConversiones(conversionesData);
        }
      } catch (error) {
        console.error('[useInventoryStock] Error cargando conversiones:', error);
      }
    };

    cargarConversiones();
  }, [supabaseClient]);

  const checkStock = useCallback(async (nombreProducto: string) => {
    if (!nombreProducto.trim()) {
      setStockInfo(null);
      setLoadingState('idle');
      setErrorMessage(undefined);
      return;
    }

    setLoadingState('loading');
    setErrorMessage(undefined);

    const result = await service.getStockByProductName(nombreProducto);

    if (result.success && result.data) {
      setStockInfo(result.data);
      setLoadingState('success');
    } else {
      setStockInfo(null);
      setLoadingState('error');
      setErrorMessage(result.error || 'Error consultando inventario');
    }
  }, [service]);

  const clearStock = useCallback(() => {
    setStockInfo(null);
    setLoadingState('idle');
    setErrorMessage(undefined);
  }, []);

  const isStockSufficient = useCallback((
    cantidadSolicitada: number, 
    simboloUnidad?: string
  ): boolean => {
    if (!stockInfo || cantidadSolicitada <= 0) return false;

    if (!simboloUnidad) {
      return stockInfo.total_calculable && stockInfo.total_disponible >= cantidadSolicitada;
    }

    if (getUnitCompatibilityMessage(stockInfo, conversiones, simboloUnidad)) {
      return false;
    }

    const stockParaUnidad = obtenerStockParaUnidad(stockInfo, simboloUnidad, conversiones);
    return Boolean(
      stockParaUnidad && stockParaUnidad.cantidad_disponible >= cantidadSolicitada,
    );
  }, [stockInfo, conversiones]);

  const unitCompatibilityMessage = useCallback(
    (simboloUnidad?: string): string | null =>
      getUnitCompatibilityMessage(stockInfo, conversiones, simboloUnidad),
    [stockInfo, conversiones],
  );

  const getStockMessage = useCallback((cantidadSolicitada?: number, simboloUnidad?: string): string => {
    if (!stockInfo) return '';

    if (!stockInfo.producto_encontrado) {
      return 'Producto no disponible en inventario';
    }

    const unidadesDisponibles = obtenerUnidadesDisponibles(stockInfo);
    if (unidadesDisponibles.length === 0) {
      return 'Sin stock disponible';
    }

    const resumenPorUnidad = unidadesDisponibles
      .map(unidad => `${unidad.cantidad_formateada.cantidad} ${unidad.unidad_simbolo || unidad.unidad_nombre || 'unidades'}`)
      .join(', ');

    if (!cantidadSolicitada || cantidadSolicitada <= 0 || !simboloUnidad) {
      return `Stock disponible por unidad: ${resumenPorUnidad}`;
    }

    const stockParaUnidad = obtenerStockParaUnidad(stockInfo, simboloUnidad, conversiones);
    if (!stockParaUnidad) {
      return `Stock disponible por unidad: ${resumenPorUnidad}. No existe una conversión registrada para ${simboloUnidad}.`;
    }

    const baseMessage = `${redondear(stockParaUnidad.cantidad_disponible)} ${simboloUnidad} disponibles`;
    if (stockParaUnidad.cantidad_disponible >= cantidadSolicitada) {
      return `✓ ${baseMessage} (suficiente)`;
    }

    const faltante = cantidadSolicitada - stockParaUnidad.cantidad_disponible;
    return `⚠️ ${baseMessage} (faltan ${redondear(faltante)} ${simboloUnidad})`;
  }, [stockInfo, conversiones]);

  // Efecto para limpiar cuando cambia el cliente de Supabase
  useEffect(() => {
    return () => {
      setStockInfo(null);
      setLoadingState('idle');
      setErrorMessage(undefined);
    };
  }, [supabaseClient]);

  return {
    stockInfo,
    loadingState,
    errorMessage,
    conversiones,
    checkStock,
    clearStock,
    isStockSufficient,
    getUnitCompatibilityMessage: unitCompatibilityMessage,
    getStockMessage
  };
};
