export type BodegaSolicitudTipo = 'ALTA' | 'MODIFICACION';
export type BodegaSolicitudEstado = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA';

export interface Bodega {
  id_deposito: string;
  nombre: string;
  descripcion: string | null;
  direccion: string | null;
  telefono: string | null;
  latitud: number | null;
  longitud: number | null;
  es_principal: boolean;
  activo: boolean;
  created_at: string;
}

export interface BodegaSolicitud {
  id: string;
  donante_id: string;
  id_deposito: string | null;
  tipo: BodegaSolicitudTipo;
  nombre: string;
  descripcion: string | null;
  direccion: string;
  telefono: string;
  latitud: number | null;
  longitud: number | null;
  estado: BodegaSolicitudEstado;
  motivo_rechazo: string | null;
  revisado_por: string | null;
  revisado_at: string | null;
  created_at: string;
  updated_at: string;
  donante?: {
    id: string;
    nombre: string | null;
    email: string | null;
    telefono: string | null;
  } | null;
  bodega?: Pick<Bodega, 'id_deposito' | 'nombre' | 'direccion'> | null;
  revisor?: {
    id: string;
    nombre: string | null;
  } | null;
}

export interface BodegaSolicitudInput {
  tipo: BodegaSolicitudTipo;
  idDeposito?: string | null;
  nombre: string;
  descripcion: string;
  direccion: string;
  telefono: string;
  latitud: number | null;
  longitud: number | null;
}

export interface BodegaFormErrors {
  nombre?: string;
  direccion?: string;
  telefono?: string;
  general?: string;
}

export interface BodegaSolicitudFilters {
  estado: 'TODAS' | BodegaSolicitudEstado;
  search: string;
}
