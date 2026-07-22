/**
 * @fileoverview Re-exporta tipos de donaciones compartidos entre admin y operador.
 */

export type {
  Donation,
  DonationEstado,
  DonationFilters,
  DonationCounters,
  DonationEstadoFilter,
  DonationPersonType,
  DonationPersonTypeFilter
} from '@/modules/admin/reportes/donaciones/types';

export type MotivoCancelacion =
  | 'error_donante'
  | 'no_disponible'
  | 'calidad_inadecuada'
  | 'logistica_imposible'
  | 'duplicado'
  | 'solicitud_donante'
  | 'otro';
