import type { MotivoCancelacion } from '@/modules/admin/reportes/donaciones/types';

export const MOTIVOS_CANCELACION_OPTIONS: ReadonlyArray<{
  value: MotivoCancelacion;
  label: string;
  description: string;
}> = [
  {
    value: 'error_donante',
    label: 'Error del donante',
    description: 'El donante cometió un error al registrar la donación',
  },
  {
    value: 'no_disponible',
    label: 'Producto no disponible',
    description: 'El producto ya no está disponible para donar',
  },
  {
    value: 'calidad_inadecuada',
    label: 'Calidad inadecuada',
    description: 'El producto no cumple con los estándares de calidad',
  },
  {
    value: 'logistica_imposible',
    label: 'Logística imposible',
    description: 'No se puede coordinar la logística de recolección',
  },
  {
    value: 'duplicado',
    label: 'Donación duplicada',
    description: 'La donación fue registrada por error o está duplicada',
  },
  {
    value: 'solicitud_donante',
    label: 'Solicitud del donante',
    description: 'El donante solicita cancelar la donación',
  },
  {
    value: 'otro',
    label: 'Otro motivo',
    description: 'Especifica el motivo en las observaciones',
  },
];

export const MOTIVO_CANCELACION_LABELS: Record<MotivoCancelacion, string> = Object.fromEntries(
  MOTIVOS_CANCELACION_OPTIONS.map(({ value, label }) => [value, label]),
) as Record<MotivoCancelacion, string>;
