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
});
