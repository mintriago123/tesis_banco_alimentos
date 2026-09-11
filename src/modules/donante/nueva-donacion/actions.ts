'use server';

import { and, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { withRlsContext } from '@/db/client';
import { alimentos, conversiones, donaciones, donanteDepositos, unidades, usuarios } from '@/db/schema';
import { requireRole } from '@/lib/server-auth';
import { parseIsoDateValue, parseOptionalTextValue, parsePositiveIntegerValue, parsePositiveNumberValue, parseUuidValue } from '@/lib/validation-core';
import type { DonacionFormulario } from '../donaciones/types';
import type { Alimento, ImpactoCalculado, ProductoSeleccionado } from './types';

interface UnidadAlimento {
  unidad_id: number;
  nombre: string;
  simbolo: string;
  tipo_magnitud_id: number;
  tipo_magnitud_nombre: string;
  es_base: boolean;
  es_principal: boolean;
}

export interface AlimentoConUnidades extends Alimento {
  unidades: UnidadAlimento[];
}

export interface UnidadDisponible {
  id: number;
  nombre: string;
  simbolo: string;
  tipo_magnitud_id?: number;
  es_base?: boolean;
  activa?: boolean;
  es_discreta?: boolean;
  es_presentacion?: boolean;
  permite_fraccion?: boolean;
  es_convertible?: boolean;
}

export async function fetchCatalogoDonacionAction(): Promise<{
  success: boolean;
  alimentos: AlimentoConUnidades[];
  unidades: UnidadDisponible[];
  error?: string;
}> {
  const auth = await requireRole(['DONANTE']);
  if (auth.response) {
    return { success: false, alimentos: [], unidades: [], error: 'No autorizado.' };
  }

  try {
    return await withRlsContext(auth.profile.id, async (tx) => {
      const alimentosRows = await tx.select({ id: alimentos.id, nombre: alimentos.nombre, categoria: alimentos.categoria }).from(alimentos).orderBy(alimentos.nombre);

      const alimentosConUnidades: AlimentoConUnidades[] = await Promise.all(
        alimentosRows.map(async (alimento) => {
          const unidadesRows = await tx.execute(sql`select * from obtener_unidades_alimento(${alimento.id})`);
          return { id: alimento.id, nombre: alimento.nombre, categoria: alimento.categoria ?? '', unidades: unidadesRows as unknown as UnidadAlimento[] };
        }),
      );

      const unidadesRows = await tx
        .select({
          id: unidades.id,
          nombre: unidades.nombre,
          simbolo: unidades.simbolo,
          tipoMagnitudId: unidades.tipoMagnitudId,
          esBase: unidades.esBase,
          activa: unidades.activa,
          esDiscreta: unidades.esDiscreta,
          esPresentacion: unidades.esPresentacion,
          permiteFraccion: unidades.permiteFraccion,
        })
        .from(unidades)
        .where(eq(unidades.activa, true))
        .orderBy(unidades.nombre);

      const conversionRows = await tx.select({ origen: conversiones.unidadOrigenId, destino: conversiones.unidadDestinoId }).from(conversiones).where(eq(conversiones.activo, true));
      const convertibles = new Set(conversionRows.flatMap((c) => [c.origen, c.destino]));

      const unidadesDisponibles: UnidadDisponible[] = unidadesRows.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        simbolo: u.simbolo,
        tipo_magnitud_id: u.tipoMagnitudId,
        es_base: u.esBase,
        activa: u.activa,
        es_discreta: u.esDiscreta,
        es_presentacion: u.esPresentacion,
        permite_fraccion: u.permiteFraccion,
        es_convertible: convertibles.has(u.id),
      }));

      return { success: true, alimentos: alimentosConUnidades, unidades: unidadesDisponibles };
    });
  } catch (err) {
    console.error('Error al cargar catálogo de donación:', err);
    return { success: false, alimentos: [], unidades: [], error: 'No fue posible cargar el catálogo' };
  }
}

export interface DonanteProfile {
  id: string;
  rol: string;
  tipo_persona: 'Natural' | 'Juridica' | null;
  nombre: string | null;
  ruc: string | null;
  cedula: string | null;
  direccion: string | null;
  telefono: string | null;
  representante: string | null;
  email: string | null;
}

export async function fetchDonantePerfilAction(): Promise<{ success: boolean; profile: DonanteProfile | null }> {
  const auth = await requireRole(['DONANTE']);
  if (auth.response) {
    return { success: false, profile: null };
  }

  const profile = await withRlsContext(auth.profile.id, (tx) =>
    tx
      .select({
        id: usuarios.id,
        rol: usuarios.rol,
        tipoPersona: usuarios.tipoPersona,
        nombre: usuarios.nombre,
        ruc: usuarios.ruc,
        cedula: usuarios.cedula,
        direccion: usuarios.direccion,
        telefono: usuarios.telefono,
        representante: usuarios.representante,
        email: usuarios.email,
      })
      .from(usuarios)
      .where(eq(usuarios.id, auth.profile.id))
      .limit(1),
  );

  const row = profile[0];
  if (!row) return { success: true, profile: null };

  return {
    success: true,
    profile: {
      id: row.id,
      rol: row.rol,
      tipo_persona: row.tipoPersona as 'Natural' | 'Juridica' | null,
      nombre: row.nombre,
      ruc: row.ruc,
      cedula: row.cedula,
      direccion: row.direccion,
      telefono: row.telefono,
      representante: row.representante,
      email: row.email,
    },
  };
}

