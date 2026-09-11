export type SolicitudAltaEstado = 'pendiente' | 'aprobada' | 'rechazada';

export interface SolicitudAltaUnidad {
  id: number;
  unidad_id: number;
  es_unidad_principal: boolean;
  unidad?: {
    id: number;
    nombre: string;
    simbolo: string;
  } | null;
}

export interface SolicitudAltaAlimento {
  id: string;
  solicitante_id: string;
  nombre: string;
  categoria: string;
  comentario_donante: string | null;
  estado: SolicitudAltaEstado;
  comentario_admin: string | null;
  alimento_creado_id: number | null;
  revisado_por: string | null;
  fecha_revision: string | null;
  created_at: string;
  updated_at: string;
  unidades: SolicitudAltaUnidad[];
  solicitante?: {
    nombre: string | null;
    email: string | null;
  } | null;
}

export interface CrearSolicitudAltaInput {
  solicitanteId: string;
  nombre: string;
  categoria: string;
  comentarioDonante?: string;
  unidadIds: number[];
  unidadPrincipalId?: number;
}

export interface RevisarSolicitudAltaInput {
  solicitudId: string;
  nombre: string;
  categoria: string;
  unidadIds: number[];
  unidadPrincipalId?: number;
}

export interface RechazarSolicitudAltaInput {
  solicitudId: string;
  comentarioAdmin: string;
  adminId: string;
}

export interface CatalogoSolicitudResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  errorDetails?: unknown;
}
