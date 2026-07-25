/**
 * @fileoverview Hook para cargar inventario disponible asociado a una solicitud.
 */

import { useCallback, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InventarioDisponible, LoadingState, Solicitud } from '../types';
import { createSolicitudesActionService } from '../services/solicitudesActionService';
import { SYSTEM_MESSAGES } from '../constants';

interface UseInventarioDisponibleResult {
  inventario: InventarioDisponible[];
  loadingState: LoadingState;
  errorMessage?: string;
  loadInventario: (solicitud: Pick<Solicitud, 'tipo_alimento' | 'unidad_id'>) => Promise<void>;
  resetInventario: () => void;
}

export const useInventarioDisponible = (supabaseClient: SupabaseClient): UseInventarioDisponibleResult => {
  const [inventario, setInventario] = useState<InventarioDisponible[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const service = useMemo(
    () => createSolicitudesActionService(supabaseClient),
    [supabaseClient]
  );

  const loadInventario = useCallback(async (solicitud: Pick<Solicitud, 'tipo_alimento' | 'unidad_id'>) => {
    if (!solicitud?.tipo_alimento) {
      setInventario([]);
      return;
    }

    setLoadingState('loading');
    setErrorMessage(undefined);

    const result = await service.fetchInventarioDisponible(solicitud);

    if (result.success && result.data) {
      setInventario(result.data);
      setLoadingState('success');
      return;
    }

    setInventario([]);
    setLoadingState('error');
    setErrorMessage(result.error ?? SYSTEM_MESSAGES.loadError);
  }, [service]);

  const resetInventario = useCallback(() => {
    setInventario([]);
    setLoadingState('idle');
    setErrorMessage(undefined);
  }, []);

  return {
    inventario,
    loadingState,
    errorMessage,
    loadInventario,
    resetInventario
  };
};
