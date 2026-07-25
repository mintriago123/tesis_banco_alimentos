import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  getActiveUserProfile,
  getAuthenticatedUser,
  isValidUserRole,
  isValidUserStatus,
  requireActiveUserRole,
  requireRole,
  sanitizeAdminUserPatchUpdates,
  type ActiveUserProfile,
} from './server-auth';

const createAuthClient = (result: unknown) => ({
  auth: {
    getUser: vi.fn(async () => result),
  },
}) as unknown as SupabaseClient;

const createProfileClient = (result: unknown) => ({
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => result),
      })),
    })),
  })),
}) as unknown as SupabaseClient;

describe('server-auth helpers', () => {
  it('validates allowed roles and statuses', () => {
    expect(isValidUserRole('ADMINISTRADOR')).toBe(true);
    expect(isValidUserRole('OPERADOR')).toBe(true);
    expect(isValidUserRole('SUPERADMIN')).toBe(false);

    expect(isValidUserStatus('activo')).toBe(true);
    expect(isValidUserStatus('bloqueado')).toBe(true);
    expect(isValidUserStatus('pendiente')).toBe(false);
  });

  it('sanitizes admin user patch updates with whitelist validation', () => {
    expect(sanitizeAdminUserPatchUpdates({ rol: 'DONANTE', estado: 'activo' })).toEqual({
      success: true,
      updates: { rol: 'DONANTE', estado: 'activo' },
    });

    expect(sanitizeAdminUserPatchUpdates({ email: 'x@example.com' })).toEqual({
      success: false,
      error: 'Campos no permitidos: email.',
    });

    expect(sanitizeAdminUserPatchUpdates({ rol: 'SUPERADMIN' })).toEqual({
      success: false,
      error: 'rol inválido.',
    });

    expect(sanitizeAdminUserPatchUpdates({ estado: 'pendiente' })).toEqual({
      success: false,
      error: 'estado inválido.',
    });
  });

  it('returns 401 when there is no authenticated user', async () => {
    const result = await getAuthenticatedUser(createAuthClient({
      data: { user: null },
      error: null,
    }));

    expect(result.response?.status).toBe(401);
    await expect(result.response?.json()).resolves.toEqual({ error: 'Usuario no autenticado.' });
  });

  it('loads only active user profiles', async () => {
    const active = await getActiveUserProfile(createProfileClient({
      data: {
        id: 'user-1',
        rol: 'ADMINISTRADOR',
        estado: 'activo',
        nombre: 'Admin',
        email: 'admin@example.com',
      },
      error: null,
    }), 'user-1');

    expect(active.profile).toMatchObject({
      id: 'user-1',
      rol: 'ADMINISTRADOR',
      estado: 'activo',
    });

    const blocked = await getActiveUserProfile(createProfileClient({
      data: {
        id: 'user-2',
        rol: 'ADMINISTRADOR',
        estado: 'bloqueado',
      },
      error: null,
    }), 'user-2');

    expect(blocked.response?.status).toBe(403);
  });

  it('enforces allowed roles', () => {
    const profile: ActiveUserProfile = {
      id: 'user-1',
      rol: 'DONANTE',
      estado: 'activo',
    };

    expect(requireRole(profile, ['ADMINISTRADOR']).response?.status).toBe(403);
    expect(requireRole({ ...profile, rol: 'ADMINISTRADOR' }, ['ADMINISTRADOR']).authorized).toBe(true);
  });

  it('requires an active user with an allowed role', async () => {
    const client = {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: 'user-1' } },
          error: null,
        })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                id: 'user-1',
                rol: 'DONANTE',
                estado: 'activo',
              },
              error: null,
            })),
          })),
        })),
      })),
    } as unknown as SupabaseClient;

    const denied = await requireActiveUserRole(client, ['OPERADOR']);
    expect(denied.response?.status).toBe(403);

    const allowed = await requireActiveUserRole(client, ['DONANTE']);
    expect(allowed.profile?.rol).toBe('DONANTE');
  });
});
