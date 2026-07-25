import type { SupabaseClient } from '@supabase/supabase-js';
import type { Donacion, MotivoCancelacion } from '../types';
import {
  parseEnumValue,
  parseIsoDateValue,
  parseOptionalTextValue,
  parsePositiveIntegerValue,
  parsePositiveNumberValue,
  parseUuidValue,
} from '@/lib/validation-core';

type DonacionWithUnidad = Donacion & {
  unidades?: {
    nombre?: string | null;
    simbolo?: string | null;
  } | null;
};

const MOTIVOS_CANCELACION = [
  'error_donante',
  'no_disponible',
  'calidad_inadecuada',
  'logistica_imposible',
  'duplicado',
  'solicitud_donante',
  'otro',
] as const satisfies readonly MotivoCancelacion[];

const MAX_OBSERVACIONES_CANCELACION = 500;

export class DonacionesService {
  constructor(private supabase: SupabaseClient) {}

  async obtenerDonaciones(userId: string): Promise<Donacion[]> {
    const usuarioId = parseUuidValue(userId, { name: 'userId' });
    if (!usuarioId.success) {
      throw new Error(usuarioId.error);
    }

    const { data, error } = await this.supabase
      .from('donaciones')
      .select(`
        *,
        unidades:unidad_id (
          nombre,
          simbolo
        )
      `)
      .eq('user_id', usuarioId.value)
      .order('creado_en', { ascending: false });

    if (error) {
      throw new Error(`Error al cargar donaciones: ${error.message}`);
    }

    return ((data || []) as DonacionWithUnidad[]).map(mapDonacionWithUnidad);
  }

  async cancelarDonacion(
    id: number,
    motivo: MotivoCancelacion,
    observaciones?: string,
  ): Promise<Donacion> {
    const donacionId = parsePositiveIntegerValue(id, {
      name: 'id',
      min: 1,
      max: 2147483647,
    });
    if (!donacionId.success) {
      throw new Error(donacionId.error);
    }

    const motivoResult = parseEnumValue(motivo, MOTIVOS_CANCELACION, { name: 'motivo' });
    if (!motivoResult.success) {
      throw new Error(motivoResult.error);
    }

    const observacionesResult = parseOptionalTextValue(observaciones, {
      name: 'observaciones',
      maxLength: MAX_OBSERVACIONES_CANCELACION,
    });
    if (!observacionesResult.success) {
      throw new Error(observacionesResult.error);
    }

    if (motivoResult.value === 'otro' && !observacionesResult.value) {
      throw new Error('Las observaciones son obligatorias cuando el motivo es otro');
    }

    const {
      data: { user },
      error: authError,
    } = await this.supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('No se pudo validar el usuario autenticado');
    }

    const { data, error } = await this.supabase
      .from('donaciones')
      .update({
        estado: 'Cancelada',
        motivo_cancelacion: motivoResult.value,
        observaciones_cancelacion: observacionesResult.value,
        usuario_cancelacion_id: user.id,
        fecha_cancelacion: new Date().toISOString(),
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', donacionId.value)
      .eq('estado', 'Pendiente')
      .select(`
        *,
        unidades:unidad_id (
          nombre,
          simbolo
        )
      `)
      .maybeSingle();

    if (error) {
      console.error('Error al cancelar donación', { donacionId: donacionId.value, error });
      throw new Error(`Error al cancelar donación: ${error.message}`);
    }

    if (!data) {
      console.error('No se pudo cancelar la donación', { donacionId: donacionId.value, result: 'sin_fila' });
      throw new Error('Solo se pueden cancelar donaciones pendientes propias');
    }

    console.info('Donación cancelada', { donacionId: donacionId.value, result: 'ok' });
    return mapDonacionWithUnidad(data as DonacionWithUnidad);
  }

  async actualizarDonacion(donacion: Donacion): Promise<void> {
    const donacionId = parsePositiveIntegerValue(donacion.id, {
      name: 'donacion.id',
      min: 1,
      max: 2147483647,
    });
    if (!donacionId.success) {
      throw new Error(donacionId.error);
    }

    const cantidad = parsePositiveNumberValue(donacion.cantidad, { name: 'cantidad' });
    if (!cantidad.success) {
      throw new Error(cantidad.error);
    }

    const fechaDisponible = parseIsoDateValue(donacion.fecha_disponible, {
      name: 'fecha_disponible',
    });
    if (!fechaDisponible.success || !fechaDisponible.value) {
      throw new Error(fechaDisponible.success ? 'fecha_disponible es requerida.' : fechaDisponible.error);
    }

    const observaciones = parseOptionalTextValue(donacion.observaciones, {
      name: 'observaciones',
      maxLength: 500,
    });
    if (!observaciones.success) {
      throw new Error(observaciones.error);
    }

    const { error } = await this.supabase
      .from('donaciones')
      .update({
        tipo_producto: donacion.tipo_producto,
        categoria_comida: donacion.categoria_comida,
        cantidad: cantidad.value,
        fecha_disponible: fechaDisponible.value,
        direccion_entrega: donacion.direccion_entrega,
        horario_preferido: donacion.horario_preferido,
        observaciones: observaciones.value,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', donacionId.value)
      .eq('estado', 'Pendiente');

    if (error) {
      throw new Error(`Error al actualizar donación: ${error.message}`);
    }
  }
}

function mapDonacionWithUnidad(donacion: DonacionWithUnidad): Donacion {
  return {
    ...donacion,
    unidad_nombre: donacion.unidades?.nombre || donacion.unidad_nombre || '',
    unidad_simbolo: donacion.unidades?.simbolo || donacion.unidad_simbolo || '',
  };
}
