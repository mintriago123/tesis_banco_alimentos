'use client';

import { useCallback, useEffect, useState } from 'react';
import { listarMisBodegasAction, listarMisSolicitudesBodegaAction } from '@/modules/shared/bodegas/actions';
import type { Bodega, BodegaSolicitud } from '@/modules/shared/bodegas/types';

type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export function useDonanteBodegas(donanteId: string | null) {
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [solicitudes, setSolicitudes] = useState<BodegaSolicitud[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!donanteId) return;

    setLoadingState('loading');
    setErrorMessage(null);

    const [bodegasResult, solicitudesResult] = await Promise.all([listarMisBodegasAction(), listarMisSolicitudesBodegaAction()]);

    if (!bodegasResult.success || !solicitudesResult.success) {
      setLoadingState('error');
      setErrorMessage((!bodegasResult.success ? bodegasResult.error : undefined) ?? (!solicitudesResult.success ? solicitudesResult.error : undefined) ?? 'No se pudieron cargar las bodegas.');
      return;
    }

    setBodegas(bodegasResult.data);
    setSolicitudes(solicitudesResult.data);
    setLoadingState('success');
  }, [donanteId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { bodegas, solicitudes, loadingState, errorMessage, refetch: cargar };
}
