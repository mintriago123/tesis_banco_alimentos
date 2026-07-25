import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const SOLICITUD_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createAdminSupabaseClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  adminRpc: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: mocks.createAdminSupabaseClient,
}));

const jsonRequest = (body: unknown, origin = 'http://localhost') =>
  new Request('http://localhost/api/admin/catalogo-solicitudes/aprobar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify(body),
  });

const createUsuarioQuery = (profile: unknown) => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({
        data: profile,
        error: null,
      })),
    })),
  })),
});

beforeEach(() => {
  vi.unstubAllEnvs();
  mocks.createServerSupabaseClient.mockReset();
  mocks.createAdminSupabaseClient.mockReset();
  mocks.getUser.mockReset();
  mocks.from.mockReset();
  mocks.adminRpc.mockReset();

  mocks.getUser.mockResolvedValue({
    data: { user: { id: ADMIN_ID } },
    error: null,
  });
  mocks.from.mockReturnValue(createUsuarioQuery({
    id: ADMIN_ID,
    rol: 'ADMINISTRADOR',
    estado: 'activo',
  }));
  mocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  });
  mocks.adminRpc.mockResolvedValue({ data: 123, error: null });
  mocks.createAdminSupabaseClient.mockReturnValue({
    rpc: mocks.adminRpc,
  });
});

describe('/api/admin/catalogo-solicitudes/aprobar', () => {
  it('rejects requests from an external Origin before auth', async () => {
    const response = await POST(jsonRequest({
      solicitudId: SOLICITUD_ID,
      nombre: 'Arroz',
      categoria: 'Granos',
      unidadIds: [1],
    }, 'https://evil.example.test'));

    expect(response.status).toBe(403);
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('rejects active users without admin permissions', async () => {
    mocks.from.mockReturnValue(createUsuarioQuery({
      id: ADMIN_ID,
      rol: 'OPERADOR',
      estado: 'activo',
    }));

    const response = await POST(jsonRequest({
      solicitudId: SOLICITUD_ID,
      nombre: 'Arroz',
      categoria: 'Granos',
      unidadIds: [1],
    }));

    expect(response.status).toBe(403);
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('approves a valid request through the server-only RPC', async () => {
    const response = await POST(jsonRequest({
      solicitudId: SOLICITUD_ID,
      nombre: ' Arroz ',
      categoria: ' Granos ',
      unidadIds: [1, 2],
      unidadPrincipalId: 1,
    }));

    expect(response.status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenCalledWith('aprobar_solicitud_alta_alimento_server', {
      p_admin_id: ADMIN_ID,
      p_categoria: 'Granos',
      p_nombre: 'Arroz',
      p_solicitud_id: SOLICITUD_ID,
      p_unidad_ids: [1, 2],
      p_unidad_principal_id: 1,
    });
    await expect(response.json()).resolves.toEqual({ alimentoId: 123 });
  });

  it('rejects invalid unit selections before invoking the RPC', async () => {
    const response = await POST(jsonRequest({
      solicitudId: SOLICITUD_ID,
      nombre: 'Arroz',
      categoria: 'Granos',
      unidadIds: [1],
      unidadPrincipalId: 2,
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'La unidad principal debe estar seleccionada',
    });
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('rejects incomplete or oversized request payloads', async () => {
    const emptyFields = await POST(jsonRequest({
      solicitudId: SOLICITUD_ID,
      nombre: ' ',
      categoria: 'Granos',
      unidadIds: [1],
    }));
    expect(emptyFields.status).toBe(400);

    const oversized = await POST(jsonRequest({
      solicitudId: SOLICITUD_ID,
      nombre: 'Arroz',
      categoria: 'Granos',
      unidadIds: Array.from({ length: 51 }, (_, index) => index + 1),
    }));
    expect(oversized.status).toBe(400);
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('returns RPC and malformed-result errors', async () => {
    mocks.adminRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc failed' } });
    const rpcError = await POST(jsonRequest({
      solicitudId: SOLICITUD_ID,
      nombre: 'Arroz',
      categoria: 'Granos',
      unidadIds: [1],
    }));
    expect(rpcError.status).toBe(500);
    await expect(rpcError.json()).resolves.toEqual({ error: 'rpc failed' });

    mocks.adminRpc.mockResolvedValueOnce({ data: 'not-an-id', error: null });
    const invalidResult = await POST(jsonRequest({
      solicitudId: SOLICITUD_ID,
      nombre: 'Arroz',
      categoria: 'Granos',
      unidadIds: [1],
    }));
    expect(invalidResult.status).toBe(500);
    await expect(invalidResult.json()).resolves.toMatchObject({
      error: expect.stringContaining('respuesta del alimento creado'),
    });
  });
});
