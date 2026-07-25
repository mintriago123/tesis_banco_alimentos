import Link from 'next/link';
import { ArrowRight, FilePlus2, ListChecks, Sparkles } from 'lucide-react';

interface DashboardSolicitanteWelcomeProps {
  nombre?: string;
  solicitudesPendientes: number;
}

export function DashboardSolicitanteWelcome({ nombre, solicitudesPendientes }: DashboardSolicitanteWelcomeProps) {
  const nombreVisible = nombre?.trim() || 'solicitante';

  return (
    <section
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-800 p-6 text-white shadow-lg sm:p-8"
      aria-labelledby="solicitante-welcome-title"
    >
      <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10" aria-hidden="true" />
      <div className="absolute -bottom-28 right-20 h-64 w-64 rounded-full border-[28px] border-white/5" aria-hidden="true" />

      <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-blue-100">
            <Sparkles aria-hidden="true" className="h-4 w-4" />
            Panel de solicitante
          </div>
          <h2 id="solicitante-welcome-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            Hola, {nombreVisible}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-blue-50 sm:text-base">
            Solicita alimentos, revisa el avance de tus pedidos y mantén tus datos listos para coordinar la entrega.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/user/formulario"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-blue-900 shadow-sm transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-900"
            >
              <FilePlus2 aria-hidden="true" className="h-4 w-4" />
              Crear solicitud
            </Link>
            <Link
              href="/user/solicitudes"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-900"
            >
              Ver mis solicitudes
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm lg:min-w-56">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-white/15 p-3">
              <ListChecks aria-hidden="true" className="h-6 w-6 text-blue-100" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-blue-100">Seguimiento</p>
              <p className="mt-1 text-3xl font-bold">{solicitudesPendientes}</p>
              <p className="text-sm text-blue-100">solicitudes pendientes</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
