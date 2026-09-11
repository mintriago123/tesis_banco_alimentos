/**
 * @fileoverview Hook para gestión de datos, filtros y métricas de donaciones.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { INITIAL_FILTERS, SYSTEM_MESSAGES } from '../constants';
import type { Donation, DonationCounters, DonationFilters, DonationEstadoFilter, DonationPersonTypeFilter, LoadingState } from '../types';
import { fetchDonationsAction } from '../actions';
import { applyDonationFilters, buildDonationCounters, hasActiveFilters } from '../utils/formatters';

interface UseDonationsDataResult {
  donations: Donation[];
  filteredDonations: Donation[];
  filters: DonationFilters;
  counters: DonationCounters;
  loadingState: LoadingState;
  errorMessage?: string;
  hasFiltersApplied: boolean;
  refetch: () => Promise<void>;
  setSearch: (value: string) => void;
  toggleEstado: (estado: keyof DonationEstadoFilter) => void;
  togglePersonType: (tipo: keyof DonationPersonTypeFilter) => void;
  resetFilters: () => void;
  messages: typeof SYSTEM_MESSAGES;
}

const cloneInitialFilters = (): DonationFilters => ({
  search: INITIAL_FILTERS.search,
  estado: { ...INITIAL_FILTERS.estado },
  tipoPersona: { ...INITIAL_FILTERS.tipoPersona },
});

export const useDonationsData = (): UseDonationsDataResult => {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [filters, setFilters] = useState<DonationFilters>(() => cloneInitialFilters());
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const loadDonations = useCallback(async () => {
    setLoadingState('loading');
    setErrorMessage(undefined);

    const result = await fetchDonationsAction();

    if (result.success && result.data) {
      setDonations(result.data);
      setLoadingState('success');
    } else {
      setDonations([]);
      setLoadingState('error');
      setErrorMessage(result.error ?? SYSTEM_MESSAGES.loadError);
    }
  }, []);

  useEffect(() => {
    void loadDonations();
  }, [loadDonations]);

  const filteredDonations = useMemo(() => applyDonationFilters(donations, filters), [donations, filters]);
  const counters = useMemo(() => buildDonationCounters(donations), [donations]);
  const hasFiltersApplied = useMemo(() => hasActiveFilters(filters), [filters]);

  const setSearch = useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, search: value }));
  }, []);

  const toggleEstado = useCallback((estado: keyof DonationEstadoFilter) => {
    setFilters((prev) => {
      if (estado === 'todos') {
        return { ...prev, estado: { ...INITIAL_FILTERS.estado } };
      }

      const updated = { ...prev.estado, todos: false, [estado]: !prev.estado[estado] } as DonationEstadoFilter;
      const anyActive = (['Pendiente', 'Aprobada', 'Cancelada'] as Array<keyof DonationEstadoFilter>).filter((key) => key !== 'todos').some((key) => updated[key]);

      return anyActive ? { ...prev, estado: updated } : { ...prev, estado: { ...INITIAL_FILTERS.estado } };
    });
  }, []);

  const togglePersonType = useCallback((tipo: keyof DonationPersonTypeFilter) => {
    setFilters((prev) => {
      if (tipo === 'todos') {
        return { ...prev, tipoPersona: { ...INITIAL_FILTERS.tipoPersona } };
      }

      const updated = { ...prev.tipoPersona, todos: false, [tipo]: !prev.tipoPersona[tipo] } as DonationPersonTypeFilter;
      const anyActive = (['Natural', 'Juridica'] as Array<keyof DonationPersonTypeFilter>).some((key) => updated[key]);

      return anyActive ? { ...prev, tipoPersona: updated } : { ...prev, tipoPersona: { ...INITIAL_FILTERS.tipoPersona } };
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(cloneInitialFilters());
  }, []);

  const refetch = useCallback(async () => {
    await loadDonations();
  }, [loadDonations]);

  return {
    donations,
    filteredDonations,
    filters,
    counters,
    loadingState,
    errorMessage,
    hasFiltersApplied,
    refetch,
    setSearch,
    toggleEstado,
    togglePersonType,
    resetFilters,
    messages: SYSTEM_MESSAGES,
  };
};
