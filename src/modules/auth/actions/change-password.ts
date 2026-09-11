'use server';

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { dbAdmin } from '@/db/client';
import { users } from '@/db/schema';
import { requireAuth } from '@/lib/server-auth';
import { passwordSchema } from '@/modules/auth/validation';

export type ChangePasswordResult = { success: true } | { success: false; message: string };

/**
 * "Change my own password" while logged in — distinct from the forgot-password
 * flow (`password-reset.ts`), which doesn't require knowing the current one.
 * The old app's `supabase.auth.updateUser({password})` didn't actually verify
 * `currentPassword` despite the UI collecting it; this does, since we now
 * have direct access to do it correctly.
 */
export async function changeOwnPasswordAction(input: unknown): Promise<ChangePasswordResult> {
  const auth = await requireAuth();
  if (auth.response) {
    return { success: false, message: 'No autenticado.' };
  }

  const { currentPassword, newPassword } = (input ?? {}) as { currentPassword?: string; newPassword?: string };

  if (typeof currentPassword !== 'string' || !currentPassword) {
    return { success: false, message: 'Debes ingresar tu contraseña actual.' };
  }

  const parsedNew = passwordSchema.safeParse(newPassword);
  if (!parsedNew.success) {
    return { success: false, message: parsedNew.error.issues[0]?.message ?? 'Contraseña inválida.' };
  }

  const [user] = await dbAdmin.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(eq(users.id, auth.profile.id)).limit(1);
  if (!user) {
    return { success: false, message: 'Usuario no encontrado.' };
  }

  const currentValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!currentValid) {
    return { success: false, message: 'La contraseña actual no es correcta.' };
  }

  const newHash = await bcrypt.hash(parsedNew.data, 12);
  await dbAdmin.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.id));

  return { success: true };
}
