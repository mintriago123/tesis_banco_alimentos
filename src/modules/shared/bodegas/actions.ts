'use server';

import { revalidatePath } from 'next/cache';
import { withRlsContext } from '@/db/client';
import { requireAuth, requireRole } from '@/lib/server-auth';
import { BodegasService } from './service';
import type { Bodega, BodegaSolicitud, BodegaSolicitudInput } from './types';

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function toErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export async function listarMisBodegasAction(): Promise<ActionResult<Bodega[]>> {
  const auth = await requireRole(['DONANTE']);
  if (auth.response) return { success: false, error: 'No autorizado' };

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const data = await new BodegasService(tx).listarBodegas(auth.profile.id);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: toErrorMessage(err, 'No se pudieron cargar las bodegas.') };
    }
  });
}

export async function listarMisSolicitudesBodegaAction(): Promise<ActionResult<BodegaSolicitud[]>> {
  const auth = await requireRole(['DONANTE']);
  if (auth.response) return { success: false, error: 'No autorizado' };

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const data = await new BodegasService(tx).listarSolicitudesDonante(auth.profile.id);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: toErrorMessage(err, 'No se pudieron cargar las solicitudes.') };
    }
  });
}

export async function listarSolicitudesBodegaOperativasAction(): Promise<ActionResult<BodegaSolicitud[]>> {
  const auth = await requireRole(['ADMINISTRADOR', 'OPERADOR']);
  if (auth.response) return { success: false, error: 'No autorizado' };

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const data = await new BodegasService(tx).listarSolicitudesOperativas();
      return { success: true, data };
    } catch (err) {
      return { success: false, error: toErrorMessage(err, 'No se pudieron cargar las solicitudes.') };
    }
  });
}

export async function crearSolicitudBodegaAction(input: BodegaSolicitudInput): Promise<ActionResult<string>> {
  const auth = await requireRole(['DONANTE']);
  if (auth.response) return { success: false, error: 'No autorizado' };

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const solicitudId = await new BodegasService(tx).crearSolicitud(input);
      revalidatePath('/donante/configuracion/bodegas');
      return { success: true, data: solicitudId };
    } catch (err) {
      return { success: false, error: toErrorMessage(err, 'No se pudo crear la solicitud de bodega.') };
    }
  });
}

export async function cancelarSolicitudBodegaAction(solicitudId: string): Promise<ActionResult<boolean>> {
  const auth = await requireRole(['DONANTE']);
  if (auth.response) return { success: false, error: 'No autorizado' };

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const ok = await new BodegasService(tx).cancelarSolicitud(solicitudId);
      revalidatePath('/donante/configuracion/bodegas');
      return { success: true, data: ok };
    } catch (err) {
      return { success: false, error: toErrorMessage(err, 'No se pudo cancelar la solicitud.') };
    }
  });
}

export async function aprobarSolicitudBodegaAction(solicitudId: string): Promise<ActionResult<string>> {
  const auth = await requireRole(['ADMINISTRADOR', 'OPERADOR']);
  if (auth.response) return { success: false, error: 'No autorizado' };

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const depositoId = await new BodegasService(tx).aprobarSolicitud(solicitudId);
      revalidatePath('/operador/solicitudes-bodegas');
      revalidatePath('/admin/reportes/solicitudes-bodegas');
      return { success: true, data: depositoId };
    } catch (err) {
      return { success: false, error: toErrorMessage(err, 'No se pudo aprobar la solicitud.') };
    }
  });
}

export async function rechazarSolicitudBodegaAction(solicitudId: string, motivo: string): Promise<ActionResult<string>> {
  const auth = await requireRole(['ADMINISTRADOR', 'OPERADOR']);
  if (auth.response) return { success: false, error: 'No autorizado' };

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const id = await new BodegasService(tx).rechazarSolicitud(solicitudId, motivo);
      revalidatePath('/operador/solicitudes-bodegas');
      revalidatePath('/admin/reportes/solicitudes-bodegas');
      return { success: true, data: id };
    } catch (err) {
      return { success: false, error: toErrorMessage(err, 'No se pudo rechazar la solicitud.') };
    }
  });
}

/** Any authenticated active user may be the acting party for the admin/audit view — mirrors old `requireAuth`-only routes that just needed a valid session. */
export async function listarBodegasDeUsuarioAction(usuarioId: string): Promise<ActionResult<Bodega[]>> {
  const auth = await requireAuth();
  if (auth.response) return { success: false, error: 'No autorizado' };

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const data = await new BodegasService(tx).listarBodegas(usuarioId);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: toErrorMessage(err, 'No se pudieron cargar las bodegas.') };
    }
  });
}
