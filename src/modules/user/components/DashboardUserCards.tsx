// ============================================================================
// Component: DashboardUserCards
// Tarjetas de acceso rápido del dashboard de usuario
// ============================================================================

import Link from 'next/link';

interface DashboardCard {
  title: string;
  description: string;
  href: string;
  colorClass: 'blue' | 'emerald';
}

const DASHBOARD_CARDS: DashboardCard[] = [
  {
    title: 'Ver Perfil',
    description: 'Consulta tu información personal.',
    href: '/user/perfil',
    colorClass: 'blue',
  },
  {
    title: 'Ver solicitudes',
    description: 'Consulta el estado de tus solicitudes.',
    href: '/user/solicitudes',
    colorClass: 'emerald',
  },
];

interface DashboardUserCardsProps {
  nombre?: string;
}

export function DashboardUserCards({ nombre }: DashboardUserCardsProps) {
  return (
    <div className="space-y-6">
      {/* Bienvenida */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">
          ¡Bienvenido, {nombre || 'Usuario'}!
        </h2>
        <p className="mt-2 text-slate-600">
          Este es tu panel donde puedes gestionar tu perfil, reservas y más.
        </p>
      </div>

      {/* Tarjetas de navegación */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {DASHBOARD_CARDS.map((card) => (
          <Link key={card.href} href={card.href}>
            <div className={`rounded-xl border p-4 shadow-sm transition hover:shadow ${card.colorClass === 'blue' ? 'border-blue-200 bg-blue-50 hover:bg-blue-100' : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'}`}>
              <h3 className={`text-lg font-semibold ${card.colorClass === 'blue' ? 'text-blue-800' : 'text-emerald-800'}`}>
                {card.title}
              </h3>
              <p className={`text-sm ${card.colorClass === 'blue' ? 'text-blue-700' : 'text-emerald-700'}`}>
                {card.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
