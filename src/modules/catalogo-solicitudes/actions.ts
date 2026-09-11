'use server';

import { eq, isNotNull } from 'drizzle-orm';
import { withRlsContext } from '@/db/client';
import { alimentos, tiposMagnitud, unidades } from '@/db/schema';
import { requireAuth, requireRole } from '@/lib/server-auth';
import * as service from './service';
import type { CatalogoSolicitudResult, CrearSolicitudAltaInput, RechazarSolicitudAltaInput, SolicitudAltaAlimento } from './types';

export interface CategoriaUnidadBasica {
  id: number;
  nombre: string;
  simbolo: string;
  tipo_magnitud_id: number;
  tipo_magnitud_nombre?: string;
  es_base: boolean;
}

/** Categorías existentes + catálogo de unidades, visible a cualquier usuario activo (RLS). */
export async function fetchCategoriasYUnidadesAction(): Promise<{ categorias: string[]; unidades: CategoriaUnidadBasica[] }> {
  const auth = await requireAuth();
  if (auth.response) {
    return { categorias: [], unidades: [] };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    const categoriaRows = await tx.selectDistinct({ categoria: alimentos.categoria }).from(alimentos).where(isNotNull(alimentos.categoria)).orderBy(alimentos.categoria);
    const unidadRows = await tx
      .select({
        id: unidades.id,
        nombre: unidades.nombre,
        simbolo: unidades.simbolo,
        tipoMagnitudId: unidades.tipoMagnitudId,
        tipoMagnitudNombre: tiposMagnitud.nombre,
        esBase: unidades.esBase,
      })
      .from(unidades)
      .innerJoin(tiposMagnitud, eq(unidades.tipoMagnitudId, tiposMagnitud.id))
      .orderBy(unidades.tipoMagnitudId, unidades.nombre);

    return {
      categorias: categoriaRows.map((r) => r.categoria).filter((c): c is string => Boolean(c)),
      unidades: unidadRows.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        simbolo: u.simbolo,
        tipo_magnitud_id: u.tipoMagnitudId,
        tipo_magnitud_nombre: u.tipoMagnitudNombre ?? undefined,
        es_base: u.esBase,
      })),
    };
  });
}

export async function listarSolicitudesAltaAction(): Promise<CatalogoSolicitudResult<SolicitudAltaAlimento[]>> {
  const auth = await requireAuth();
  if (auth.response) {
    return { success: false, error: 'No autenticado.' };
  }

  return withRlsContext(auth.profile.id, (tx) => service.listarSolicitudes(tx));
}

export async function crearSolicitudAltaAction(
  input: Omit<CrearSolicitudAltaInput, 'solicitanteId'>,
): Promise<CatalogoSolicitudResult<{ id: string }>> {
  const auth = await requireRole(['DONANTE']);
  if (auth.response) {
    return { success: false, error: 'Solo un donante puede proponer un nuevo alimento.' };
  }

  return withRlsContext(auth.profile.id, (tx) => service.crearSolicitud(tx, { ...input, solicitanteId: auth.profile.id }));
}

export async function rechazarSolicitudAltaAction(
  input: Omit<RechazarSolicitudAltaInput, 'adminId'>,
): Promise<CatalogoSolicitudResult> {
  const auth = await requireRole(['ADMINISTRADOR']);
  if (auth.response) {
    return { success: false, error: 'Solo un administrador puede rechazar solicitudes.' };
  }

  return withRlsContext(auth.profile.id, (tx) => service.rechazarSolicitud(tx, { ...input, adminId: auth.profile.id }));
}
