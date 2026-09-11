import { CheckCircle2, ClipboardList, PackageCheck, Users, XCircle, type LucideIcon } from 'lucide-react';
import StatCard from '@/modules/admin/shared/components/StatCard';

export interface OperatorStats {
  solicitudesPendientes: number;
  solicitudesAprobadas: number;
  solicitudesRechazadas: number;
  solicitudesEntregadas: number;
  totalSolicitudes: number;
  totalUsuarios: number;
}

interface OperatorSummaryCardsProps {
  stats: OperatorStats;
}

interface CardConfig {
  label: string;
  value: number;
  sublabel: string;
  accent: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
  icon: LucideIcon;
}

export function OperatorSummaryCards({ stats }: OperatorSummaryCardsProps) {
  const cards: CardConfig[] = [
    {
      label: 'Solicitudes pendientes',
      value: stats.solicitudesPendientes,
      sublabel: 'Requieren atención',
      accent: 'yellow',
      icon: ClipboardList,
    },
    {
      label: 'Solicitudes aprobadas',
      value: stats.solicitudesAprobadas,
      sublabel: 'Procesadas exitosamente',
      accent: 'green',
      icon: CheckCircle2,
    },
    {
      label: 'Solicitudes entregadas',
      value: stats.solicitudesEntregadas,
      sublabel: 'Completadas',
      accent: 'blue',
      icon: PackageCheck,
    },
    {
      label: 'Solicitudes rechazadas',
      value: stats.solicitudesRechazadas,
      sublabel: 'No procesadas',
      accent: 'red',
      icon: XCircle,
    },
    {
      label: 'Usuarios registrados',
      value: stats.totalUsuarios,
      sublabel: `${stats.totalSolicitudes} solicitudes acumuladas`,
      accent: 'purple',
      icon: Users,
    },
  ];

  return (
    <section aria-labelledby="operador-summary-title">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">Resumen operativo</p>
        <h2 id="operador-summary-title" className="mt-1 text-xl font-bold text-slate-900">Estado de tu gestión</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(({ label, value, sublabel, accent, icon: Icon }) => (
          <StatCard
            key={label}
            label={label}
            value={value}
            accent={accent}
            icon={<Icon aria-hidden="true" className="h-5 w-5" />}
            sublabel={sublabel}
          />
        ))}
      </div>
    </section>
  );
}
