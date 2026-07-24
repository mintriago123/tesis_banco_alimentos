import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ENTRADA_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createAdminSupabaseClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  adminRpc: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: mocks.createAdminSupabaseClient,
}));

const jsonRequest = (body: unknown) =>
  new NextRequest('http://localhost/api/operador/bajas', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
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
  mocks.createServerSupabaseClient.mockReset();
  mocks.createAdminSupabaseClient.mockReset();
  mocks.getUser.mockReset();
  mocks.from.mockReset();
  mocks.rpc.mockReset();
  mocks.adminRpc.mockReset();

  mocks.getUser.mockResolvedValue({
    data: { user: { id: USER_ID } },
    error: null,
  });
  mocks.from.mockReturnValue(createUsuarioQuery({
    id: USER_ID,
    rol: 'OPERADOR',
    estado: 'activo',
  }));
  mocks.adminRpc.mockResolvedValue({
    data: [{
      success: true,
      message: 'Baja registrada',
      id_baja: '33333333-3333-4333-8333-333333333333',
      cantidad_restante: 4,
    }],
    error: null,
  });
  mocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc,
  });
  mocks.createAdminSupabaseClient.mockReturnValue({
    rpc: mocks.adminRpc,
  });
});

describe('/api/operador/bajas', () => {
  it('returns 401 before validating payload when session is missing', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const response = await POST(jsonRequest({
      id_entrada: 'not-a-uuid',
      cantidad: '30abc',
      motivo: 'otro',
    }));

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('rejects active users without operator permissions', async () => {
    mocks.from.mockReturnValue(createUsuarioQuery({
      id: USER_ID,
      rol: 'DONANTE',
      estado: 'activo',
    }));

    const response = await GET(new NextRequest('http://localhost/api/operador/bajas'));

    expect(response.status).toBe(403);
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('rejects invalid body before calling the RPC', async () => {
    const response = await POST(jsonRequest({
      id_entrada: 'not-a-uuid',
      cantidad: 1,
      motivo: 'otro',
    }));

    expect(response.status).toBe(400);
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('calls the RPC with sanitized valid input', async () => {
    const response = await POST(jsonRequest({
      id_entrada: ENTRADA_ID,
      cantidad: '2.5',
      motivo: 'vencido',
      observaciones: '  Producto vencido en bodega  ',
    }));

    expect(response.status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenCalledWith('dar_baja_producto', {
      p_id_entrada: ENTRADA_ID,
      p_cantidad: 2.5,
      p_motivo: 'vencido',
      p_usuario_id: USER_ID,
      p_observaciones: 'Producto vencido en bodega',
    });
  });

  it('returns 500 when the baja RPC fails', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: null,
      error: { message: 'database unavailable' },
    });

    const response = await POST(jsonRequest({
      id_entrada: ENTRADA_ID,
      cantidad: 2,
      motivo: 'vencido',
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Error al procesar la baja del producto',
      details: 'database unavailable',
    });
  });
});
