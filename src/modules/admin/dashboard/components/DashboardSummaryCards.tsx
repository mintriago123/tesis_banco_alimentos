import { ClipboardCheck, HandHeart, Hourglass, Users } from 'lucide-react';
import StatCard from '@/modules/admin/shared/components/StatCard';
import type { DashboardCounts } from '../types';

interface DashboardSummaryCardsProps {
  counts: DashboardCounts;
}

const DashboardSummaryCards = ({ counts }: DashboardSummaryCardsProps) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard
      label="Usuarios registrados"
      value={counts.totalUsuarios}
      accent="purple"
      icon={<Users className="h-5 w-5" />}
      sublabel="Activos en la plataforma"
    />
    <StatCard
      label="Solicitudes pendientes"
      value={counts.pendientes}
      accent="blue"
      icon={<Hourglass className="h-5 w-5" />}
      sublabel={`${counts.totalSolicitudes} acumuladas en total`}
    />
    <StatCard
      label="Solicitudes del mes"
      value={counts.solicitudesMes}
      accent="green"
      icon={<ClipboardCheck className="h-5 w-5" />}
      sublabel={`${counts.tasaAprobacion}% de aprobación histórica`}
    />
    <StatCard
      label="Donaciones del mes"
      value={counts.donacionesMes}
      accent="yellow"
      icon={<HandHeart className="h-5 w-5" />}
      sublabel={`${counts.totalDonaciones} registradas en total`}
    />
  </div>
);

export default DashboardSummaryCards;
