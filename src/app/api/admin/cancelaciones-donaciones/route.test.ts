import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CANCELLER_ID = '22222222-2222-4222-8222-222222222222';

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  queryQueue: [] as unknown[],
}));

let currentProfile: unknown;
let profileLookupPending = true;

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
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

const createListQuery = (result: QueryResult) => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    in: vi.fn(),
    not: vi.fn(),
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.range.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.not.mockReturnValue(query);
  return query;
};

const cancelledDonation = {
  id: 10,
  user_id: '33333333-3333-4333-8333-333333333333',
  nombre_donante: 'Donante de prueba',
  tipo_producto: 'Arroz',
  cantidad: 10,
  unidad_nombre: 'Kilogramo',
  unidad_simbolo: 'kg',
  estado: 'Cancelada',
  motivo_cancelacion: 'otro',
  observaciones_cancelacion: 'Producto no disponible',
  usuario_cancelacion_id: CANCELLER_ID,
  fecha_cancelacion: '2026-07-20T00:00:00.000Z',
  fecha_disponible: '2026-07-21',
  creado_en: '2026-07-19T00:00:00.000Z',
  categoria_comida: 'Granos',
  direccion_entrega: 'Dirección de prueba',
  telefono: '0999999999',
  email: 'donante@example.com',
  impacto_estimado_personas: 5,
  codigo_comprobante: 'DON-10-ABC',
};

const createRequest = (query = '') => new NextRequest(
  `http://localhost/api/admin/cancelaciones-donaciones${query}`
);

beforeEach(() => {
  currentProfile = {
    id: ADMIN_ID,
    rol: 'ADMINISTRADOR',
    estado: 'activo',
  };
  profileLookupPending = true;
  mocks.createServerSupabaseClient.mockReset();
  mocks.getUser.mockReset();
  mocks.from.mockReset();
  mocks.queryQueue.length = 0;

  mocks.getUser.mockResolvedValue({
    data: { user: { id: ADMIN_ID } },
    error: null,
  });
  mocks.from.mockImplementation((table: string) => {
    if (table === 'usuarios' && profileLookupPending) {
      profileLookupPending = false;
      return createProfileQuery(currentProfile);
    }

    const query = mocks.queryQueue.shift();
    if (!query) {
      throw new Error(`Unexpected query for table ${table}`);
    }

    return query;
  });
  mocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  });
});

describe('/api/admin/cancelaciones-donaciones', () => {
  it('returns 401 without an authenticated session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects active users without administrator permissions', async () => {
    currentProfile = {
      id: ADMIN_ID,
      rol: 'OPERADOR',
      estado: 'activo',
    };

    const response = await GET(createRequest());

    expect(response.status).toBe(403);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it('rejects inverted date ranges before querying donations', async () => {
    const response = await GET(createRequest(
      '?fecha_inicio=2026-07-31&fecha_fin=2026-07-01'
    ));

    expect(response.status).toBe(400);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it('returns filtered cancellations and calculated statistics', async () => {
    const listQuery = createListQuery({
      data: [cancelledDonation],
      error: null,
      count: 3,
    });
    const usersQuery = createListQuery({
      data: [{
        id: CANCELLER_ID,
        nombre: 'Administrador',
        email: 'admin@example.com',
        rol: 'ADMINISTRADOR',
      }],
      error: null,
      count: null,
    });
    const statsQuery = createListQuery({
      data: [
        { motivo_cancelacion: 'otro', cantidad: 10 },
        { motivo_cancelacion: 'otro', cantidad: 2 },
      ],
      error: null,
      count: null,
    });
    mocks.queryQueue.push(listQuery, usersQuery, statsQuery);

    const response = await GET(createRequest(
      '?motivo=otro&fecha_inicio=2026-07-01&fecha_fin=2026-07-31&limit=10&offset=5&estadisticas=true'
    ));

    expect(response.status).toBe(200);
    expect(listQuery.eq).toHaveBeenCalledWith('motivo_cancelacion', 'otro');
    expect(listQuery.gte).toHaveBeenCalledWith('fecha_cancelacion', '2026-07-01');
    expect(listQuery.range).toHaveBeenCalledWith(5, 14);
    expect(usersQuery.in).toHaveBeenCalledWith('id', [CANCELLER_ID]);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      pagination: { total: 3, offset: 5, limit: 10, has_more: false },
      data: [{
        id: 10,
        usuario_cancelacion_nombre: 'Administrador',
        usuario_cancelacion_email: 'admin@example.com',
        usuario_cancelacion_rol: 'ADMINISTRADOR',
      }],
      estadisticas: {
        total: { cancelaciones: 2, cantidad_total: 12 },
        por_motivo: {
          otro: { cancelaciones: 2, cantidad: 12 },
        },
      },
    });
  });

  it('returns a specific database error when cancellation fields are missing', async () => {
    mocks.queryQueue.push(createListQuery({
      data: null,
      error: { message: 'column motivo_cancelacion does not exist', code: '42703' },
      count: null,
    }));

    const response = await GET(createRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('Ejecuta las migraciones de supabase/migrations/'),
      details: 'column motivo_cancelacion does not exist',
    });
  });
});
