'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BodegasService } from '@/modules/shared/bodegas';
import type { BodegaSolicitud, BodegaSolicitudFilters } from '@/modules/shared/bodegas';

export function useBodegaRequests(supabase: SupabaseClient) {
  const service = useMemo(() => new BodegasService(supabase), [supabase]);
  const [solicitudes, setSolicitudes] = useState<BodegaSolicitud[]>([]);
  const [filters, setFilters] = useState<BodegaSolicitudFilters>({ estado: 'PENDIENTE', search: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setSolicitudes(await service.listarSolicitudesOperativas());
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudieron cargar las solicitudes.');
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const filteredSolicitudes = useMemo(() => {
    const search = filters.search.trim().toLocaleLowerCase();
    return solicitudes.filter((solicitud) => {
      const matchesStatus = filters.estado === 'TODAS' || solicitud.estado === filters.estado;
      const donorName = solicitud.donante?.nombre ?? '';
      const donorEmail = solicitud.donante?.email ?? '';
      const matchesSearch = !search || [solicitud.nombre, solicitud.direccion, donorName, donorEmail]
        .some((value) => value.toLocaleLowerCase().includes(search));
      return matchesStatus && matchesSearch;
    });
  }, [filters, solicitudes]);

  return { solicitudes, filteredSolicitudes, filters, setFilters, isLoading, errorMessage, refetch, service };
}
