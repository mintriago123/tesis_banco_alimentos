import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock3, FileText, XCircle } from 'lucide-react';
import { useDateFormatter } from '@/modules/shared/hooks/useDateFormatter';
import type { Solicitud, SolicitudEstado } from '../types';

interface DashboardSolicitanteRecentActivityProps {
  solicitudes: Solicitud[];
}

const statusStyles: Record<SolicitudEstado, string> = {
  pendiente: 'border-amber-200 bg-amber-50 text-amber-800',
  aprobada: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  rechazada: 'border-rose-200 bg-rose-50 text-rose-800',
};

const statusLabels: Record<SolicitudEstado, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
};

const statusIcons: Record<SolicitudEstado, typeof Clock3> = {
  pendiente: Clock3,
  aprobada: CheckCircle2,
  rechazada: XCircle,
};

export function DashboardSolicitanteRecentActivity({ solicitudes }: DashboardSolicitanteRecentActivityProps) {
  const { formatDate } = useDateFormatter();
  const recentRequests = solicitudes.slice(0, 4);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="solicitante-activity-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Seguimiento</p>
          <h2 id="solicitante-activity-title" className="mt-1 text-xl font-bold text-slate-900">Actividad reciente</h2>
        </div>
        <Link
          href="/user/solicitudes"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          Ver todas
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>

      {recentRequests.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <FileText aria-hidden="true" className="mx-auto h-9 w-9 text-slate-400" />
          <p className="mt-3 text-sm font-medium text-slate-700">Aún no tienes solicitudes registradas</p>
          <p className="mt-1 text-sm text-slate-500">Crea una solicitud para comenzar el proceso.</p>
          <Link
            href="/user/formulario"
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            Crear solicitud
          </Link>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-slate-100">
          {recentRequests.map((solicitud) => {
            const Icon = statusIcons[solicitud.estado];

            return (
              <li key={solicitud.id} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
                <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
                  <FileText aria-hidden="true" className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{solicitud.tipo_alimento}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {solicitud.cantidad} {solicitud.unidad_simbolo || 'unidades'} · {formatDate(solicitud.created_at)}
                  </p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[solicitud.estado]}`}>
                  <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{statusLabels[solicitud.estado]}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
