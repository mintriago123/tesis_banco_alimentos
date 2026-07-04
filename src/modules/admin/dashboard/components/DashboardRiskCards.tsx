import { AlertTriangle, Clock3, PackageSearch, ShieldAlert } from 'lucide-react';
import StatCard from '@/modules/admin/shared/components/StatCard';
import type { DashboardCounts, InventoryRisk } from '../types';

interface DashboardRiskCardsProps {
  counts: DashboardCounts;
  inventoryRisk: InventoryRisk;
}

const formatHours = (hours: number) => `${hours.toFixed(1)}h`;

const DashboardRiskCards = ({ counts, inventoryRisk }: DashboardRiskCardsProps) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard
      label="Pendientes >24h"
      value={counts.pendientesVencidas}
      accent="red"
      icon={<ShieldAlert className="h-5 w-5" />}
      sublabel="Solicitudes que requieren atención"
    />
    <StatCard
      label="Respuesta promedio"
      value={formatHours(counts.tiempoRespuestaPromedioHoras)}
      accent="blue"
      icon={<Clock3 className="h-5 w-5" />}
      sublabel="Solo solicitudes resueltas"
    />
    <StatCard
      label="Stock bajo"
      value={inventoryRisk.stockBajo}
      accent="yellow"
      icon={<PackageSearch className="h-5 w-5" />}
      sublabel="Inventario disponible <= 10"
    />
    <StatCard
      label="Por vencer 7 días"
      value={inventoryRisk.porVencer7Dias}
      accent="purple"
      icon={<AlertTriangle className="h-5 w-5" />}
      sublabel={`${inventoryRisk.vencidos} vencidos y ${inventoryRisk.porVencer30Dias} en 30 días`}
    />
  </div>
);

export default DashboardRiskCards;
