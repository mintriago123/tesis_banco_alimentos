import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock('@/auth', () => ({ auth: authMock }));

import {
  assertRoleAllowed,
  isValidUserRole,
  isValidUserStatus,
  requireAuth,
  requireRole,
  sanitizeAdminUserPatchUpdates,
  type ActiveUserProfile,
} from './server-auth';

function sessionWith(overrides: Partial<{ rol: string | null; estado: string | null; id: string; name: string | null; email: string | null }>) {
  return {
    user: {
      id: 'user-1',
      rol: 'SOLICITANTE',
      estado: 'activo',
      name: 'Prueba',
      email: 'prueba@example.test',
      ...overrides,
    },
  };
}

describe('isValidUserRole / isValidUserStatus', () => {
  it('accepts only the four known roles', () => {
    expect(isValidUserRole('ADMINISTRADOR')).toBe(true);
    expect(isValidUserRole('OPERADOR')).toBe(true);
    expect(isValidUserRole('DONANTE')).toBe(true);
    expect(isValidUserRole('SOLICITANTE')).toBe(true);
    expect(isValidUserRole('SUPERADMIN')).toBe(false);
    expect(isValidUserRole(null)).toBe(false);
    expect(isValidUserRole(undefined)).toBe(false);
  });

  it('accepts only the three known statuses', () => {
    expect(isValidUserStatus('activo')).toBe(true);
    expect(isValidUserStatus('bloqueado')).toBe(true);
    expect(isValidUserStatus('desactivado')).toBe(true);
    expect(isValidUserStatus('activa')).toBe(false);
    expect(isValidUserStatus(null)).toBe(false);
  });
});

describe('assertRoleAllowed', () => {
  const profile: ActiveUserProfile = { id: 'u1', rol: 'OPERADOR', estado: 'activo' };

  it('authorizes a role present in the allowed list', () => {
    const result = assertRoleAllowed(profile, ['ADMINISTRADOR', 'OPERADOR']);
    expect(result).toEqual({ authorized: true });
  });

  it('returns a 403 response for a role outside the allowed list', async () => {
    const result = assertRoleAllowed(profile, ['ADMINISTRADOR']);
    expect(result.authorized).toBeUndefined();
    expect(result.response?.status).toBe(403);
    await expect(result.response?.json()).resolves.toEqual({ error: 'Rol no permitido.' });
  });
});

describe('sanitizeAdminUserPatchUpdates', () => {
  it('rejects a non-object payload', () => {
    const result = sanitizeAdminUserPatchUpdates('not-an-object');
    expect(result).toEqual({ success: false, error: 'updates debe ser un objeto.' });
  });

  it('rejects unknown fields', () => {
    const result = sanitizeAdminUserPatchUpdates({ nombre: 'Ana', id: 'should-not-be-patchable' });
    expect(result).toEqual({ success: false, error: 'Campos no permitidos: id.' });
  });

  it('rejects an invalid rol value', () => {
    const result = sanitizeAdminUserPatchUpdates({ rol: 'SUPERADMIN' });
    expect(result).toEqual({ success: false, error: 'rol inválido.' });
  });

  it('rejects an invalid estado value', () => {
    const result = sanitizeAdminUserPatchUpdates({ estado: 'pendiente' });
    expect(result).toEqual({ success: false, error: 'estado inválido.' });
  });

  it('rejects an object with no allowed fields set', () => {
    const result = sanitizeAdminUserPatchUpdates({});
    expect(result).toEqual({ success: false, error: 'updates no contiene campos permitidos.' });
  });

  it('accepts a valid partial update', () => {
    const result = sanitizeAdminUserPatchUpdates({ nombre: 'Ana', estado: 'bloqueado', motivo_bloqueo: 'Prueba' });
    expect(result).toEqual({
      success: true,
      updates: { nombre: 'Ana', estado: 'bloqueado', motivo_bloqueo: 'Prueba' },
    });
  });
});

describe('requireAuth', () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);

    const result = await requireAuth();
    expect(result.profile).toBeUndefined();
    expect(result.response?.status).toBe(401);
    await expect(result.response?.json()).resolves.toEqual({ error: 'Usuario no autenticado.' });
  });

  it('returns 403 when the session has no valid rol', async () => {
    authMock.mockResolvedValue(sessionWith({ rol: null }));

    const result = await requireAuth();
    expect(result.response?.status).toBe(403);
    await expect(result.response?.json()).resolves.toEqual({ error: 'Usuario sin perfil activo.' });
  });

  it('returns 403 for a blocked account, even with a valid rol', async () => {
    authMock.mockResolvedValue(sessionWith({ estado: 'bloqueado' }));

    const result = await requireAuth();
    expect(result.response?.status).toBe(403);
    await expect(result.response?.json()).resolves.toEqual({ error: 'Usuario inactivo o bloqueado.' });
  });

  it('returns the profile for an active session with a valid rol', async () => {
    authMock.mockResolvedValue(sessionWith({}));

    const result = await requireAuth();
    expect(result.response).toBeUndefined();
    expect(result.profile).toEqual({
      id: 'user-1',
      rol: 'SOLICITANTE',
      estado: 'activo',
      nombre: 'Prueba',
      email: 'prueba@example.test',
    });
  });
});

describe('requireRole', () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  it('rejects an authenticated user whose rol is not in the allowed list', async () => {
    authMock.mockResolvedValue(sessionWith({ rol: 'SOLICITANTE' }));

    const result = await requireRole(['ADMINISTRADOR', 'OPERADOR']);
    expect(result.response?.status).toBe(403);
  });

  it('propagates the 401 from requireAuth when unauthenticated', async () => {
    authMock.mockResolvedValue(null);

    const result = await requireRole(['ADMINISTRADOR']);
    expect(result.response?.status).toBe(401);
  });

  it('returns the profile when the rol is allowed', async () => {
    authMock.mockResolvedValue(sessionWith({ rol: 'ADMINISTRADOR' }));

    const result = await requireRole(['ADMINISTRADOR', 'OPERADOR']);
    expect(result.response).toBeUndefined();
    expect(result.profile?.rol).toBe('ADMINISTRADOR');
  });
});
