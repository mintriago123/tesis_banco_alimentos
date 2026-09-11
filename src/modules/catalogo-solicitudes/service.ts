import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Tx } from '@/db/client';
import { solicitudesAltaAlimentos, solicitudesAltaAlimentosUnidades, unidades, usuarios } from '@/db/schema';
import type {
  CatalogoSolicitudResult,
  CrearSolicitudAltaInput,
  RechazarSolicitudAltaInput,
  SolicitudAltaAlimento,
} from './types';
import {
  parseOptionalTextValue,
  parsePositiveIntegerArrayValue,
  parsePositiveIntegerValue,
  parseUuidValue,
} from '@/lib/validation-core';

const MAX_UNIDADES_SOLICITUD = 50;
const MAX_COMENTARIO_LENGTH = 500;

/** RLS (`solicitudes_alta_select_allowed`) already scopes this to "own" for a DONANTE, "all" for ADMINISTRADOR. */
export async function listarSolicitudes(tx: Tx): Promise<CatalogoSolicitudResult<SolicitudAltaAlimento[]>> {
  try {
    const rows = await tx
      .select({
        id: solicitudesAltaAlimentos.id,
        solicitante_id: solicitudesAltaAlimentos.solicitanteId,
        nombre: solicitudesAltaAlimentos.nombre,
        categoria: solicitudesAltaAlimentos.categoria,
        comentario_donante: solicitudesAltaAlimentos.comentarioDonante,
        estado: solicitudesAltaAlimentos.estado,
        comentario_admin: solicitudesAltaAlimentos.comentarioAdmin,
        alimento_creado_id: solicitudesAltaAlimentos.alimentoCreadoId,
        revisado_por: solicitudesAltaAlimentos.revisadoPor,
        fecha_revision: solicitudesAltaAlimentos.fechaRevision,
        created_at: solicitudesAltaAlimentos.createdAt,
        updated_at: solicitudesAltaAlimentos.updatedAt,
        solicitante_nombre: usuarios.nombre,
        solicitante_email: usuarios.email,
      })
      .from(solicitudesAltaAlimentos)
      .leftJoin(usuarios, eq(solicitudesAltaAlimentos.solicitanteId, usuarios.id))
      .orderBy(desc(solicitudesAltaAlimentos.estado), desc(solicitudesAltaAlimentos.createdAt));

    if (rows.length === 0) {
      return { success: true, data: [] };
    }

    const solicitudIds = rows.map((row) => row.id);
    const unidadRows = await tx
      .select({
        id: solicitudesAltaAlimentosUnidades.id,
        solicitud_id: solicitudesAltaAlimentosUnidades.solicitudId,
        unidad_id: solicitudesAltaAlimentosUnidades.unidadId,
        es_unidad_principal: solicitudesAltaAlimentosUnidades.esUnidadPrincipal,
        unidad_nombre: unidades.nombre,
        unidad_simbolo: unidades.simbolo,
      })
      .from(solicitudesAltaAlimentosUnidades)
      .leftJoin(unidades, eq(solicitudesAltaAlimentosUnidades.unidadId, unidades.id))
      .where(inArray(solicitudesAltaAlimentosUnidades.solicitudId, solicitudIds));

    const data: SolicitudAltaAlimento[] = rows
      .map((row) => ({
        id: row.id,
        solicitante_id: row.solicitante_id,
        nombre: row.nombre,
        categoria: row.categoria,
        comentario_donante: row.comentario_donante,
        estado: row.estado as SolicitudAltaAlimento['estado'],
        comentario_admin: row.comentario_admin,
        alimento_creado_id: row.alimento_creado_id,
        revisado_por: row.revisado_por,
        fecha_revision: row.fecha_revision ? row.fecha_revision.toISOString() : null,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
        solicitante: row.solicitante_nombre || row.solicitante_email ? { nombre: row.solicitante_nombre, email: row.solicitante_email } : null,
        unidades: unidadRows
          .filter((u) => u.solicitud_id === row.id)
          .map((u) => ({
            id: u.id,
            unidad_id: u.unidad_id,
            es_unidad_principal: u.es_unidad_principal ?? false,
            unidad: u.unidad_nombre ? { id: u.unidad_id, nombre: u.unidad_nombre, simbolo: u.unidad_simbolo ?? '' } : null,
          })),
      }))
      .sort((a, b) => {
        if (a.estado === b.estado) {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        if (a.estado === 'pendiente') return -1;
        if (b.estado === 'pendiente') return 1;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });

    return { success: true, data };
  } catch (err) {
    return { success: false, error: 'Error inesperado al cargar las solicitudes', errorDetails: err };
  }
}

export async function crearSolicitud(
  tx: Tx,
  input: CrearSolicitudAltaInput,
): Promise<CatalogoSolicitudResult<{ id: string }>> {
  try {
    const nombre = input.nombre.trim();
    const categoria = input.categoria.trim();
    const solicitanteId = parseUuidValue(input.solicitanteId, { name: 'solicitanteId' });
    if (!solicitanteId.success) return { success: false, error: solicitanteId.error };

    const unidadIdsResult = parsePositiveIntegerArrayValue(input.unidadIds, { name: 'unidadIds', min: 1, maxItems: MAX_UNIDADES_SOLICITUD });
    if (!unidadIdsResult.success) return { success: false, error: unidadIdsResult.error };

    const unidadPrincipal =
      input.unidadPrincipalId === undefined
        ? ({ success: true as const, value: undefined })
        : parsePositiveIntegerValue(input.unidadPrincipalId, { name: 'unidadPrincipalId', min: 1 });
    if (!unidadPrincipal.success) return { success: false, error: unidadPrincipal.error };

    const comentarioDonante = parseOptionalTextValue(input.comentarioDonante, { name: 'comentarioDonante', maxLength: MAX_COMENTARIO_LENGTH });
    if (!comentarioDonante.success) return { success: false, error: comentarioDonante.error };

    const unidadIds = unidadIdsResult.value;
    if (!nombre || !categoria) return { success: false, error: 'Nombre y categoría son obligatorios' };
    if (unidadPrincipal.value !== undefined && !unidadIds.includes(unidadPrincipal.value)) {
      return { success: false, error: 'La unidad principal debe estar seleccionada' };
    }

    const [row] = await tx
      .insert(solicitudesAltaAlimentos)
      .values({
        solicitanteId: solicitanteId.value,
        nombre,
        categoria,
        comentarioDonante: comentarioDonante.value ?? undefined,
      })
      .returning({ id: solicitudesAltaAlimentos.id });

    if (!row) {
      return { success: false, error: 'No fue posible crear la solicitud' };
    }

    try {
      await tx.insert(solicitudesAltaAlimentosUnidades).values(
        unidadIds.map((unidadId) => ({
          solicitudId: row.id,
          unidadId,
          esUnidadPrincipal: unidadId === unidadPrincipal.value,
        })),
      );
    } catch (unidadesError) {
      return { success: false, error: 'La solicitud fue creada, pero no fue posible asociar sus unidades', errorDetails: unidadesError };
    }

    return { success: true, data: { id: row.id } };
  } catch (err) {
    return { success: false, error: 'Error inesperado al crear la solicitud', errorDetails: err };
  }
}

export async function rechazarSolicitud(tx: Tx, input: RechazarSolicitudAltaInput): Promise<CatalogoSolicitudResult> {
  try {
    const solicitudId = parseUuidValue(input.solicitudId, { name: 'solicitudId' });
    if (!solicitudId.success) return { success: false, error: solicitudId.error };

    const adminId = parseUuidValue(input.adminId, { name: 'adminId' });
    if (!adminId.success) return { success: false, error: adminId.error };

    const comentarioAdminResult = parseOptionalTextValue(input.comentarioAdmin, { name: 'comentarioAdmin', maxLength: MAX_COMENTARIO_LENGTH });
    if (!comentarioAdminResult.success) return { success: false, error: comentarioAdminResult.error };

    const comentarioAdmin = comentarioAdminResult.value;
    if (!comentarioAdmin) return { success: false, error: 'El comentario de rechazo es obligatorio' };

    await tx
      .update(solicitudesAltaAlimentos)
      .set({ estado: 'rechazada', comentarioAdmin, revisadoPor: adminId.value, fechaRevision: new Date() })
      .where(and(eq(solicitudesAltaAlimentos.id, solicitudId.value), eq(solicitudesAltaAlimentos.estado, 'pendiente')));

    return { success: true };
  } catch (err) {
    return { success: false, error: 'Error inesperado al rechazar la solicitud', errorDetails: err };
  }
}

