import { AlertTriangle, Clock3, PackageSearch, ShieldAlert } from 'lucide-react';
import StatCard from '@/modules/admin/shared/components/StatCard';
import type { DashboardCounts, InventoryRisk } from '../types';

interface DashboardRiskCardsProps {
  counts: DashboardCounts;
  inventoryRisk: InventoryRisk;
}

const DashboardRiskCards = ({ counts, inventoryRisk }: DashboardRiskCardsProps) => (
  <section aria-labelledby="admin-risk-title">
    <div className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">Atención prioritaria</p>
      <h2 id="admin-risk-title" className="mt-1 text-xl font-bold text-slate-900">Riesgos que conviene revisar</h2>
    </div>

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Pendientes >24h"
        value={counts.pendientesVencidas}
        accent="red"
        icon={<ShieldAlert aria-hidden="true" className="h-5 w-5" />}
        sublabel="Solicitudes que requieren atención"
      />
      <StatCard
        label="Respondidas <24h"
        value={`${counts.respuestasDentro24Horas}%`}
        accent="blue"
        icon={<Clock3 aria-hidden="true" className="h-5 w-5" />}
        sublabel="SLA sobre solicitudes resueltas"
      />
      <StatCard
        label="Stock bajo"
        value={inventoryRisk.stockBajo}
        accent="yellow"
        icon={<PackageSearch aria-hidden="true" className="h-5 w-5" />}
        sublabel="Inventario disponible <= 10"
      />
      <StatCard
        label="Por vencer 7 días"
        value={inventoryRisk.porVencer7Dias}
        accent="purple"
        icon={<AlertTriangle aria-hidden="true" className="h-5 w-5" />}
        sublabel={`${inventoryRisk.vencidos} vencidos y ${inventoryRisk.porVencer30Dias} en 30 días`}
      />
    </div>
  </section>
);

export default DashboardRiskCards;