export async function crearDonacionAction(
  formulario: DonacionFormulario,
  impacto: ImpactoCalculado,
  productoInfo: ProductoSeleccionado | null,
  unidadInfo: { id: number; nombre: string; simbolo: string } | null,
  alimentosCatalogo: Alimento[],
): Promise<{ success: boolean; message: string }> {
  const auth = await requireRole(['DONANTE']);
  if (auth.response) {
    return { success: false, message: 'No autenticado.' };
  }

  try {
    const depositoId = parseUuidValue(formulario.id_deposito, { name: 'id_deposito' });
    if (!depositoId.success) {
      return { success: false, message: 'Selecciona una bodega activa antes de registrar la donación.' };
    }

    const cantidad = parsePositiveNumberValue(formulario.cantidad, { name: 'cantidad' });
    if (!cantidad.success) return { success: false, message: cantidad.error };

    const unidadId = parsePositiveIntegerValue(formulario.unidad_id, { name: 'unidad_id', min: 1 });
    if (!unidadId.success) return { success: false, message: unidadId.error };

    const fechaDisponible = parseIsoDateValue(formulario.fecha_disponible, { name: 'fecha_disponible' });
    if (!fechaDisponible.success || !fechaDisponible.value) {
      return { success: false, message: fechaDisponible.success ? 'fecha_disponible es requerida.' : fechaDisponible.error };
    }
    const fechaDisponibleValue: string = fechaDisponible.value;

    const fechaVencimiento = parseIsoDateValue(formulario.fecha_vencimiento, { name: 'fecha_vencimiento' });
    if (!fechaVencimiento.success) return { success: false, message: fechaVencimiento.error };

    const observaciones = parseOptionalTextValue(formulario.observaciones, { name: 'observaciones', maxLength: 500 });
    if (!observaciones.success) return { success: false, message: observaciones.error };

    const alimento = alimentosCatalogo.find((a) => a.id.toString() === formulario.tipo_producto);
    if (!alimento) {
      return { success: false, message: 'Selecciona un alimento existente del catálogo antes de registrar la donación.' };
    }

    return await withRlsContext(auth.profile.id, async (tx) => {
      // RLS (`donante_insert_donaciones`) additionally requires the deposit be
      // an active mapping this donor owns — verify up front for a clear error
      // instead of a generic RLS-denial message.
      const [ownedDeposito] = await tx
        .select({ id: donanteDepositos.id })
        .from(donanteDepositos)
        .where(and(eq(donanteDepositos.donanteId, auth.profile.id), eq(donanteDepositos.idDeposito, depositoId.value), eq(donanteDepositos.activo, true)))
        .limit(1);

      if (!ownedDeposito) {
        return { success: false, message: 'La bodega seleccionada no está disponible para tu cuenta.' };
      }

      const [perfil] = await tx.select().from(usuarios).where(eq(usuarios.id, auth.profile.id)).limit(1);

      const insertValues: typeof donaciones.$inferInsert = {
        userId: auth.profile.id,
        idDeposito: depositoId.value,
        nombreDonante: perfil?.nombre || '',
        telefono: perfil?.telefono || '',
        email: perfil?.email || '',
        rucDonante: perfil?.ruc || null,
        cedulaDonante: perfil?.cedula || null,
        direccionDonanteCompleta: perfil?.direccion || null,
        tipoPersonaDonante: perfil?.tipoPersona || null,
        representanteDonante: perfil?.representante || null,
        alimentoId: alimento.id,
        tipoProducto: productoInfo?.nombre || alimento.nombre,
        categoriaComida: productoInfo?.categoria || alimento.categoria,
        esProductoPersonalizado: false,
        cantidad: String(cantidad.value),
        unidadId: unidadId.value,
        unidadNombre: unidadInfo?.nombre || '',
        unidadSimbolo: unidadInfo?.simbolo || '',
        fechaVencimiento: fechaVencimiento.value ?? null,
        fechaDisponible: fechaDisponibleValue,
        direccionEntrega: formulario.direccion_entrega,
        horarioPreferido: formulario.horario_preferido || null,
        observaciones: observaciones.value,
        impactoEstimadoPersonas: impacto.personasAlimentadas,
        impactoEquivalente: impacto.comidaEquivalente,
        estado: 'Pendiente',
      };

      await tx.insert(donaciones).values(insertValues);

      return { success: true, message: '¡Donación registrada exitosamente! Gracias por tu contribución.' };
    });
  } catch (err) {
    console.error('Error al crear la donación:', err);
    const message = err instanceof Error ? err.message : 'Error al registrar la donación';
    return { success: false, message };
  }
}
