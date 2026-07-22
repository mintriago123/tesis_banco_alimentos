import { describe, expect, it } from 'vitest';
import type { DatosRegistro, DatosRestablecimiento } from '../types';
import {
  validarDatosRegistro,
  validarDatosRestablecimiento,
  validarEmail,
  validarPassword,
  validarPasswordsCoinciden,
} from './validation';

describe('auth validation', () => {
  it.each([
    ['', false],
    ['correo-invalido', false],
    ['usuario@example.com', true],
  ])('validates email %j as %s', (email, valido) => {
    expect(validarEmail(email)).toMatchObject({ valido });
  });

  it('enforces password length boundaries', () => {
    expect(validarPassword('12345')).toMatchObject({ valido: false });
    expect(validarPassword('123456')).toEqual({ valido: true });
    expect(validarPassword('a'.repeat(101))).toMatchObject({ valido: false });
  });

  it('requires matching passwords', () => {
    expect(validarPasswordsCoinciden('secreto', 'distinta')).toMatchObject({
      valido: false,
    });
    expect(validarPasswordsCoinciden('secreto', 'secreto')).toEqual({ valido: true });
  });

  it('rejects registration without a role', () => {
    const registration = {
      email: 'usuario@example.com',
      password: 'secreto',
      confirmPassword: 'secreto',
      rol: '',
    } as unknown as DatosRegistro;

    expect(validarDatosRegistro(registration)).toMatchObject({
      valido: false,
      error: 'Debes seleccionar un rol',
    });
  });

  it('accepts valid registration data', () => {
    const registration: DatosRegistro = {
      email: 'usuario@example.com',
      password: 'secreto',
      confirmPassword: 'secreto',
      rol: 'DONANTE',
    };

    expect(validarDatosRegistro(registration)).toEqual({ valido: true });
  });

  it('rejects registration with mismatched passwords before checking the role', () => {
    const registration: DatosRegistro = {
      email: 'usuario@example.com',
      password: 'secreto',
      confirmPassword: 'diferente',
      rol: 'SOLICITANTE',
    };

    expect(validarDatosRegistro(registration)).toMatchObject({
      valido: false,
      error: 'Las contraseñas no coinciden.',
    });
  });

  it('accepts valid password reset data and rejects mismatches', () => {
    const validReset: DatosRestablecimiento = {
      password: 'nueva123',
      confirmPassword: 'nueva123',
    };
    const invalidReset: DatosRestablecimiento = {
      password: 'nueva123',
      confirmPassword: 'otra123',
    };

    expect(validarDatosRestablecimiento(validReset)).toEqual({ valido: true });
    expect(validarDatosRestablecimiento(invalidReset)).toMatchObject({ valido: false });
  });
});
