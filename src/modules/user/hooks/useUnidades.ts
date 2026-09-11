import { useState, useEffect } from 'react';
import type { Unidad, LoadingState } from '../types';
import { fetchUnidadesAction } from '../actions';

interface UseUnidadesResult {
  unidades: Unidad[];
  loading: LoadingState;
  error: string | null;
  getUnidadById: (id: number) => Unidad | null;
}

export function useUnidades(): UseUnidadesResult {
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [loading, setLoading] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading('loading');
      setError(null);

      const result = await fetchUnidadesAction();
      if (cancelled) return;

      if (!result.success) {
        setError('Error al cargar las unidades');
        setLoading('error');
        return;
      }

      setUnidades(result.data);
      setLoading('success');
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const getUnidadById = (id: number): Unidad | null => unidades.find((u) => u.id === id) || null;

  return { unidades, loading, error, getUnidadById };
}
