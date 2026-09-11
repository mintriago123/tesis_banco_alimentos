'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listarSolicitudesBodegaOperativasAction } from '@/modules/shared/bodegas/actions';
import type { BodegaSolicitud, BodegaSolicitudFilters } from '@/modules/shared/bodegas/types';

export function useBodegaRequests() {
  const [solicitudes, setSolicitudes] = useState<BodegaSolicitud[]>([]);
  const [filters, setFilters] = useState<BodegaSolicitudFilters>({ estado: 'PENDIENTE', search: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const result = await listarSolicitudesBodegaOperativasAction();
    if (result.success) {
      setSolicitudes(result.data);
    } else {
      setErrorMessage(result.error);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const filteredSolicitudes = useMemo(() => {
    const search = filters.search.trim().toLocaleLowerCase();
    return solicitudes.filter((solicitud) => {
      const matchesStatus = filters.estado === 'TODAS' || solicitud.estado === filters.estado;
      const donorName = solicitud.donante?.nombre ?? '';
      const donorEmail = solicitud.donante?.email ?? '';
      const matchesSearch = !search || [solicitud.nombre, solicitud.direccion, donorName, donorEmail].some((value) => value.toLocaleLowerCase().includes(search));
      return matchesStatus && matchesSearch;
    });
  }, [filters, solicitudes]);

  return { solicitudes, filteredSolicitudes, filters, setFilters, isLoading, errorMessage, refetch };
}
