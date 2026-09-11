import type { Donacion, DonacionEstadisticas } from '../../donaciones/types';
import { DashboardRecentActivity } from './DashboardRecentActivity';
import { DashboardQuickActions } from './DashboardQuickActions';
import { DashboardStats } from './DashboardStats';
import { DashboardWelcome } from './DashboardWelcome';

interface DashboardCardsGridProps {
  nombre?: string;
  donaciones: Donacion[];
  stats: DonacionEstadisticas;
}

export function DashboardCardsGrid({ nombre, donaciones, stats }: DashboardCardsGridProps) {
  return (
    <div className="space-y-7">
      <DashboardWelcome nombre={nombre} impactoTotal={stats.impactoTotal} />
      <DashboardStats stats={stats} />

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)] lg:items-start">
        <DashboardRecentActivity donaciones={donaciones} />
        <DashboardQuickActions />
      </div>
    </div>
  );
}
