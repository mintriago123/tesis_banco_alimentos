'use server';

import { asc } from 'drizzle-orm';
import { withRlsContext } from '@/db/client';
import { usuarios } from '@/db/schema';
import { requireRole } from '@/lib/server-auth';
import type { ServiceResult, UserRecord } from './types';

export async function fetchUsersAction(): Promise<ServiceResult<UserRecord[]>> {
  const auth = await requireRole(['ADMINISTRADOR']);
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const rows = await tx
        .select({
          id: usuarios.id,
          nombre: usuarios.nombre,
          cedula: usuarios.cedula,
          ruc: usuarios.ruc,
          rol: usuarios.rol,
          tipoPersona: usuarios.tipoPersona,
          telefono: usuarios.telefono,
          direccion: usuarios.direccion,
          representante: usuarios.representante,
          email: usuarios.email,
          createdAt: usuarios.createdAt,
          estado: usuarios.estado,
          fechaFinBloqueo: usuarios.fechaFinBloqueo,
        })
        .from(usuarios)
        .orderBy(asc(usuarios.nombre));

      const data: UserRecord[] = rows.map((row) => ({
        id: row.id,
        nombre: row.nombre ?? '',
        cedula: row.cedula ?? undefined,
        ruc: row.ruc ?? undefined,
        rol: row.rol as UserRecord['rol'],
        tipo_persona: row.tipoPersona as UserRecord['tipo_persona'],
        telefono: row.telefono ?? undefined,
        direccion: row.direccion ?? undefined,
        representante: row.representante ?? undefined,
        email: row.email ?? undefined,
        created_at: row.createdAt?.toISOString(),
        estado: (row.estado ?? null) as UserRecord['estado'],
        fecha_fin_bloqueo: row.fechaFinBloqueo?.toISOString(),
      }));

      return { success: true, data };
    } catch (error) {
      return { success: false, error: 'No fue posible obtener los usuarios', errorDetails: error };
    }
  });
}
