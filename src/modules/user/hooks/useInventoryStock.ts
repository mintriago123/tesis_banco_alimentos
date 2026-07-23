/**
 * @fileoverview Hook para obtener información de stock disponible en tiempo real
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createInventoryStockService, type StockSummary } from '../services/inventoryStockService';
import type { ConversionData } from '@/lib/unidadConversion';
import { convertirEntreUnidades } from '@/lib/unidadConversion';

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

interface UseInventoryStockResult {
  stockInfo: StockSummary | null;
  loadingState: LoadingState;
  errorMessage?: string;
  conversiones: ConversionData[];
  checkStock: (nombreProducto: string) => Promise<void>;
  clearStock: () => void;
  isStockSufficient: (cantidadSolicitada: number, simboloUnidad?: string) => boolean;
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
    if (!stockInfo || !stockInfo.total_calculable || cantidadSolicitada <= 0) return false;
    
    const stockSymbol = stockInfo.unidad_simbolo || '';
    
    // Si no se proporciona unidad o son iguales, comparación directa
    if (!simboloUnidad || simboloUnidad === stockSymbol) {
      return stockInfo.total_disponible >= cantidadSolicitada;
    }
    
    // Convertir la cantidad solicitada a la unidad base del stock
    const cantidadConvertida = convertirEntreUnidades(
      cantidadSolicitada,
      simboloUnidad,
      stockSymbol,
      conversiones
    );

    if (!cantidadConvertida.success) {
      console.error(`[useInventoryStock] No se pudo convertir de ${simboloUnidad} a ${stockSymbol}`);
      return false;
    }

    return stockInfo.total_disponible >= cantidadConvertida.cantidad;
  }, [stockInfo, conversiones]);

  const getStockMessage = useCallback((cantidadSolicitada?: number, simboloUnidad?: string): string => {
    if (!stockInfo) return '';

    if (!stockInfo.producto_encontrado) {
      return 'Producto no disponible en inventario';
    }

    if (!stockInfo.total_calculable) {
      const hayStockEnOtraUnidad = Boolean(
        simboloUnidad &&
        stockInfo.depositos.length > 0 &&
        stockInfo.depositos.every(deposito => deposito.unidad_simbolo !== simboloUnidad)
      );
      if (hayStockEnOtraUnidad) {
        return `Hay stock disponible en otra unidad, pero no existe conversión explícita a ${simboloUnidad}`;
      }
      return 'Hay stock disponible en unidades separadas que no tienen equivalencia registrada';
    }

    if (stockInfo.total_disponible === 0) {
      return 'Sin stock disponible';
    }

    // Usar la cantidad formateada si está disponible
    const cantidadTexto = stockInfo.total_formateado 
      ? `${stockInfo.total_formateado.cantidad} ${stockInfo.total_formateado.simbolo}`
      : `${stockInfo.total_disponible} ${stockInfo.unidad_simbolo || 'unidades'}`;
    
    const baseMessage = `${cantidadTexto} disponibles`;
    
    if (cantidadSolicitada && cantidadSolicitada > 0 && simboloUnidad) {
      const stockSymbol = stockInfo.unidad_simbolo || '';
      
      // Si son la misma unidad, comparación directa
      if (simboloUnidad === stockSymbol) {
        if (stockInfo.total_disponible >= cantidadSolicitada) {
          return `✓ ${baseMessage} (suficiente)`;
        } else {
          const faltante = cantidadSolicitada - stockInfo.total_disponible;
          return `⚠️ ${baseMessage} (faltan ${faltante.toFixed(2)} ${simboloUnidad})`;
        }
      }
      
      // Necesitamos convertir
      const cantidadConvertida = convertirEntreUnidades(
        cantidadSolicitada,
        simboloUnidad,
        stockSymbol,
        conversiones
      );

      if (!cantidadConvertida.success) {
        return `${baseMessage} (no se puede convertir de ${simboloUnidad} a ${stockSymbol})`;
      }

      if (stockInfo.total_disponible >= cantidadConvertida.cantidad) {
        return `✓ ${baseMessage} (suficiente para ${cantidadSolicitada} ${simboloUnidad})`;
      } else {
        const faltanteEnBase = cantidadConvertida.cantidad - stockInfo.total_disponible;
        return `⚠️ ${baseMessage} (faltan ${faltanteEnBase.toFixed(2)} ${stockSymbol} para cubrir ${cantidadSolicitada} ${simboloUnidad})`;
      }
    }

    return baseMessage;
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
    getStockMessage
  };
};
