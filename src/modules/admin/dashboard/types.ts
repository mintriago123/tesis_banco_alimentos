export interface DashboardCounts {
  totalUsuarios: number;
  totalSolicitudes: number;
  totalDonaciones: number;
  donacionesPendientes: number;
  tasaAprobacion: number;
  pendientes: number;
  solicitudesMes: number;
  donacionesMes: number;
  pendientesVencidas: number;
  respuestasDentro24Horas: number;
}

export interface RoleDistributionItem {
  role: 'ADMINISTRADOR' | 'DONANTE' | 'SOLICITANTE';
  count: number;
  percentage: number;
}

export interface RequestStatusItem {
  label: string;
  count: number;
  percentage: number;
  accent: 'yellow' | 'green' | 'red' | 'blue';
}

export interface UserTypeItem {
  label: string;
  count: number;
  percentage: number;
  accent: 'blue' | 'purple' | 'slate';
}

export interface InventoryRisk {
  stockBajo: number;
  vencidos: number;
  porVencer7Dias: number;
  porVencer30Dias: number;
}

export interface ActivityPoint {
  fecha: string;
  total: number;
}

export interface TopCategoryItem {
  label: string;
  total: number;
}

export interface TopCategories {
  solicitadas: TopCategoryItem[];
  donadas: TopCategoryItem[];
}

export interface DashboardData {
  counts: DashboardCounts;
  inventoryRisk: InventoryRisk;
  activity: {
    solicitudesUltimos30Dias: ActivityPoint[];
    donacionesUltimos30Dias: ActivityPoint[];
  };
  topCategories: TopCategories;
  roleDistribution: RoleDistributionItem[];
  requestStatus: RequestStatusItem[];
  userTypes: UserTypeItem[];
}
