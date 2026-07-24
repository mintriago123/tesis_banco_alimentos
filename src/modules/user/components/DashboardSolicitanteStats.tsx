import { CheckCircle2, Clock3, FileText, XCircle, type LucideIcon } from 'lucide-react';
import type { SolicitudEstado } from '../types';

interface SolicitudStats {
  total: number;
  pendiente: number;
  aprobada: number;
  rechazada: number;
}

interface DashboardSolicitanteStatsProps {
  stats: SolicitudStats;
}

interface StatConfig {
  label: string;
  value: number;
  helper: string;
  icon: LucideIcon;
  color: string;
  surface: string;
}

const STATUS_CONFIG: Record<SolicitudEstado, Omit<StatConfig, 'value'>> = {
  pendiente: {
    label: 'Pendientes',
    helper: 'Esperando revisión',
    icon: Clock3,
    color: 'text-amber-700',
    surface: 'border-amber-200 bg-amber-50',
  },
  aprobada: {
    label: 'Aprobadas',
    helper: 'Listas para coordinar',
    icon: CheckCircle2,
    color: 'text-emerald-700',
    surface: 'border-emerald-200 bg-emerald-50',
  },
  rechazada: {
    label: 'Rechazadas',
    helper: 'Revisa los comentarios',
    icon: XCircle,
    color: 'text-rose-700',
    surface: 'border-rose-200 bg-rose-50',
  },
};

export function DashboardSolicitanteStats({ stats }: DashboardSolicitanteStatsProps) {
  const statCards: StatConfig[] = [
    {
      label: 'Solicitudes registradas',
      value: stats.total,
      helper: 'Solicitudes realizadas',
      icon: FileText,
      color: 'text-blue-700',
      surface: 'border-blue-200 bg-blue-50',
    },
    ...(['pendiente', 'aprobada', 'rechazada'] as const).map((estado) => ({
      ...STATUS_CONFIG[estado],
      value: stats[estado],
    })),
  ];

  return (
    <section aria-labelledby="solicitante-stats-title">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Resumen</p>
          <h2 id="solicitante-stats-title" className="mt-1 text-xl font-bold text-slate-900">Estado de tus solicitudes</h2>
        </div>
        <p className="hidden text-sm text-slate-500 sm:block">Información actualizada</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
