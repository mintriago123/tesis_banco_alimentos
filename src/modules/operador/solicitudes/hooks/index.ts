/**
 * @fileoverview Re-exporta hooks de admin para uso del operador.
 * Los operadores usan la misma lógica de negocio pero con restricciones en la UI.
 */

export { useSolicitudesData } from '@/modules/admin/reportes/solicitudes/hooks/useSolicitudesData';
export { useSolicitudActions } from '@/modules/admin/reportes/solicitudes/hooks/useSolicitudActions';
export { useInventarioDisponible } from '@/modules/admin/reportes/solicitudes/hooks/useInventarioDisponible';
