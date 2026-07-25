'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BodegasService } from '@/modules/shared/bodegas';
import type { Bodega, BodegaSolicitud } from '@/modules/shared/bodegas';

type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export function useDonanteBodegas(
  supabase: SupabaseClient,
  donanteId: string | null,
) {
  const service = useMemo(() => new BodegasService(supabase), [supabase]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [solicitudes, setSolicitudes] = useState<BodegaSolicitud[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!donanteId) return;

    setLoadingState('loading');
    setErrorMessage(null);
    try {
      const [bodegasData, solicitudesData] = await Promise.all([
        service.listarBodegas(donanteId),
        service.listarSolicitudesDonante(donanteId),
      ]);
      setBodegas(bodegasData);
      setSolicitudes(solicitudesData);
      setLoadingState('success');
    } catch (error: unknown) {
      setLoadingState('error');
      setErrorMessage(error instanceof Error ? error.message : 'No se pudieron cargar las bodegas.');
    }
  }, [donanteId, service]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return {
    bodegas,
    solicitudes,
    loadingState,
    errorMessage,
    refetch: cargar,
    service,
  };
}
