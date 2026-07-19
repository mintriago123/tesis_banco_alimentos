import type { SupabaseClient } from '@supabase/supabase-js';
import type { DonacionFormulario } from '../../donaciones/types';
import type { ProductoSeleccionado, ImpactoCalculado, Alimento } from '../types';
import {
  parseIsoDateValue,
  parseOptionalTextValue,
  parsePositiveIntegerValue,
  parsePositiveNumberValue,
  parseUuidValue,
} from '@/lib/validation-core';

interface UserProfile {
  nombre?: string;
  telefono?: string;
  email?: string;
  ruc?: string;
  cedula?: string;
  direccion?: string;
  tipo_persona?: string;
  representante?: string;
}

export class NuevaDonacionService {
  constructor(private supabase: SupabaseClient) {}

  async crearDonacion(
    formulario: DonacionFormulario,
    impacto: ImpactoCalculado,
    productoInfo: ProductoSeleccionado | null,
    unidadInfo: { id: number; nombre: string; simbolo: string } | null,
    alimentos: Alimento[],
    userId: string,
    userProfile: UserProfile | null
  ): Promise<void> {
    const userIdResult = parseUuidValue(userId, { name: 'userId' });
    if (!userIdResult.success) {
      throw new Error(userIdResult.error);
    }

    const cantidad = parsePositiveNumberValue(formulario.cantidad, { name: 'cantidad' });
    if (!cantidad.success) {
      throw new Error(cantidad.error);
    }

    const unidadId = parsePositiveIntegerValue(formulario.unidad_id, {
      name: 'unidad_id',
      min: 1,
    });
    if (!unidadId.success) {
      throw new Error(unidadId.error);
    }

    const fechaDisponible = parseIsoDateValue(formulario.fecha_disponible, {
      name: 'fecha_disponible',
    });
    if (!fechaDisponible.success || !fechaDisponible.value) {
      throw new Error(fechaDisponible.success ? 'fecha_disponible es requerida.' : fechaDisponible.error);
    }

    const fechaVencimiento = parseIsoDateValue(formulario.fecha_vencimiento, {
      name: 'fecha_vencimiento',
    });
    if (!fechaVencimiento.success) {
      throw new Error(fechaVencimiento.error);
    }

    const observaciones = parseOptionalTextValue(formulario.observaciones, {
      name: 'observaciones',
      maxLength: 500,
    });
    if (!observaciones.success) {
      throw new Error(observaciones.error);
    }

    const alimento = alimentos.find((a) => a.id.toString() === formulario.tipo_producto);

    if (!alimento) {
      throw new Error('Selecciona un alimento existente del catálogo antes de registrar la donación.');
    }

    const datosDonacion = {
      user_id: userIdResult.value,
      nombre_donante: userProfile?.nombre || '',
      telefono: userProfile?.telefono || '',
      email: userProfile?.email || '',
      ruc_donante: userProfile?.ruc || null,
      cedula_donante: userProfile?.cedula || null,
      direccion_donante_completa: userProfile?.direccion || null,
      tipo_persona_donante: userProfile?.tipo_persona || null,
      representante_donante: userProfile?.representante || null,
      alimento_id: alimento.id,
      tipo_producto: productoInfo?.nombre || alimento.nombre,
      categoria_comida: productoInfo?.categoria || alimento.categoria,
      es_producto_personalizado: false,
      cantidad: cantidad.value,
      unidad_id: unidadId.value,
      unidad_nombre: unidadInfo?.nombre || '',
      unidad_simbolo: unidadInfo?.simbolo || '',
      fecha_vencimiento: fechaVencimiento.value || null,
      fecha_disponible: fechaDisponible.value,
      direccion_entrega: formulario.direccion_entrega,
      horario_preferido: formulario.horario_preferido || null,
      observaciones: observaciones.value,
      impacto_estimado_personas: impacto.personasAlimentadas,
      impacto_equivalente: impacto.comidaEquivalente,
      estado: 'Pendiente',
    };

    const { error } = await this.supabase
      .from('donaciones')
      .insert([datosDonacion]);

    if (error) {
      throw new Error(`Error al crear la donación: ${error.message}`);
    }
  }
}
