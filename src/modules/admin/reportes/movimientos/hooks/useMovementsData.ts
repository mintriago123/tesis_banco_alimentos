'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { MovementItem, ReportFilters, MovementSummary, LoadingState } from '../types';
import { INITIAL_FILTERS } from '../constants';
import { applyMovementFilters, buildFilterDescriptions, buildMovementSummary } from '../utils/formatters';
import { getAllMovementsAction } from '../actions';

interface UseMovementsDataResult {
  rawData: MovementItem[];
  filteredData: MovementItem[];
  summary: MovementSummary;
  loadingState: LoadingState;
  errorMessage?: string;
  lastUpdate?: string;
  refetchData: () => Promise<void>;
  hasData: boolean;
}

/** Ported from `useMovementsData(supabaseClient, filters)` — now calls the Server Action instead of a client-side Supabase service. */
export const useMovementsData = (filters: ReportFilters): UseMovementsDataResult => {
  const [rawData, setRawData] = useState<MovementItem[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [lastUpdate, setLastUpdate] = useState<string | undefined>();

  const loadData = useCallback(async () => {
    setLoadingState('loading');
    setErrorMessage(undefined);

    try {
      const result = await getAllMovementsAction();

      if (result.success) {
        setRawData(result.data);
        setLastUpdate(new Date().toISOString());
        setLoadingState('success');
      } else {
        setErrorMessage(result.error || 'Error desconocido al cargar datos');
        setLoadingState('error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado';
      setErrorMessage(message);
      setLoadingState('error');
    }
  }, []);

  const refetchData = useCallback(async () => {
    await loadData();
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredData = useMemo(() => applyMovementFilters(rawData, filters), [rawData, filters]);
  const summary = useMemo(() => buildMovementSummary(filteredData), [filteredData]);
  const hasData = filteredData.length > 0;

  return { rawData, filteredData, summary, loadingState, errorMessage, lastUpdate, refetchData, hasData };
};

interface UseReportFiltersResult {
  filters: ReportFilters;
  setFilter: (key: keyof ReportFilters, value: string) => void;
  clearFilters: () => void;
  filterDescriptions: string[];
  hasActiveFilters: boolean;
  setMultipleFilters: (newFilters: Partial<ReportFilters>) => void;
}

export const useReportFilters = (initialFilters: ReportFilters = INITIAL_FILTERS): UseReportFiltersResult => {
  const [filters, setFilters] = useState<ReportFilters>(initialFilters);

  const setFilter = useCallback((key: keyof ReportFilters, value: string) => {
    setFilters((prevFilters) => {
      if (key === 'tipo_movimiento') {
        return { ...prevFilters, [key]: value ? (value as MovementItem['tipo_movimiento']) : undefined };
      }

      return { ...prevFilters, [key]: value };
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ ...INITIAL_FILTERS });
  }, []);

  const setMultipleFilters = useCallback((newFilters: Partial<ReportFilters>) => {
    setFilters((prevFilters) => ({ ...prevFilters, ...newFilters }));
  }, []);

  const filterDescriptions = useMemo(() => buildFilterDescriptions(filters), [filters]);
  const hasActiveFilters = filterDescriptions.length > 0;

  return { filters, setFilter, clearFilters, filterDescriptions, hasActiveFilters, setMultipleFilters };
};

interface UseExportReportResult {
  exportReport: () => Promise<void>;
  isExporting: boolean;
  exportError?: string;
  canExport: boolean;
}

export const useExportReport = (
  data: MovementItem[],
  summary: MovementSummary,
  filterDescriptions: string[],
  lastUpdate?: string,
): UseExportReportResult => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | undefined>();

  const exportReport = useCallback(async () => {
    setIsExporting(true);
    setExportError(undefined);

    try {
      const { createExportService } = await import('../services/exportService');
      const exportService = createExportService();

      await exportService.exportMovementsReport(data, summary, filterDescriptions, lastUpdate);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error en la exportación';
      setExportError(message);
    } finally {
      setIsExporting(false);
    }
  }, [data, summary, filterDescriptions, lastUpdate]);

  const canExport = data.length > 0 && !isExporting;

  return { exportReport, isExporting, exportError, canExport };
};
