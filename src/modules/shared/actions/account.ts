'use server';

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { dbAdmin, withRlsContext } from '@/db/client';
import { users, usuarios } from '@/db/schema';
import { requireAuth } from '@/lib/server-auth';
import { passwordSchema } from '@/modules/auth/validation';

export type ChangePasswordResult = { success: true } | { success: false; error: string };

/**
 * The old app's client-side `supabase.auth.updateUser({password})` never
 * actually verified the "current password" field the UI collected — trusting
 * the live session alone. Closing that gap here: this bcrypt-verifies the
 * current password before writing the new one.
 */
export async function changePasswordAction(currentPassword: string, newPassword: string): Promise<ChangePasswordResult> {
  const auth = await requireAuth();
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  const parsedPassword = passwordSchema.safeParse(newPassword);
  if (!parsedPassword.success) {
    return { success: false, error: parsedPassword.error.issues[0]?.message ?? 'Contraseña inválida' };
  }

  const [user] = await dbAdmin.select().from(users).where(eq(users.id, auth.profile.id)).limit(1);
  if (!user) {
    return { success: false, error: 'Usuario no encontrado' };
  }

  const currentValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!currentValid) {
    return { success: false, error: 'La contraseña actual no es correcta' };
  }

  const passwordHash = await bcrypt.hash(parsedPassword.data, 12);
  await dbAdmin.update(users).set({ passwordHash }).where(eq(users.id, auth.profile.id));

  return { success: true };
}

export type UpdateNotificationPreferenceResult = { success: true } | { success: false; error: string };

export async function updateNotificationPreferenceAction(recibirNotificaciones: boolean): Promise<UpdateNotificationPreferenceResult> {
  const auth = await requireAuth();
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      await tx.update(usuarios).set({ recibirNotificaciones, updatedAt: new Date() }).where(eq(usuarios.id, auth.profile.id));
      return { success: true as const };
    } catch (error) {
      console.error('Error al guardar preferencias:', error);
      return { success: false as const, error: 'Error al guardar preferencias' };
    }
  });
}
