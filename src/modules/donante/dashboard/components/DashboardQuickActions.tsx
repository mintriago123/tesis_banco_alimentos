import { ClipboardList, Heart, UserRound } from 'lucide-react';
import { DashboardCard } from './DashboardCard';

export function DashboardQuickActions() {
  return (
    <section aria-labelledby="donante-actions-title">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Accesos directos</p>
        <h2 id="donante-actions-title" className="mt-1 text-xl font-bold text-slate-900">¿Qué necesitas hacer?</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1">
        <DashboardCard
          href="/donante/nueva-donacion"
          title="Registrar donación"
          description="Comparte un nuevo aporte con el Banco de Alimentos."
          icon={Heart}
          accent="emerald"
        />
        <DashboardCard
          href="/donante/donaciones"
          title="Ver mis donaciones"
          description="Consulta estados, detalles e historial de tus aportes."
          icon={ClipboardList}
          accent="blue"
        />
        <DashboardCard
          href="/donante/perfil"
          title="Actualizar mi perfil"
          description="Mantén tus datos de contacto listos para la coordinación."
          icon={UserRound}
          accent="amber"
        />
      </div>
    </section>
  );
}
