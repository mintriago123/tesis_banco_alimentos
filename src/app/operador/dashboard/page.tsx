'use client';

import { useMemo } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';
import { RefreshCw } from 'lucide-react';
import { Alert } from '@/app/components/ui/Alert';
import { Button } from '@/app/components/ui/Button';

import {
  DashboardHero,
  DashboardQuickActions,
  RequestStatus,
  useDashboardData,
} from '@/modules/shared/dashboard';
import DashboardActivity from '@/modules/admin/dashboard/components/DashboardActivity';
import TopCategories from '@/modules/admin/dashboard/components/TopCategories';
import { OperatorSummaryCards, type OperatorStats } from '@/modules/operador/dashboard/components/OperatorSummaryCards';

export default function OperadorDashboardPage() {
  const { data, loading, error, refresh } = useDashboardData();

  const hasData = data !== null;
  const operadorStats = useMemo<OperatorStats | null>(() => {
    if (!data) {
      return null;
    }

    const getStatusCount = (label: string) => data.requestStatus.find((status) => status.label === label)?.count ?? 0;

    return {
      solicitudesPendientes: getStatusCount('Pendientes'),
      solicitudesAprobadas: getStatusCount('Aprobadas'),
      solicitudesRechazadas: getStatusCount('Rechazadas'),
      solicitudesEntregadas: getStatusCount('Entregadas'),
      totalSolicitudes: data.counts.totalSolicitudes,
      totalUsuarios: data.counts.totalUsuarios,
    };
  }, [data]);

  return (
    <DashboardLayout
      requiredRole="OPERADOR"
      title="Panel de Operador"
      description="Gestiona solicitudes, donaciones e inventario con una vista clara de la operación."
    >
      <div className="space-y-8">
        <DashboardHero
          role="operador"
          eyebrow="Centro de operaciones"
          title="Mantén la operación en movimiento"
          description="Prioriza solicitudes, actualiza el inventario y valida entregas desde un solo lugar."
          metricLabel="Solicitudes pendientes"
          metricValue={data?.counts.pendientes ?? '—'}
          primaryAction={{ href: '/operador/solicitudes', label: 'Gestionar solicitudes' }}
          secondaryAction={{ href: '/operador/inventario', label: 'Revisar inventario' }}
        />

        <div className="flex justify-end">
          <Button type="button" onClick={refresh} disabled={loading} loading={loading} accent="operador">
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            Actualizar datos
          </Button>
        </div>

        {error && <Alert tipo="error" mensaje={error} />}

        {loading && !hasData && (
          <div className="space-y-8" aria-label="Cargando dashboard" aria-busy="true">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {[1, 2, 3, 4, 5].map((id) => (
                <div key={`skeleton-${id}`} className="h-32 animate-pulse rounded-2xl border border-orange-200 bg-orange-50/60" />
              ))}
            </div>
            <div className="h-72 animate-pulse rounded-2xl border border-orange-200 bg-orange-50/60" />
          </div>
        )}

        {data && operadorStats && (
          <div className="space-y-8">
            <OperatorSummaryCards stats={operadorStats} />
            <RequestStatus items={data.requestStatus} />
            <DashboardActivity solicitudes={data.activity.solicitudesUltimos30Dias} donaciones={data.activity.donacionesUltimos30Dias} />
            <TopCategories categories={data.topCategories} />
            <DashboardQuickActions role="operador" />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
