import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH, POST } from './route';

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createAdminSupabaseClient: vi.fn(),
  serverGetUser: vi.fn(),
  adminCreateUser: vi.fn(),
  adminFrom: vi.fn(),
  adminFromQueue: [] as unknown[],
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: mocks.createAdminSupabaseClient,
}));

const jsonRequest = (method: 'POST' | 'PATCH', body: unknown) =>
  new Request('http://localhost/api/admin/usuarios', {
    method,
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

const createUpdateQuery = () => {
  const eq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq }));

  return { update, eq };
};

const createUpsertQuery = () => {
  const single = vi.fn(async () => ({ data: { id: 'created-user' }, error: null }));
  const select = vi.fn(() => ({ single }));
  const upsert = vi.fn(() => ({ select }));

  return { upsert, select, single };
};

const enqueueProfile = (overrides: Record<string, unknown> = {}) => {
  mocks.adminFromQueue.push(createProfileQuery({
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
  mocks.adminCreateUser.mockReset();
  mocks.adminFrom.mockReset();
  mocks.adminFromQueue.length = 0;

  mocks.serverGetUser.mockResolvedValue({
    data: { user: { id: 'admin-1', email: 'admin@example.com' } },
    error: null,
  });
  mocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getUser: mocks.serverGetUser },
  });
  mocks.createAdminSupabaseClient.mockReturnValue({
    auth: {
      admin: {
        createUser: mocks.adminCreateUser,
      },
    },
    from: mocks.adminFrom,
  });
  mocks.adminFrom.mockImplementation(() => {
    const query = mocks.adminFromQueue.shift();

    if (!query) {
      throw new Error('Unexpected admin query');
    }

    return query;
  });
});

describe('/api/admin/usuarios', () => {
  it('rejects PATCH without an authenticated session', async () => {
    mocks.serverGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const response = await PATCH(jsonRequest('PATCH', {
      userId: 'user-1',
      updates: { estado: 'activo' },
    }));

    expect(response.status).toBe(401);
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it('rejects PATCH for a non-admin active user', async () => {
    enqueueProfile({ rol: 'DONANTE' });

    const response = await PATCH(jsonRequest('PATCH', {
      userId: 'user-1',
      updates: { estado: 'activo' },
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Rol no permitido.' });
  });

  it('rejects fields outside the PATCH whitelist', async () => {
    enqueueProfile();

    const response = await PATCH(jsonRequest('PATCH', {
      userId: 'user-1',
      updates: { email: 'edited@example.com' },
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Campos no permitidos: email.' });
    expect(mocks.adminFrom).toHaveBeenCalledTimes(1);
  });

  it('updates only sanitized PATCH fields for an active admin', async () => {
    const updateQuery = createUpdateQuery();
    enqueueProfile();
    mocks.adminFromQueue.push(updateQuery);

    const response = await PATCH(jsonRequest('PATCH', {
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

  it('allows an active admin to create users', async () => {
    const upsertQuery = createUpsertQuery();
    enqueueProfile();
    mocks.adminFromQueue.push(upsertQuery);
    mocks.adminCreateUser.mockResolvedValue({
      data: { user: { id: 'new-user-1' } },
      error: null,
    });

    const response = await POST(jsonRequest('POST', {
      email: 'new@example.com',
      password: 'secret-password',
      rol: 'DONANTE',
      nombre: 'New User',
    }));

    expect(response.status).toBe(200);
    expect(mocks.adminCreateUser).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'secret-password',
      email_confirm: true,
    });
    expect(upsertQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'new-user-1',
        email: 'new@example.com',
        rol: 'DONANTE',
        estado: 'activo',
      }),
      { onConflict: 'id' }
    );
    await expect(response.json()).resolves.toEqual({
      id: 'new-user-1',
      email: 'new@example.com',
      rol: 'DONANTE',
    });
  });
});
