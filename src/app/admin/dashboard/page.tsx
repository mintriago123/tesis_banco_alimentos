'use client';

import DashboardLayout from '@/app/components/DashboardLayout';
import { useSupabase } from '@/app/components/SupabaseProvider';
import { RefreshCw } from 'lucide-react';
import { Alert } from '@/app/components/ui/Alert';
import { Button } from '@/app/components/ui/Button';

import { DashboardHero, DashboardQuickActions, RequestStatus, useDashboardData } from '@/modules/shared/dashboard';
import DashboardActivity from '@/modules/admin/dashboard/components/DashboardActivity';
import DashboardRiskCards from '@/modules/admin/dashboard/components/DashboardRiskCards';
import DashboardSummaryCards from '@/modules/admin/dashboard/components/DashboardSummaryCards';
import TopCategories from '@/modules/admin/dashboard/components/TopCategories';

export default function AdminDashboardPage() {
  const { supabase } = useSupabase();
  const { data, loading, error, refresh } = useDashboardData(supabase);

  const hasData = data !== null;

  return (
    <DashboardLayout
      requiredRole="ADMINISTRADOR"
      title="Panel administrativo"
      description="Métricas operativas del Banco de Alimentos"
    >
      <div className="space-y-8">
        <DashboardHero
          role="admin"
          eyebrow="Centro de control"
          title="Administra el impacto del banco"
          description="Supervisa solicitudes, donaciones e inventario desde una vista clara para priorizar la operación del equipo."
          metricLabel="Solicitudes pendientes"
          metricValue={data?.counts.pendientes ?? '—'}
          primaryAction={{ href: '/admin/reportes/solicitudes', label: 'Revisar solicitudes' }}
          secondaryAction={{ href: '/admin/reportes/inventario', label: 'Ver inventario' }}
        />

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
          <div className="space-y-8" aria-label="Cargando dashboard" aria-busy="true">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((id) => (
                <div
                  key={`skeleton-${id}`}
                  className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white/70"
                />
              ))}
            </div>
            <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-white/70" />
          </div>
        )}

        {hasData && data && (
          <div className="space-y-8">
            <DashboardSummaryCards counts={data.counts} />
            <DashboardRiskCards counts={data.counts} inventoryRisk={data.inventoryRisk} />

            <RequestStatus items={data.requestStatus} />

            <DashboardActivity
              solicitudes={data.activity.solicitudesUltimos30Dias}
              donaciones={data.activity.donacionesUltimos30Dias}
            />

            <TopCategories categories={data.topCategories} />

            <DashboardQuickActions role="admin" />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
