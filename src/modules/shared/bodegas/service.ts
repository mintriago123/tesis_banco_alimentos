import type { SupabaseClient } from '@supabase/supabase-js';
import type { Bodega, BodegaSolicitud, BodegaSolicitudInput } from './types';

type Relation<T> = T | T[] | null;

interface BodegaRelation {
  id_deposito: string;
  nombre: string;
  descripcion: string | null;
  direccion: string | null;
  telefono: string | null;
  latitud: number | null;
  longitud: number | null;
  activo: boolean;
}

interface DonanteDepositoRow {
  id_deposito: string;
  es_principal: boolean;
  activo: boolean;
  created_at: string;
  depositos: Relation<BodegaRelation>;
}

const asSingle = <T>(value: Relation<T>): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : value;

const ensureId = (value: string, name: string): string => {
  if (!value.trim()) {
    throw new Error(`${name} es obligatorio.`);
  }
  return value;
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return fallback;
};

export class BodegasService {
  constructor(private readonly supabase: SupabaseClient) {}

  async listarBodegas(donanteId: string): Promise<Bodega[]> {
    const id = ensureId(donanteId, 'donanteId');
    const { data, error } = await this.supabase
      .from('donante_depositos')
      .select(`
        id_deposito,
        es_principal,
        activo,
        created_at,
        depositos:depositos!donante_depositos_id_deposito_fkey(
          id_deposito, nombre, descripcion, direccion, telefono,
          latitud, longitud, activo
        )
      `)
      .eq('donante_id', id)
      .eq('activo', true)
      .order('es_principal', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(getErrorMessage(error, 'No se pudieron cargar las bodegas.'));
    }

    return ((data ?? []) as DonanteDepositoRow[])
      .map((row) => {
        const deposito = asSingle(row.depositos);
        if (!deposito || !deposito.activo) return null;

        return {
          ...deposito,
          es_principal: row.es_principal,
          activo: row.activo,
          created_at: row.created_at,
        } satisfies Bodega;
      })
      .filter((bodega): bodega is Bodega => bodega !== null);
  }

  async listarSolicitudesDonante(donanteId: string): Promise<BodegaSolicitud[]> {
    const id = ensureId(donanteId, 'donanteId');
    const { data, error } = await this.supabase
      .from('solicitudes_bodega')
      .select('*')
      .eq('donante_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(getErrorMessage(error, 'No se pudieron cargar las solicitudes.'));
    }
    return (data ?? []) as BodegaSolicitud[];
  }

  async listarSolicitudesOperativas(): Promise<BodegaSolicitud[]> {
    const { data, error } = await this.supabase
      .from('solicitudes_bodega')
      .select(`
        *,
        donante:usuarios!solicitudes_bodega_donante_id_fkey(id, nombre, email, telefono),
        bodega:depositos!solicitudes_bodega_id_deposito_fkey(id_deposito, nombre, direccion),
        revisor:usuarios!solicitudes_bodega_revisado_por_fkey(id, nombre)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(getErrorMessage(error, 'No se pudieron cargar las solicitudes.'));
    }
    return (data ?? []) as BodegaSolicitud[];
  }

  async crearSolicitud(input: BodegaSolicitudInput): Promise<string> {
    const { data, error } = await this.supabase.rpc('crear_solicitud_bodega', {
      p_tipo: input.tipo,
      p_nombre: input.nombre.trim(),
      p_direccion: input.direccion.trim(),
      p_telefono: input.telefono.trim(),
      p_descripcion: input.descripcion.trim() || null,
      p_id_deposito: input.idDeposito ?? null,
      p_latitud: input.latitud,
      p_longitud: input.longitud,
    });

    if (error || typeof data !== 'string') {
      throw new Error(getErrorMessage(error, 'No se pudo crear la solicitud de bodega.'));
    }
    return data;
  }

  async aprobarSolicitud(solicitudId: string): Promise<string> {
    const id = ensureId(solicitudId, 'solicitudId');
    const { data, error } = await this.supabase.rpc('aprobar_solicitud_bodega', {
      p_solicitud_id: id,
    });
    if (error || typeof data !== 'string') {
      throw new Error(getErrorMessage(error, 'No se pudo aprobar la solicitud.'));
    }
    return data;
  }

  async rechazarSolicitud(solicitudId: string, motivo: string): Promise<string> {
    const id = ensureId(solicitudId, 'solicitudId');
    const reason = motivo.trim();
    if (reason.length < 5) {
      throw new Error('El motivo de rechazo es obligatorio.');
    }
    const { data, error } = await this.supabase.rpc('rechazar_solicitud_bodega', {
      p_solicitud_id: id,
      p_motivo: reason,
    });
    if (error || typeof data !== 'string') {
      throw new Error(getErrorMessage(error, 'No se pudo rechazar la solicitud.'));
    }
    return data;
  }

  async cancelarSolicitud(solicitudId: string): Promise<boolean> {
    const id = ensureId(solicitudId, 'solicitudId');
    const { data, error } = await this.supabase.rpc('cancelar_solicitud_bodega', {
      p_solicitud_id: id,
    });
    if (error || data !== true) {
      throw new Error(getErrorMessage(error, 'No se pudo cancelar la solicitud.'));
    }
    return true;
  }
}
