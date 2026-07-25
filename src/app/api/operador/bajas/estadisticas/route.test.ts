import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const USER_ID = '11111111-1111-4111-8111-111111111111';

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

const createProfileQuery = (profile: unknown) => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: profile, error: null })),
  };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
};

beforeEach(() => {
  mocks.createServerSupabaseClient.mockReset();
  mocks.createAdminSupabaseClient.mockReset();
  mocks.getUser.mockReset();
  mocks.from.mockReset();
  mocks.adminRpc.mockReset();

  mocks.getUser.mockResolvedValue({
    data: { user: { id: USER_ID } },
    error: null,
  });
  mocks.from.mockReturnValue(createProfileQuery({
    id: USER_ID,
    rol: 'OPERADOR',
    estado: 'activo',
  }));
  mocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  });
  mocks.adminRpc.mockResolvedValue({ data: [], error: null });
  mocks.createAdminSupabaseClient.mockReturnValue({ rpc: mocks.adminRpc });
});

describe('/api/operador/bajas/estadisticas', () => {
  it('returns 401 without an authenticated session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET(new NextRequest(
      'http://localhost/api/operador/bajas/estadisticas'
    ));

    expect(response.status).toBe(401);
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it('rejects active users without operator or admin permissions', async () => {
    mocks.from.mockReturnValue(createProfileQuery({
      id: USER_ID,
      rol: 'DONANTE',
      estado: 'activo',
    }));

    const response = await GET(new NextRequest(
      'http://localhost/api/operador/bajas/estadisticas'
    ));

    expect(response.status).toBe(403);
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('rejects a period outside the allowed range before calling the RPC', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/operador/bajas/estadisticas?periodo=366'
    ));

    expect(response.status).toBe(400);
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('calls the statistics RPC with the requested period and normalizes values', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: [{
        total_bajas: '4',
        total_cantidad: '12.5',
        bajas_por_vencido: '2',
        bajas_por_danado: '1',
        bajas_por_contaminado: '0',
        bajas_por_rechazado: '1',
        bajas_por_otro: '0',
        cantidad_vencido: '7.5',
        cantidad_danado: '2',
        cantidad_contaminado: '0',
        cantidad_rechazado: '3',
        cantidad_otro: '0',
      }],
      error: null,
    });

    const response = await GET(new NextRequest(
      'http://localhost/api/operador/bajas/estadisticas?periodo=14'
    ));

    expect(response.status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenCalledWith('obtener_estadisticas_bajas', {
      p_fecha_inicio: expect.any(String),
      p_fecha_fin: expect.any(String),
    });
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      periodo: { dias: 14 },
      estadisticas: {
        total: { bajas: 4, cantidad: 12.5 },
        por_motivo: {
          vencido: { bajas: 2, cantidad: 7.5 },
          rechazado: { bajas: 1, cantidad: 3 },
        },
      },
    });
  });

  it('returns zero statistics when the RPC has no rows', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/operador/bajas/estadisticas'
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      periodo: { dias: 30 },
      estadisticas: {
        total: { bajas: 0, cantidad: 0 },
      },
    });
  });

  it('returns 500 when the statistics RPC fails', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: null,
      error: { message: 'database unavailable' },
    });

    const response = await GET(new NextRequest(
      'http://localhost/api/operador/bajas/estadisticas'
    ));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Error al consultar estadísticas',
    });
  });
});
