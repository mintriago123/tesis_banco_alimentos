import { and, eq, ne } from 'drizzle-orm';
import type { Tx } from '@/db/client';
import { usuarios } from '@/db/schema';

export interface UserProfile {
  id: string;
  email?: string;
  nombre: string;
  cedula?: string;
  ruc?: string;
  representante?: string;
  telefono: string;
  direccion: string;
  tipo_persona: string;
  rol: string;
  latitud?: number | null;
  longitud?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface UserProfileFormData {
  nombre: string;
  telefono: string;
  direccion: string;
  tipo_persona?: string;
  cedula?: string | null;
  ruc?: string | null;
  representante?: string | null;
  latitud?: number | null;
  longitud?: number | null;
}

/**
 * Shared `usuarios` profile read/update, used by every role's "mi perfil"
 * page. Always scoped to the RLS-scoped `tx` passed in — RLS's
 * `usuarios_update_policy` already restricts writes to the caller's own row
 * or an active ADMINISTRADOR, so this never takes an arbitrary `usuarioId`
 * for the update path (the old per-role services did, trusting the caller —
 * here the id always comes from the session, not a param).
 */
export const createProfileService = (tx: Tx) => {
  const getPerfilUsuario = async (usuarioId: string, email?: string | null): Promise<{ data: UserProfile | null; error: unknown }> => {
    try {
      const [row] = await tx.select().from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
      if (!row) {
        return { data: null, error: 'Perfil no encontrado' };
      }

      const profile: UserProfile = {
        id: row.id,
        email: email || row.email || '',
        nombre: row.nombre ?? '',
        cedula: row.cedula ?? undefined,
        ruc: row.ruc ?? undefined,
        representante: row.representante ?? undefined,
        telefono: row.telefono ?? '',
        direccion: row.direccion ?? '',
        tipo_persona: row.tipoPersona ?? '',
        rol: row.rol,
        latitud: row.latitud,
        longitud: row.longitud,
        created_at: row.createdAt.toISOString(),
        updated_at: row.updatedAt.toISOString(),
      };

      return { data: profile, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };

  const updatePerfilUsuario = async (
    usuarioId: string,
    email: string | null | undefined,
    profileData: UserProfileFormData,
  ): Promise<{ data: UserProfile | null; error: unknown }> => {
    try {
      await tx
        .update(usuarios)
        .set({
          nombre: profileData.nombre.trim(),
          telefono: profileData.telefono.trim(),
          direccion: profileData.direccion.trim(),
          ...(profileData.tipo_persona !== undefined ? { tipoPersona: profileData.tipo_persona } : {}),
          ...(profileData.cedula !== undefined ? { cedula: profileData.cedula } : {}),
          ...(profileData.ruc !== undefined ? { ruc: profileData.ruc } : {}),
          ...(profileData.representante !== undefined ? { representante: profileData.representante } : {}),
          ...(profileData.latitud !== undefined ? { latitud: profileData.latitud } : {}),
          ...(profileData.longitud !== undefined ? { longitud: profileData.longitud } : {}),
          updatedAt: new Date(),
        })
        .where(eq(usuarios.id, usuarioId));

      return getPerfilUsuario(usuarioId, email);
    } catch (error) {
      return { data: null, error };
    }
  };

  /** `tipo` picks which identity field to check for a pre-existing owner other than `currentUserId`. */
  const checkDuplicateIdentification = async (
    tipo: 'Natural' | 'Juridica',
    value: string,
    currentUserId: string,
  ): Promise<{ duplicate: boolean; error?: unknown }> => {
    try {
      const column = tipo === 'Natural' ? usuarios.cedula : usuarios.ruc;
      const [existing] = await tx
        .select({ id: usuarios.id })
        .from(usuarios)
        .where(and(eq(column, value), ne(usuarios.id, currentUserId)))
        .limit(1);

      return { duplicate: Boolean(existing) };
    } catch (error) {
      return { duplicate: false, error };
    }
  };

  const getDatosBasicosUsuario = async (
    usuarioId: string,
  ): Promise<{ data: Pick<UserProfile, 'id' | 'nombre' | 'cedula' | 'telefono'> | null; error: unknown }> => {
    try {
      const [row] = await tx
        .select({ id: usuarios.id, nombre: usuarios.nombre, cedula: usuarios.cedula, telefono: usuarios.telefono })
        .from(usuarios)
        .where(eq(usuarios.id, usuarioId))
        .limit(1);

      if (!row) {
        return { data: null, error: 'Usuario no encontrado' };
      }

      return { data: { id: row.id, nombre: row.nombre ?? '', cedula: row.cedula ?? undefined, telefono: row.telefono ?? '' }, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };

  return { getPerfilUsuario, updatePerfilUsuario, checkDuplicateIdentification, getDatosBasicosUsuario };
};
