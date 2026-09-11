'use server';

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { dbAdmin } from '@/db/client';
import { users, usuarios } from '@/db/schema';
import { registroSchema } from '@/modules/auth/validation';

export type RegistrarResult = { success: true } | { success: false; message: string };

/**
 * Registration Server Action. Ports the old `AuthService.registrar` +
 * `handle_new_user` trigger combined into one place: `rol` is never trusted
 * from anywhere but this schema (DONANTE/SOLICITANTE only), and the auth
 * identity + business profile rows are created atomically in one
 * transaction — same guarantee the old DB trigger gave, just expressed in
 * application code since there's no longer a separate metadata channel to
 * defend against (see registration-security test notes in the migration plan).
 */
export async function registrarAction(input: unknown): Promise<RegistrarResult> {
  const parsed = registroSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? 'Datos de registro inválidos.' };
  }

  const { email, password, rol } = parsed.data;

  const [existing] = await dbAdmin.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return { success: false, message: 'Este correo electrónico ya está registrado.' };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await dbAdmin.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email, passwordHash }).returning({ id: users.id });
    await tx.insert(usuarios).values({ id: user.id, rol, email, estado: 'activo' });
  });

  return { success: true };
}
