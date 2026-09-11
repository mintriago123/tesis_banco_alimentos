'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { withRlsContext } from '@/db/client';
import { usuarios } from '@/db/schema';
import { requireRole } from '@/lib/server-auth';
import { parseUuidValue } from '@/lib/validation-core';
import { createSolicitudesActionService } from './services/solicitudesActionService';
import { createSolicitudesDataService } from './services/solicitudesDataService';
import type { InventarioDisponible, Solicitud, SolicitudActionResponse } from './types';

type ActionResult<T = SolicitudActionResponse> = { success: true; data: T } | { success: false; error: string };

export async function fetchSolicitudesAction(): Promise<ActionResult<Solicitud[]>> {
  const auth = await requireRole(['ADMINISTRADOR', 'OPERADOR']);
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    const result = await createSolicitudesDataService(tx).fetchSolicitudes();
    return result.success && result.data
      ? { success: true as const, data: result.data }
      : { success: false as const, error: result.error ?? 'Error' };
  });
}

export async function fetchInventarioDisponibleAction(
  solicitud: Pick<Solicitud, 'tipo_alimento' | 'unidad_id'>,
): Promise<ActionResult<InventarioDisponible[]>> {
  const auth = await requireRole(['ADMINISTRADOR', 'OPERADOR']);
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    const result = await createSolicitudesDataService(tx).fetchInventarioDisponible(solicitud);
    return result.success && result.data
      ? { success: true as const, data: result.data }
      : { success: false as const, error: result.error ?? 'Error' };
  });
}

export async function updateSolicitudEstadoAction(params: {
  solicitudId: string;
  nuevoEstado: 'aprobada' | 'rechazada' | 'entregada';
  comentarioAdmin?: string;
  motivoRechazo?: string;
  codigoComprobanteVerificado?: string;
  depositoId?: string;
  cantidadAprobada?: number;
}): Promise<ActionResult> {
  const auth = await requireRole(['ADMINISTRADOR', 'OPERADOR']);
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    const dataService = createSolicitudesDataService(tx);
    const solicitudResult = await dataService.fetchSolicitudById(params.solicitudId);
    if (!solicitudResult.success || !solicitudResult.data) {
      return { success: false, error: solicitudResult.error ?? 'Solicitud no encontrada' };
    }

    const actionService = createSolicitudesActionService(tx, auth.profile);
    const result = await actionService.updateSolicitudEstado(
      solicitudResult.data,
      params.nuevoEstado,
      params.comentarioAdmin,
      params.motivoRechazo,
      auth.profile.id,
      params.codigoComprobanteVerificado,
      params.depositoId,
      params.cantidadAprobada,
    );

    if (result.success && result.data) {
      revalidatePath('/admin/reportes/solicitudes');
      revalidatePath('/operador/solicitudes');
      return { success: true, data: result.data };
    }

    return { success: false, error: result.error ?? 'No fue posible actualizar la solicitud' };
  });
}

/** ADMINISTRADOR only — matches the old app's UI, which never exposed a revert action to OPERADOR. */
export async function revertirSolicitudAction(solicitudId: string): Promise<ActionResult> {
  const auth = await requireRole(['ADMINISTRADOR']);
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    const actionService = createSolicitudesActionService(tx, auth.profile);
    const result = await actionService.revertirSolicitud(solicitudId);

    if (result.success && result.data) {
      revalidatePath('/admin/reportes/solicitudes');
      return { success: true, data: result.data };
    }

    return { success: false, error: result.error ?? 'No fue posible revertir la solicitud' };
  });
}

export async function procesarDonacionAction(params: {
  solicitudId: string;
  cantidadDonar: number;
  porcentaje: number;
  comentario?: string;
  depositoId?: string;
}): Promise<ActionResult> {
  const auth = await requireRole(['ADMINISTRADOR', 'OPERADOR']);
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    const dataService = createSolicitudesDataService(tx);
    const solicitudResult = await dataService.fetchSolicitudById(params.solicitudId);
    if (!solicitudResult.success || !solicitudResult.data) {
      return { success: false, error: solicitudResult.error ?? 'Solicitud no encontrada' };
    }

    const actionService = createSolicitudesActionService(tx, auth.profile);
    const result = await actionService.procesarDonacion(
      solicitudResult.data,
      params.cantidadDonar,
      params.porcentaje,
      params.comentario,
      auth.profile.id,
      params.depositoId,
    );

    if (result.success && result.data) {
      revalidatePath('/admin/reportes/solicitudes');
      revalidatePath('/operador/solicitudes');
      return { success: true, data: result.data };
    }

    return { success: false, error: result.error ?? 'No fue posible registrar la donación' };
  });
}

/** Displays who approved/rejected a request, on demand (ADMINISTRADOR/OPERADOR view). */
export async function fetchOperadorInfoAction(operadorId: string): Promise<ActionResult<{ nombre: string; rol: string }>> {
  const auth = await requireRole(['ADMINISTRADOR', 'OPERADOR']);
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  const parsedId = parseUuidValue(operadorId, { name: 'operadorId' });
  if (!parsedId.success) {
    return { success: true, data: { nombre: 'Personal Administrativo', rol: 'STAFF' } };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    const [row] = await tx.select({ nombre: usuarios.nombre, rol: usuarios.rol }).from(usuarios).where(eq(usuarios.id, parsedId.value)).limit(1);

    if (!row) {
      return { success: true as const, data: { nombre: 'Personal Administrativo', rol: 'STAFF' } };
    }

    return { success: true as const, data: { nombre: row.nombre || 'Sistema', rol: row.rol || 'OPERADOR' } };
  });
}
