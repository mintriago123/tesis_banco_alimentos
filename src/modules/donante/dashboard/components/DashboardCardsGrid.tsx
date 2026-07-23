import { DashboardCard } from './DashboardCard';

interface DashboardCardsGridProps {
  nombre?: string;
}

export function DashboardCardsGrid({ nombre }: DashboardCardsGridProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">
          ¡Bienvenido, {nombre || 'Usuario'}!
        </h2>
        <p className="mt-2 text-slate-600">
          Este es tu panel donde puedes gestionar tu perfil, reservas y más.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <DashboardCard
          href="/donante/perfil"
          title="Ver Perfil"
          description="Consulta tu información personal."
          bgColor="bg-emerald-50"
          hoverColor="hover:bg-emerald-100"
          textColor="text-emerald-800"
        />

        <DashboardCard
          href="/donante/donaciones"
          title="Ver mis donaciones"
          description="Consulta el estado de tus donaciones."
          bgColor="bg-emerald-50"
          hoverColor="hover:bg-emerald-100"
          textColor="text-emerald-800"
        />
      </div>
    </div>
  );
}
