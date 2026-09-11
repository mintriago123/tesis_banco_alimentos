/**
 * @fileoverview Hook para cargar inventario disponible asociado a una solicitud.
 */

import { useCallback, useState } from 'react';
import type { InventarioDisponible, LoadingState, Solicitud } from '../types';
import { fetchInventarioDisponibleAction } from '../actions';
import { SYSTEM_MESSAGES } from '../constants';

interface UseInventarioDisponibleResult {
  inventario: InventarioDisponible[];
  loadingState: LoadingState;
  errorMessage?: string;
  loadInventario: (solicitud: Pick<Solicitud, 'tipo_alimento' | 'unidad_id'>) => Promise<void>;
  resetInventario: () => void;
}

export const useInventarioDisponible = (): UseInventarioDisponibleResult => {
  const [inventario, setInventario] = useState<InventarioDisponible[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const loadInventario = useCallback(async (solicitud: Pick<Solicitud, 'tipo_alimento' | 'unidad_id'>) => {
    if (!solicitud?.tipo_alimento) {
      setInventario([]);
      return;
    }

    setLoadingState('loading');
    setErrorMessage(undefined);

    const result = await fetchInventarioDisponibleAction(solicitud);

    if (result.success) {
      setInventario(result.data);
      setLoadingState('success');
      return;
    }

    setInventario([]);
    setLoadingState('error');
    setErrorMessage(result.error ?? SYSTEM_MESSAGES.loadError);
  }, []);

  const resetInventario = useCallback(() => {
    setInventario([]);
    setLoadingState('idle');
    setErrorMessage(undefined);
  }, []);

  return { inventario, loadingState, errorMessage, loadInventario, resetInventario };
};
