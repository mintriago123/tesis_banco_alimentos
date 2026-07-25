import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock3, Package, XCircle } from 'lucide-react';
import { useDateFormatter } from '@/modules/shared/hooks/useDateFormatter';
import type { Donacion } from '../../donaciones/types';

interface DashboardRecentActivityProps {
  donaciones: Donacion[];
}

const statusStyles = {
  Pendiente: 'border-amber-200 bg-amber-50 text-amber-800',
  Aprobada: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  Cancelada: 'border-rose-200 bg-rose-50 text-rose-800',
} as const;

const statusIcons = {
  Pendiente: Clock3,
  Aprobada: CheckCircle2,
  Cancelada: XCircle,
} as const;

export function DashboardRecentActivity({ donaciones }: DashboardRecentActivityProps) {
  const { formatDate } = useDateFormatter();
  const recentDonations = donaciones.slice(0, 4);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="donante-activity-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Seguimiento</p>
          <h2 id="donante-activity-title" className="mt-1 text-xl font-bold text-slate-900">Actividad reciente</h2>
        </div>
        <Link
          href="/donante/donaciones"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          Ver todas
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>

      {recentDonations.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <Package aria-hidden="true" className="mx-auto h-9 w-9 text-slate-400" />
          <p className="mt-3 text-sm font-medium text-slate-700">Aún no tienes donaciones registradas</p>
          <p className="mt-1 text-sm text-slate-500">Registra tu primer aporte para comenzar.</p>
          <Link
            href="/donante/nueva-donacion"
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          >
            Registrar donación
          </Link>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-slate-100">
          {recentDonations.map((donacion) => {
            const Icon = statusIcons[donacion.estado];

            return (
              <li key={donacion.id} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
                  <Package aria-hidden="true" className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{donacion.tipo_producto}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {donacion.cantidad} {donacion.unidad_simbolo} · {formatDate(donacion.creado_en)}
                  </p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[donacion.estado]}`}>
                  <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{donacion.estado}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
