import type { Solicitud } from '../types';
import { DashboardSolicitanteQuickActions } from './DashboardSolicitanteQuickActions';
import { DashboardSolicitanteRecentActivity } from './DashboardSolicitanteRecentActivity';
import { DashboardSolicitanteStats } from './DashboardSolicitanteStats';
import { DashboardSolicitanteWelcome } from './DashboardSolicitanteWelcome';

interface DashboardUserCardsProps {
  nombre?: string;
  solicitudes: Solicitud[];
}

export function DashboardUserCards({ nombre, solicitudes }: DashboardUserCardsProps) {
  const stats = solicitudes.reduce(
    (summary, solicitud) => {
      summary.total += 1;
      summary[solicitud.estado] += 1;
      return summary;
    },
    { total: 0, pendiente: 0, aprobada: 0, rechazada: 0 }
  );

  return (
    <div className="space-y-7">
      <DashboardSolicitanteWelcome nombre={nombre} solicitudesPendientes={stats.pendiente} />
      <DashboardSolicitanteStats stats={stats} />

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)] lg:items-start">
        <DashboardSolicitanteRecentActivity solicitudes={solicitudes} />
        <DashboardSolicitanteQuickActions />
      </div>
    </div>
  );
}
