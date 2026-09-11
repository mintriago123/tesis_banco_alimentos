import { z } from 'zod';

// Trim/lowercase run as a plain string transform *before* the email-format
// check, not after — z.email().trim() would validate the raw (possibly
// whitespace-padded) input first and only trim on success, rejecting a
// pasted address with incidental leading/trailing whitespace instead of
// cleaning it up. Caught by a test, not by tsc/build.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'El correo electrónico no es válido.' }));

export const passwordSchema = z
  .string()
  .min(6, 'La contraseña debe tener al menos 6 caracteres.')
  .max(100, 'La contraseña no puede exceder 100 caracteres.');

/** Role a person may pick for themselves at signup. ADMINISTRADOR/OPERADOR are never accepted here. */
export const rolRegistrableSchema = z.enum(['DONANTE', 'SOLICITANTE']);

export const registroSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    rol: rolRegistrableSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  });

export type RegistroInput = z.infer<typeof registroSchema>;

export const restablecerPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  });
