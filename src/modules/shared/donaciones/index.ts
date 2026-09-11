/**
 * @fileoverview Exportaciones principales del módulo de donaciones compartido.
 * Re-export shim sobre `modules/admin/reportes/donaciones` — mismo patrón que
 * el módulo original, usado igual por las páginas admin y operador.
 */

export { default as CancelarDonacionModal } from '@/modules/admin/reportes/donaciones/components/CancelarDonacionModal';
export { default as DonationDetailModal } from '@/modules/admin/reportes/donaciones/components/DonationDetailModal';
export { default as DonationsErrorState } from '@/modules/admin/reportes/donaciones/components/DonationsErrorState';
export { default as DonationsFilters } from '@/modules/admin/reportes/donaciones/components/DonationsFilters';
export { default as DonationsHeader } from '@/modules/admin/reportes/donaciones/components/DonationsHeader';
export { default as DonationsTable } from '@/modules/admin/reportes/donaciones/components/DonationsTable';

export { useDonationsData } from '@/modules/admin/reportes/donaciones/hooks/useDonationsData';
export { useDonationActions } from '@/modules/admin/reportes/donaciones/hooks/useDonationActions';

export type {
  Donation,
  DonationEstado,
  DonationFilters,
  DonationCounters,
  DonationEstadoFilter,
  DonationPersonType,
  DonationPersonTypeFilter,
  MotivoCancelacion,
} from '@/modules/admin/reportes/donaciones/types';

export { MOTIVOS_CANCELACION_OPTIONS, MOTIVO_CANCELACION_LABELS } from './constants';
