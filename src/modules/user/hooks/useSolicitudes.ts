import { useState, useEffect, useCallback } from 'react';
import type { Solicitud, SolicitudFormData, SolicitudEditData, FiltroEstadoSolicitud, LoadingState } from '../types';
import { createSolicitudAction, deleteSolicitudAction, fetchSolicitudesAction, updateSolicitudAction } from '../actions';
import { MESSAGES } from '../constants';

interface UseSolicitudesResult {
  solicitudes: Solicitud[];
  loading: LoadingState;
  error: string | null;
  createSolicitud: (data: SolicitudFormData) => Promise<boolean>;
  updateSolicitud: (id: string, data: SolicitudEditData) => Promise<boolean>;
  deleteSolicitud: (id: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

export function useSolicitudes(filtroEstado: FiltroEstadoSolicitud = 'TODOS'): UseSolicitudesResult {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [loading, setLoading] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);

  const fetchSolicitudes = useCallback(async () => {
    setLoading('loading');
    setError(null);

    const result = await fetchSolicitudesAction(filtroEstado);

    if (!result.success) {
      setError(MESSAGES.SOLICITUD.ERROR_LOAD);
      setLoading('error');
      return;
    }

    setSolicitudes(result.data);
    setLoading('success');
  }, [filtroEstado]);

  useEffect(() => {
    fetchSolicitudes();
  }, [fetchSolicitudes]);

  const createSolicitud = async (data: SolicitudFormData): Promise<boolean> => {
    const result = await createSolicitudAction(data);

    if (!result.success) {
      console.error('[useSolicitudes] Error al crear solicitud:', result.error);
      setError(MESSAGES.SOLICITUD.ERROR_CREATE);
      return false;
    }

    await fetchSolicitudes();
    return true;
  };

  const updateSolicitud = async (id: string, data: SolicitudEditData): Promise<boolean> => {
    const result = await updateSolicitudAction(id, data);

    if (!result.success) {
      setError(MESSAGES.SOLICITUD.ERROR_UPDATE);
      return false;
    }

    setSolicitudes((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
    return true;
  };

  const deleteSolicitud = async (id: string): Promise<boolean> => {
    const result = await deleteSolicitudAction(id);

    if (!result.success) {
      setError(MESSAGES.SOLICITUD.ERROR_DELETE);
      return false;
    }

    setSolicitudes((prev) => prev.filter((s) => s.id !== id));
    return true;
  };

  return { solicitudes, loading, error, createSolicitud, updateSolicitud, deleteSolicitud, refetch: fetchSolicitudes };
}
