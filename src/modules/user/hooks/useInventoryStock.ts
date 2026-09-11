/**
 * @fileoverview Hook para obtener información de stock disponible en tiempo real
 */

import { useState, useEffect, useCallback } from 'react';
import type { ConversionData } from '@/lib/unidadConversion';
import { redondear } from '@/lib/unidadConversion';
import { checkStockAction, fetchConversionesAction } from '../actions';
import {
  getUnitCompatibilityMessage,
  obtenerStockParaUnidad,
  type StockSummary,
  type StockUnitSummary,
  type StockInfo,
} from '../services/stockCalculations';

type LoadingState = 'idle' | 'loading' | 'success' | 'error';

type StockInfoForUnits = Pick<StockSummary, 'unidades_disponibles' | 'unidad_id' | 'unidad_nombre' | 'unidad_simbolo' | 'total_disponible' | 'depositos'>;

const obtenerUnidadesDisponibles = (stockInfo: StockInfoForUnits): StockUnitSummary[] => {
  if (stockInfo.unidades_disponibles.length > 0) {
    return stockInfo.unidades_disponibles;
  }

  if (!stockInfo.unidad_id) return [];

  return [
    {
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
    },
  ];
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

/** `checkStock` calls the server (no more direct browser-DB RPC); everything else here is pure client-side math over the last-fetched summary + conversion table. */
export const useInventoryStock = (): UseInventoryStockResult => {
  const [stockInfo, setStockInfo] = useState<StockSummary | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [conversiones, setConversiones] = useState<ConversionData[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await fetchConversionesAction();
      if (!cancelled && result.success) {
        setConversiones(result.data);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const checkStock = useCallback(async (nombreProducto: string) => {
    if (!nombreProducto.trim()) {
      setStockInfo(null);
      setLoadingState('idle');
      setErrorMessage(undefined);
      return;
    }

    setLoadingState('loading');
    setErrorMessage(undefined);

    const result = await checkStockAction(nombreProducto);

    if (result.success) {
      setStockInfo(result.data);
      setLoadingState('success');
    } else {
      setStockInfo(null);
      setLoadingState('error');
      setErrorMessage(result.error || 'Error consultando inventario');
    }
  }, []);

  const clearStock = useCallback(() => {
    setStockInfo(null);
    setLoadingState('idle');
    setErrorMessage(undefined);
  }, []);

  const isStockSufficient = useCallback(
    (cantidadSolicitada: number, simboloUnidad?: string): boolean => {
      if (!stockInfo || cantidadSolicitada <= 0) return false;

      if (!simboloUnidad) {
        return stockInfo.total_calculable && stockInfo.total_disponible >= cantidadSolicitada;
      }

      if (getUnitCompatibilityMessage(stockInfo, conversiones, simboloUnidad)) {
        return false;
      }

      const stockParaUnidad = obtenerStockParaUnidad(stockInfo, simboloUnidad, conversiones);
      return Boolean(stockParaUnidad && stockParaUnidad.cantidad_disponible >= cantidadSolicitada);
    },
    [stockInfo, conversiones],
  );

  const unitCompatibilityMessage = useCallback((simboloUnidad?: string): string | null => getUnitCompatibilityMessage(stockInfo, conversiones, simboloUnidad), [stockInfo, conversiones]);

  const getStockMessage = useCallback(
    (cantidadSolicitada?: number, simboloUnidad?: string): string => {
      if (!stockInfo) return '';

      if (!stockInfo.producto_encontrado) {
        return 'Producto no disponible en inventario';
      }

      const unidadesDisponibles = obtenerUnidadesDisponibles(stockInfo);
      if (unidadesDisponibles.length === 0) {
        return 'Sin stock disponible';
      }

      const resumenPorUnidad = unidadesDisponibles.map((unidad) => `${unidad.cantidad_formateada.cantidad} ${unidad.unidad_simbolo || unidad.unidad_nombre || 'unidades'}`).join(', ');

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
    },
    [stockInfo, conversiones],
  );

  return {
    stockInfo,
    loadingState,
    errorMessage,
    conversiones,
    checkStock,
    clearStock,
    isStockSufficient,
    getUnitCompatibilityMessage: unitCompatibilityMessage,
    getStockMessage,
  };
};

export type { StockInfo, StockSummary, StockUnitSummary };
