import Link from 'next/link';
import { ArrowRight, Heart, Sparkles } from 'lucide-react';

interface DashboardWelcomeProps {
  nombre?: string;
  impactoTotal: number;
}

export function DashboardWelcome({ nombre, impactoTotal }: DashboardWelcomeProps) {
  const nombreVisible = nombre?.trim() || 'donante';

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-700 p-6 text-white shadow-lg sm:p-8" aria-labelledby="donante-welcome-title">
      <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10" aria-hidden="true" />
      <div className="absolute -bottom-28 right-20 h-64 w-64 rounded-full border-[28px] border-white/5" aria-hidden="true" />

      <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50">
            <Sparkles aria-hidden="true" className="h-4 w-4" />
            Panel de donante
          </div>
          <h2 id="donante-welcome-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            Hola, {nombreVisible}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-emerald-50 sm:text-base">
            Cada aporte ayuda a que más familias reciban alimentos. Desde aquí puedes registrar una nueva donación y seguir su avance.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/donante/nueva-donacion"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-800"
            >
              <Heart aria-hidden="true" className="h-4 w-4" />
              Registrar donación
            </Link>
            <Link
              href="/donante/donaciones"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-800"
            >
              Ver historial
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm lg:min-w-56">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-white/15 p-3">
              <Heart aria-hidden="true" className="h-6 w-6 text-emerald-100" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-100">Impacto estimado</p>
              <p className="mt-1 text-3xl font-bold">{impactoTotal}</p>
              <p className="text-sm text-emerald-100">personas beneficiadas</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
