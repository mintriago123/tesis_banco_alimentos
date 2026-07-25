import { CheckCircle2, Clock3, Heart, PackageCheck, XCircle, type LucideIcon } from 'lucide-react';
import type { DonacionEstadisticas } from '../../donaciones/types';

interface DashboardStatsProps {
  stats: DonacionEstadisticas;
}

interface StatConfig {
  label: string;
  value: number;
  helper: string;
  icon: LucideIcon;
  color: string;
  surface: string;
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  const statCards: StatConfig[] = [
    {
      label: 'Donaciones registradas',
      value: stats.total,
      helper: 'Aportes realizados',
      icon: Heart,
      color: 'text-emerald-700',
      surface: 'border-emerald-200 bg-emerald-50',
    },
    {
      label: 'Pendientes',
      value: stats.pendientes,
      helper: 'Esperando revisión',
      icon: Clock3,
      color: 'text-amber-700',
      surface: 'border-amber-200 bg-amber-50',
    },
    {
      label: 'Aprobadas',
      value: stats.aprobadas,
      helper: 'Listas para continuar',
      icon: CheckCircle2,
      color: 'text-blue-700',
      surface: 'border-blue-200 bg-blue-50',
    },
    {
      label: 'Canceladas',
      value: stats.canceladas,
      helper: 'Requieren seguimiento',
      icon: XCircle,
      color: 'text-rose-700',
      surface: 'border-rose-200 bg-rose-50',
    },
    {
      label: 'Personas beneficiadas',
      value: stats.impactoTotal,
      helper: 'Impacto estimado',
      icon: PackageCheck,
      color: 'text-violet-700',
      surface: 'border-violet-200 bg-violet-50',
    },
  ];

  return (
    <section aria-labelledby="donante-stats-title">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Resumen</p>
          <h2 id="donante-stats-title" className="mt-1 text-xl font-bold text-slate-900">Tu actividad</h2>
        </div>
        <p className="hidden text-sm text-slate-500 sm:block">Actualizado con tus donaciones</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {statCards.map(({ label, value, helper, icon: Icon, color, surface }) => (
          <article key={label} className={`rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${surface}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-600">{label}</p>
                <p className={`mt-3 text-3xl font-bold ${color}`}>{value}</p>
              </div>
              <span className={`rounded-xl bg-white/80 p-2.5 ${color}`}>
                <Icon aria-hidden="true" className="h-5 w-5" />
              </span>
            </div>
            <p className="mt-3 text-xs text-slate-500">{helper}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
