'use client';

import { useMemo } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';
import { useSupabase } from '@/app/components/SupabaseProvider';
import { RefreshCw } from 'lucide-react';
import { Alert } from '@/app/components/ui/Alert';
import { Button } from '@/app/components/ui/Button';

import { useDashboardData } from '@/modules/shared/dashboard';
import DashboardActivity from '@/modules/admin/dashboard/components/DashboardActivity';
import DashboardRiskCards from '@/modules/admin/dashboard/components/DashboardRiskCards';
import DashboardSummaryCards from '@/modules/admin/dashboard/components/DashboardSummaryCards';
import TopCategories from '@/modules/admin/dashboard/components/TopCategories';

export default function AdminDashboardPage() {
  const { supabase } = useSupabase();
  const { data, loading, error, refresh } = useDashboardData(supabase);

  const hasData = useMemo(() => Boolean(data), [data]);

  return (
    <DashboardLayout
      requiredRole="ADMINISTRADOR"
      title="Panel administrativo"
      description="Métricas operativas del Banco de Alimentos"
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={refresh}
            disabled={loading}
            loading={loading}
            accent="admin"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            Actualizar datos
          </Button>
        </div>

        {error && (
          <Alert tipo="error" mensaje={error} />
        )}

        {loading && !hasData && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((id) => (
                <div
                  key={`skeleton-${id}`}
                  className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white/60"
                />
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white/60" />
              <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white/60" />
            </div>
            <div className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white/60" />
          </div>
        )}

        {hasData && data && (
          <>
            <DashboardSummaryCards counts={data.counts} />
            <DashboardRiskCards counts={data.counts} inventoryRisk={data.inventoryRisk} />

            <DashboardActivity
              solicitudes={data.activity.solicitudesUltimos30Dias}
              donaciones={data.activity.donacionesUltimos30Dias}
            />

            <TopCategories categories={data.topCategories} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
