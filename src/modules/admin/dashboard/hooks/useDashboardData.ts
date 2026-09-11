'use client';

import { useCallback, useEffect, useState } from 'react';
import { getDashboardDataAction } from '../actions';
import type { DashboardData } from '../types';

interface UseDashboardDataResult {
  data: DashboardData | null;
  loading: boolean;
  error?: string;
  refresh: () => Promise<void>;
}

/** Ported from `useDashboardData(supabaseClient)` — no client to pass anymore. */
export const useDashboardData = (): UseDashboardDataResult => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    const result = await getDashboardDataAction();
    if (result.success) {
      setData(result.data);
    } else {
      setError(result.error);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  return { data, loading, error, refresh };
};
