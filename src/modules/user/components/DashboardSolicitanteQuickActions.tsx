import Link from 'next/link';
import { ArrowUpRight, FilePlus2, ListChecks, UserRound } from 'lucide-react';

const ACTIONS = [
  {
    href: '/user/formulario',
    label: 'Crear solicitud',
    description: 'Solicita alimentos para tu organización o familia.',
    icon: FilePlus2,
  },
  {
    href: '/user/solicitudes',
    label: 'Ver mis solicitudes',
    description: 'Consulta estados, detalles y comentarios de revisión.',
    icon: ListChecks,
  },
  {
    href: '/user/perfil',
    label: 'Actualizar mi perfil',
    description: 'Mantén tus datos de contacto listos para coordinar.',
    icon: UserRound,
  },
];

export function DashboardSolicitanteQuickActions() {
  return (
    <section aria-labelledby="solicitante-actions-title">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Accesos directos</p>
        <h2 id="solicitante-actions-title" className="mt-1 text-xl font-bold text-slate-900">¿Qué necesitas hacer?</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1">
        {ACTIONS.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-2xl border border-blue-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-xl bg-blue-50 p-3 text-blue-700">
                <Icon aria-hidden="true" className="h-5 w-5" />
              </span>
              <ArrowUpRight aria-hidden="true" className="h-5 w-5 text-slate-300 transition group-hover:text-blue-700" />
            </div>
            <h3 className="mt-5 text-sm font-bold text-slate-900">{label}</h3>
            <p className="mt-2 text-sm leading-5 text-slate-500">{description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
