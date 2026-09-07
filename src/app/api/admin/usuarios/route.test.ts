import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH } from './route';

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createAdminSupabaseClient: vi.fn(),
  serverGetUser: vi.fn(),
  userFrom: vi.fn(),
  adminFrom: vi.fn(),
  adminFromQueue: [] as unknown[],
  userFromQueue: [] as unknown[],
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: mocks.createAdminSupabaseClient,
}));

const patchRequest = (body: unknown) =>
  new Request('http://localhost/api/admin/usuarios', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
    },
    body: JSON.stringify(body),
  });

const createProfileQuery = (profile: unknown) => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({
        data: profile,
        error: null,
      })),
    })),
  })),
});

const createUpdateQuery = (error: { message: string } | null = null) => {
  const eq = vi.fn(async () => ({ error }));
  const update = vi.fn(() => ({ eq }));

  return { update, eq };
};

const enqueueUserProfile = (overrides: Record<string, unknown> = {}) => {
  mocks.userFromQueue.push(createProfileQuery({
    id: 'admin-1',
    rol: 'ADMINISTRADOR',
    estado: 'activo',
    nombre: 'Admin',
    email: 'admin@example.com',
    ...overrides,
  }));
};

beforeEach(() => {
  mocks.createServerSupabaseClient.mockReset();
  mocks.createAdminSupabaseClient.mockReset();
  mocks.serverGetUser.mockReset();
  mocks.userFrom.mockReset();
  mocks.adminFrom.mockReset();
  mocks.adminFromQueue.length = 0;
  mocks.userFromQueue.length = 0;

  mocks.serverGetUser.mockResolvedValue({
    data: { user: { id: 'admin-1', email: 'admin@example.com' } },
    error: null,
  });

  enqueueUserProfile();

  mocks.userFrom.mockImplementation(() => {
    const query = mocks.userFromQueue.shift();
    if (!query) {
      throw new Error('Unexpected user query');
    }
    return query;
  });
  mocks.adminFrom.mockImplementation(() => {
    const query = mocks.adminFromQueue.shift();
    if (!query) {
      throw new Error('Unexpected admin query');
    }
    return query;
  });

  mocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getUser: mocks.serverGetUser },
    from: mocks.userFrom,
  });
  mocks.createAdminSupabaseClient.mockReturnValue({
    from: mocks.adminFrom,
  });
});

describe('PATCH /api/admin/usuarios', () => {
  it('rejects PATCH without an authenticated session', async () => {
    mocks.serverGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const response = await PATCH(patchRequest({
      userId: 'user-1',
      updates: { estado: 'activo' },
    }));

    expect(response.status).toBe(401);
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it('rejects PATCH for a non-admin active user', async () => {
    mocks.userFromQueue.length = 0;
    enqueueUserProfile({ rol: 'DONANTE' });

    const response = await PATCH(patchRequest({
      userId: 'user-1',
      updates: { estado: 'activo' },
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Rol no permitido.' });
  });

  it('rejects fields outside the PATCH whitelist', async () => {
    const response = await PATCH(patchRequest({
      userId: 'user-1',
      updates: { email: 'edited@example.com' },
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Campos no permitidos: email.' });
  });

  it('updates only sanitized PATCH fields for an active admin', async () => {
    const updateQuery = createUpdateQuery();
    mocks.adminFromQueue.push(updateQuery);

    const response = await PATCH(patchRequest({
      userId: 'user-1',
      updates: {
        rol: 'OPERADOR',
        estado: 'bloqueado',
        motivo_bloqueo: 'Revisión administrativa',
      },
    }));

    expect(response.status).toBe(200);
    expect(updateQuery.update).toHaveBeenCalledWith({
      estado: 'bloqueado',
      motivo_bloqueo: 'Revisión administrativa',
      rol: 'OPERADOR',
    });
    expect(updateQuery.eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('returns database errors from PATCH and handles invalid JSON', async () => {
    const updateQuery = createUpdateQuery({ message: 'update failed' });
    mocks.adminFromQueue.push(updateQuery);

    const response = await PATCH(patchRequest({
      userId: 'user-1',
      updates: { estado: 'activo' },
    }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: 'No fue posible actualizar el usuario',
      details: 'update failed',
    });

    mocks.userFromQueue.length = 0;
    enqueueUserProfile();
    const invalidJson = new Request('http://localhost/api/admin/usuarios', {
      method: 'PATCH',
      headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    const invalidResponse = await PATCH(invalidJson);
    expect(invalidResponse.status).toBe(400);
  });
});