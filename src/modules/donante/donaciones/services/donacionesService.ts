import type { SupabaseClient } from '@supabase/supabase-js';
import type { Donacion } from '../types';
import {
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

const isDevelopment = process.env.NODE_ENV === 'development';

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

    return ((data || []) as DonacionWithUnidad[]).map((donacion) => ({
      ...donacion,
      unidad_nombre: donacion.unidades?.nombre || '',
      unidad_simbolo: donacion.unidades?.simbolo || '',
    }));
  }

  async eliminarDonacion(id: number): Promise<void> {
    const donacionId = parsePositiveIntegerValue(id, {
      name: 'id',
      min: 1,
      max: 2147483647,
    });
    if (!donacionId.success) {
      throw new Error(donacionId.error);
    }

    if (isDevelopment) {
      console.log('🗑️ Intentando eliminar donación con ID:', id);
    }
    
    const { data, error } = await this.supabase
      .from('donaciones')
      .delete()
      .eq('id', donacionId.value)
      .select();

    if (error) {
      console.error('❌ Error al eliminar donación:', error);
      throw new Error(`Error al eliminar donación: ${error.message}`);
    }
    
    // Verificar que realmente se eliminó algo
    if (!data || data.length === 0) {
      console.error('⚠️ No se eliminó ninguna fila. Posible problema de permisos RLS');
      throw new Error('No se pudo eliminar la donación. Verifica los permisos o que la donación exista.');
    }
    
    if (isDevelopment) {
      console.log('✅ Donación eliminada exitosamente:', data);
    }
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
      .eq('id', donacionId.value);

    if (error) {
      throw new Error(`Error al actualizar donación: ${error.message}`);
    }
  }
}
