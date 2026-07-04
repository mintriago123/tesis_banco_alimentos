import type { SupabaseClient } from '@supabase/supabase-js';
import type { DonacionFormulario } from '../../donaciones/types';
import type { ProductoSeleccionado, ImpactoCalculado, Alimento } from '../types';

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
    const alimento = alimentos.find((a) => a.id.toString() === formulario.tipo_producto);

    if (!alimento) {
      throw new Error('Selecciona un alimento existente del catálogo antes de registrar la donación.');
    }

    const datosDonacion = {
      user_id: userId,
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
      cantidad: parseFloat(formulario.cantidad),
      unidad_id: parseInt(formulario.unidad_id),
      unidad_nombre: unidadInfo?.nombre || '',
      unidad_simbolo: unidadInfo?.simbolo || '',
      fecha_vencimiento: formulario.fecha_vencimiento || null,
      fecha_disponible: formulario.fecha_disponible,
      direccion_entrega: formulario.direccion_entrega,
      horario_preferido: formulario.horario_preferido || null,
      observaciones: formulario.observaciones || null,
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
