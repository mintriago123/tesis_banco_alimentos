'use server';

import { revalidatePath } from 'next/cache';
import { sql } from 'drizzle-orm';
import { withRlsContext } from '@/db/client';
import { requireAuth } from '@/lib/server-auth';
import { createProfileService, type UserProfile, type UserProfileFormData } from '@/modules/shared/services/profileService';

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

export async function fetchOwnProfileAction(): Promise<ActionResult<UserProfile>> {
  const auth = await requireAuth();
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    const result = await createProfileService(tx).getPerfilUsuario(auth.profile.id, auth.profile.email);
    return result.data ? { success: true, data: result.data } : { success: false, error: 'No fue posible cargar el perfil' };
  });
}

export async function fetchOwnDatosBasicosAction(): Promise<ActionResult<Pick<UserProfile, 'id' | 'nombre' | 'cedula' | 'telefono'>>> {
  const auth = await requireAuth();
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    const result = await createProfileService(tx).getDatosBasicosUsuario(auth.profile.id);
    return result.data ? { success: true, data: result.data } : { success: false, error: 'No fue posible cargar los datos del usuario' };
  });
}

export async function checkDuplicateIdentificationAction(tipo: 'Natural' | 'Juridica', value: string): Promise<ActionResult<{ duplicate: boolean }>> {
  const auth = await requireAuth();
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    const result = await createProfileService(tx).checkDuplicateIdentification(tipo, value, auth.profile.id);
    if (result.error) {
      return { success: false, error: 'No fue posible validar el documento' };
    }
    return { success: true, data: { duplicate: result.duplicate } };
  });
}

/** Idempotent — safe to call every time a DONANTE completes/edits their profile. */
export async function ensureDonorWarehouseAction(): Promise<ActionResult<{ id_deposito: string }>> {
  const auth = await requireAuth();
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const rows = await tx.execute<{ id_deposito: string } & Record<string, unknown>>(sql`select * from crear_bodega_principal_donante()`);
      const row = rows[0];
      if (!row) {
        return { success: false, error: 'No fue posible crear la bodega principal' };
      }
      return { success: true, data: { id_deposito: row.id_deposito } };
    } catch (error) {
      console.error('Error creando bodega principal del donante:', error);
      return { success: false, error: 'No fue posible crear la bodega principal' };
    }
  });
}

export async function updateOwnProfileAction(data: UserProfileFormData): Promise<ActionResult<UserProfile>> {
  const auth = await requireAuth();
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    const result = await createProfileService(tx).updatePerfilUsuario(auth.profile.id, auth.profile.email, data);
    if (!result.data) {
      return { success: false, error: 'No fue posible actualizar el perfil' };
    }

    revalidatePath('/user/perfil');
    revalidatePath('/donante/perfil');
    revalidatePath('/operador/perfil');
    revalidatePath('/admin/perfil');
    return { success: true, data: result.data };
  });
}
