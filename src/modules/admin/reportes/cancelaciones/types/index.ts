/**
 * @fileoverview Tipos para el historial de cancelaciones de donaciones
 */

// `admin/reportes/donaciones` (the review/cancel module this type originally
// came from) hasn't been ported yet — defined locally to avoid a dependency
// on an unported module. Matches the `donaciones_motivo_cancelacion_valido`
// check constraint in src/db/schema/donaciones.ts.
export type MotivoCancelacion =
  | 'error_donante'
  | 'no_disponible'
  | 'calidad_inadecuada'
  | 'logistica_imposible'
  | 'duplicado'
  | 'solicitud_donante'
  | 'otro';

export interface DonacionCancelada {
  id: number;
  user_id: string;
  nombre_donante: string;
  tipo_producto: string;
  cantidad: number;
  unidad_nombre: string;
  unidad_simbolo: string;
  estado: string;
  motivo_cancelacion: MotivoCancelacion;
  observaciones_cancelacion?: string;
  usuario_cancelacion_id: string;
  fecha_cancelacion: string;
  fecha_disponible: string;
  creado_en: string;
}

export interface DonacionCanceladaDetalle extends DonacionCancelada {
  usuario_cancelacion_nombre: string;
  usuario_cancelacion_email: string;
  usuario_cancelacion_rol: string;
  categoria_comida: string;
  direccion_entrega: string;
  telefono: string;
  email: string;
  impacto_estimado_personas?: number;
  codigo_comprobante?: string;
}

export interface EstadisticasCancelaciones {
  total: {
    cancelaciones: number;
    cantidad_total: number;
  };
  por_motivo: {
    error_donante: { cancelaciones: number; cantidad: number };
    no_disponible: { cancelaciones: number; cantidad: number };
    calidad_inadecuada: { cancelaciones: number; cantidad: number };
    logistica_imposible: { cancelaciones: number; cantidad: number };
    duplicado: { cancelaciones: number; cantidad: number };
    solicitud_donante: { cancelaciones: number; cantidad: number };
    otro: { cancelaciones: number; cantidad: number };
  };
}

export interface CancelacionesResponse {
  success: boolean;
  data: DonacionCanceladaDetalle[];
  pagination: {
    total: number;
    offset: number;
    limit: number;
    has_more: boolean;
  };
  estadisticas?: EstadisticasCancelaciones;
}
