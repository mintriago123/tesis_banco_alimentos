import { ClipboardCheck, HandHeart, Hourglass, Users } from 'lucide-react';
import StatCard from '@/modules/admin/shared/components/StatCard';
import type { DashboardCounts } from '../types';

interface DashboardSummaryCardsProps {
  counts: DashboardCounts;
}

const DashboardSummaryCards = ({ counts }: DashboardSummaryCardsProps) => (
  <section aria-labelledby="admin-summary-title">
    <div className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">Resumen general</p>
      <h2 id="admin-summary-title" className="mt-1 text-xl font-bold text-slate-900">Rendimiento del sistema</h2>
    </div>

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Donaciones pendientes"
        value={counts.donacionesPendientes}
        accent="purple"
        icon={<Users aria-hidden="true" className="h-5 w-5" />}
        sublabel={`${counts.totalDonaciones} registradas en total`}
      />
      <StatCard
        label="Solicitudes pendientes"
        value={counts.pendientes}
        accent="blue"
        icon={<Hourglass aria-hidden="true" className="h-5 w-5" />}
        sublabel={`${counts.totalSolicitudes} acumuladas en total`}
      />
      <StatCard
        label="Solicitudes del mes"
        value={counts.solicitudesMes}
        accent="green"
        icon={<ClipboardCheck aria-hidden="true" className="h-5 w-5" />}
        sublabel={`${counts.tasaAprobacion}% de aprobación histórica`}
      />
      <StatCard
        label="Donaciones del mes"
        value={counts.donacionesMes}
        accent="yellow"
        icon={<HandHeart aria-hidden="true" className="h-5 w-5" />}
        sublabel="Ingresadas desde el inicio del mes"
      />
    </div>
  </section>
);

export default DashboardSummaryCards;
