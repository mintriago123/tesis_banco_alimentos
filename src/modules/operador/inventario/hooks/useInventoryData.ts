/**
 * @fileoverview Hook específico para gestión de datos de inventario del operador.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Deposito, OperadorInventarioFilters, InventarioItem, OperadorInventarioStats, AlertaInventario, LoadingState } from '../types';
import {
  fetchInventarioAction,
  fetchDepositosAction,
  fetchOperadorStatsAction,
  fetchAlertasInventarioAction,
  updateCantidadInventarioAction,
} from '../actions';

interface UseOperadorInventoryDataResult {
  inventario: InventarioItem[];
  filteredInventario: InventarioItem[];
  depositos: Deposito[];
  alertas: AlertaInventario[];
  filters: OperadorInventarioFilters;
  loadingState: LoadingState;
  errorMessage?: string;
  stats: OperadorInventarioStats;
  hasActiveFilters: boolean;
  refetch: () => Promise<void>;
  refetchAlertas: () => Promise<void>;
  updateCantidad: (idInventario: string, nuevaCantidad: number) => Promise<boolean>;
  setSearch: (value: string) => void;
  setDeposito: (value: string) => void;
  setStockLevel: (value: OperadorInventarioFilters['stockLevel']) => void;
  setAlertasOnly: (value: boolean) => void;
  setProximosVencer: (value: boolean) => void;
  resetFilters: () => void;
}

const INITIAL_FILTERS: OperadorInventarioFilters = {
  search: '',
  depositoId: 'todos',
  stockLevel: 'todos',
  alertasOnly: false,
  proximosVencer: false,
};

const SYSTEM_MESSAGES = {
  loadError: 'Error al cargar los datos del inventario',
} as const;

const applyFilters = (items: InventarioItem[], filters: OperadorInventarioFilters) => {
  const term = filters.search.trim().toLowerCase();

  return items.filter((item) => {
    if (term) {
      const matchesSearch =
        item.producto.nombre_producto?.toLowerCase().includes(term) || item.producto.descripcion?.toLowerCase().includes(term) || item.deposito.nombre?.toLowerCase().includes(term);

      if (!matchesSearch) return false;
    }

    if (filters.depositoId !== 'todos' && item.id_deposito !== filters.depositoId) {
      return false;
    }

    if (filters.stockLevel !== 'todos') {
      const level = item.stock_status;
      if (level !== filters.stockLevel) {
        return false;
      }
    }

    if (filters.alertasOnly && !item.necesita_atencion) {
      return false;
    }

    if (filters.proximosVencer) {
      const estadoCaducidad = item.producto.estado_caducidad;
      if (estadoCaducidad !== 'proximo' && estadoCaducidad !== 'vencido') {
        return false;
      }
    }

    return true;
  });
};

const cloneInitialFilters = (): OperadorInventarioFilters => ({ ...INITIAL_FILTERS });

export const useOperadorInventoryData = (): UseOperadorInventoryDataResult => {
  const [inventario, setInventario] = useState<InventarioItem[]>([]);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [alertas, setAlertas] = useState<AlertaInventario[]>([]);
  const [filters, setFilters] = useState<OperadorInventarioFilters>(() => cloneInitialFilters());
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [stats, setStats] = useState<OperadorInventarioStats>({
    totalProductos: 0,
    stockBajo: 0,
    stockNormal: 0,
    stockAlto: 0,
    totalUnidades: 0,
    productosProximosVencer: 0,
    productosVencidos: 0,
    alertasActivas: 0,
  });

  const loadInventario = useCallback(async () => {
    setLoadingState('loading');
    setErrorMessage(undefined);

    const result = await fetchInventarioAction();
    if (result.success) {
      setInventario(result.data ?? []);
      setLoadingState('success');
    } else {
      setInventario([]);
      setLoadingState('error');
      setErrorMessage(result.error ?? SYSTEM_MESSAGES.loadError);
    }
  }, []);

  const loadDepositos = useCallback(async () => {
    const result = await fetchDepositosAction();
    if (result.success && result.data) {
      setDepositos(result.data);
    }
  }, []);

  const loadStats = useCallback(async () => {
    const result = await fetchOperadorStatsAction();
    if (result.success && result.data) {
      setStats(result.data);
    }
  }, []);

  const loadAlertas = useCallback(async () => {
    const result = await fetchAlertasInventarioAction();
    if (result.success && result.data) {
      setAlertas(result.data);
    }
  }, []);

  useEffect(() => {
    void loadInventario();
    void loadDepositos();
    void loadStats();
    void loadAlertas();
  }, [loadInventario, loadDepositos, loadStats, loadAlertas]);

  const filteredInventario = useMemo(() => applyFilters(inventario, filters), [inventario, filters]);

  const hasActiveFilters = filters.search.trim() !== '' || filters.depositoId !== 'todos' || filters.stockLevel !== 'todos' || filters.alertasOnly || filters.proximosVencer;

  const setSearch = useCallback((value: string) => setFilters((prev) => ({ ...prev, search: value })), []);
  const setDeposito = useCallback((value: string) => setFilters((prev) => ({ ...prev, depositoId: value })), []);
  const setStockLevel = useCallback((value: OperadorInventarioFilters['stockLevel']) => setFilters((prev) => ({ ...prev, stockLevel: value })), []);
  const setAlertasOnly = useCallback((value: boolean) => setFilters((prev) => ({ ...prev, alertasOnly: value })), []);
  const setProximosVencer = useCallback((value: boolean) => setFilters((prev) => ({ ...prev, proximosVencer: value })), []);
  const resetFilters = useCallback(() => setFilters(cloneInitialFilters()), []);

  const refetch = useCallback(async () => {
    await loadInventario();
    await loadStats();
  }, [loadInventario, loadStats]);

  const refetchAlertas = useCallback(async () => {
    await loadAlertas();
  }, [loadAlertas]);

  const updateCantidad = useCallback(
    async (idInventario: string, nuevaCantidad: number): Promise<boolean> => {
      const result = await updateCantidadInventarioAction(idInventario, nuevaCantidad);
      if (result.success) {
        await refetch();
        return true;
      }
      setErrorMessage(result.error);
      return false;
    },
    [refetch],
  );

  return {
    inventario,
    filteredInventario,
    depositos,
    alertas,
    filters,
    loadingState,
    errorMessage,
    stats,
    hasActiveFilters,
    refetch,
    refetchAlertas,
    updateCantidad,
    setSearch,
    setDeposito,
    setStockLevel,
    setAlertasOnly,
    setProximosVencer,
    resetFilters,
  };
};
