'use server';

import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, isNull } from 'drizzle-orm';
import { dbAdmin } from '@/db/client';
import { passwordResetTokens, users } from '@/db/schema';
import { emailSchema, restablecerPasswordSchema } from '@/modules/auth/validation';
import { sendEmail } from '@/lib/email';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour, matches the old Supabase reset-link lifetime expectation.

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type SolicitarResetResult = { success: true } | { success: false; message: string };

/**
 * Always returns success (unless input is malformed) regardless of whether
 * the email exists, so the endpoint can't be used to enumerate accounts —
 * same property Supabase's `resetPasswordForEmail` gave for free.
 */
export async function solicitarResetPasswordAction(input: unknown): Promise<SolicitarResetResult> {
  const parsed = emailSchema.safeParse(typeof input === 'string' ? input : (input as { email?: string })?.email);
  if (!parsed.success) {
    return { success: false, message: 'El correo electrónico no es válido.' };
  }
  const email = parsed.data;

  const [user] = await dbAdmin.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

  if (user) {
    const token = randomBytes(32).toString('hex');
    await dbAdmin.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    });

    const resetUrl = `${process.env.APP_ORIGIN ?? 'http://localhost:3000'}/auth/restablecer-contrasena?token=${token}`;
    await sendEmail({
      to: email,
      subject: 'Restablecer tu contraseña — Banco de Alimentos',
      html: `<p>Solicitaste restablecer tu contraseña. Este enlace expira en 1 hora:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Si no fuiste tú, ignora este correo.</p>`,
      text: `Restablece tu contraseña aquí (expira en 1 hora): ${resetUrl}`,
    });
  }

  return { success: true };
}

export type RestablecerResult = { success: true } | { success: false; message: string };

export async function restablecerPasswordAction(input: unknown): Promise<RestablecerResult> {
  const { token, ...rest } = (input ?? {}) as { token?: string; password?: string; confirmPassword?: string };
  if (typeof token !== 'string' || !token) {
    return { success: false, message: 'El enlace de restablecimiento no es válido.' };
  }

  const parsed = restablecerPasswordSchema.safeParse(rest);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };
  }

  const tokenHash = hashToken(token);
  const now = new Date();

  const [record] = await dbAdmin
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt)))
    .limit(1);

  if (!record || record.expiresAt < now) {
    return { success: false, message: 'El enlace de restablecimiento no es válido o ha expirado.' };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await dbAdmin.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, record.userId));
    await tx.update(passwordResetTokens).set({ usedAt: now }).where(eq(passwordResetTokens.id, record.id));
  });

  return { success: true };
}
