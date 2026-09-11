import { describe, expect, it } from 'vitest';
import { emailSchema, passwordSchema, registroSchema, restablecerPasswordSchema, rolRegistrableSchema } from './validation';

describe('emailSchema', () => {
  it('accepts a well-formed address and normalizes case/whitespace', () => {
    expect(emailSchema.parse('  Persona@Example.COM  ')).toBe('persona@example.com');
  });

  it('rejects a malformed address', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('rejects passwords under 6 characters', () => {
    expect(passwordSchema.safeParse('12345').success).toBe(false);
  });

  it('rejects passwords over 100 characters', () => {
    expect(passwordSchema.safeParse('a'.repeat(101)).success).toBe(false);
  });

  it('accepts a password within bounds', () => {
    expect(passwordSchema.safeParse('valid-password').success).toBe(true);
  });
});

describe('rolRegistrableSchema', () => {
  it('accepts DONANTE and SOLICITANTE', () => {
    expect(rolRegistrableSchema.safeParse('DONANTE').success).toBe(true);
    expect(rolRegistrableSchema.safeParse('SOLICITANTE').success).toBe(true);
  });

  it('rejects ADMINISTRADOR and OPERADOR — the exact role-escalation surface this schema exists to close', () => {
    expect(rolRegistrableSchema.safeParse('ADMINISTRADOR').success).toBe(false);
    expect(rolRegistrableSchema.safeParse('OPERADOR').success).toBe(false);
  });

  it('rejects lowercase or otherwise malformed role strings (no case-normalization, unlike the old trigger-based clamp)', () => {
    expect(rolRegistrableSchema.safeParse('donante').success).toBe(false);
    expect(rolRegistrableSchema.safeParse('SUPERADMIN').success).toBe(false);
    expect(rolRegistrableSchema.safeParse('').success).toBe(false);
  });
});

describe('registroSchema', () => {
  const base = { email: 'nueva@example.test', password: 'password1', confirmPassword: 'password1', rol: 'DONANTE' as const };

  it('accepts a fully valid registration payload', () => {
    expect(registroSchema.safeParse(base).success).toBe(true);
  });

  it('rejects mismatched password confirmation', () => {
    const result = registroSchema.safeParse({ ...base, confirmPassword: 'different' });
    expect(result.success).toBe(false);
  });

  it('rejects a privileged rol even when everything else is valid', () => {
    const result = registroSchema.safeParse({ ...base, rol: 'ADMINISTRADOR' });
    expect(result.success).toBe(false);
  });
});

describe('restablecerPasswordSchema', () => {
  it('accepts matching passwords within bounds', () => {
    expect(restablecerPasswordSchema.safeParse({ password: 'newpassword', confirmPassword: 'newpassword' }).success).toBe(true);
  });

  it('rejects mismatched confirmation', () => {
    expect(restablecerPasswordSchema.safeParse({ password: 'newpassword', confirmPassword: 'other' }).success).toBe(false);
  });
});
