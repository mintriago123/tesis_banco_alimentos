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

describe('/api/operador/alertas-vencimiento', () => {
  it('returns 401 without an authenticated session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET(new NextRequest(
      'http://localhost/api/operador/alertas-vencimiento'
    ));

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it('rejects active users without operator or admin permissions', async () => {
    mocks.from.mockReturnValue(createProfileQuery({
      id: USER_ID,
      rol: 'DONANTE',
      estado: 'activo',
    }));

    const response = await GET(new NextRequest(
      'http://localhost/api/operador/alertas-vencimiento'
    ));

    expect(response.status).toBe(403);
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it('rejects invalid alert filters before calling the RPC', async () => {
    const response = await GET(new NextRequest(
      'http://localhost/api/operador/alertas-vencimiento?dias=0&prioridad=urgente'
    ));

    expect(response.status).toBe(400);
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('calls the RPC and filters vencidos with normalized quantities', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: [
        {
          id_entrada: 'entry-1',
          id_producto: 'product-1',
          nombre_producto: 'Arroz',
          cantidad_disponible: '5.5',
          fecha_caducidad: '2026-07-20',
          dias_para_vencer: -2,
          id_deposito: 'warehouse-1',
          nombre_deposito: 'Bodega principal',
          unidad_simbolo: 'kg',
          prioridad: 'vencido',
        },
        {
          id_entrada: 'entry-2',
          id_producto: 'product-2',
          nombre_producto: 'Lenteja',
          cantidad_disponible: 3,
          fecha_caducidad: '2026-07-30',
          dias_para_vencer: 8,
          id_deposito: 'warehouse-1',
          nombre_deposito: 'Bodega principal',
          unidad_simbolo: 'kg',
          prioridad: 'media',
        },
      ],
      error: null,
    });

    const response = await GET(new NextRequest(
      'http://localhost/api/operador/alertas-vencimiento?dias=30&solo_vencidos=true'
    ));

    expect(response.status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenCalledWith('obtener_productos_proximos_vencer', {
      p_dias_umbral: 30,
    });
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      configuracion: { dias_umbral: 30, solo_vencidos: true },
      estadisticas: {
        total: 1,
        total_vencidos: 1,
        total_proximos: 0,
        cantidad_total_vencidos: 5.5,
      },
      alertas: [{
        id_entrada: 'entry-1',
        cantidad_disponible: 5.5,
        estado: 'vencido',
      }],
    });
  });

  it('returns 500 when the alerts RPC fails', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: null,
      error: { message: 'database unavailable' },
    });

    const response = await GET(new NextRequest(
      'http://localhost/api/operador/alertas-vencimiento'
    ));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Error al consultar productos próximos a vencer',
    });
  });
});
