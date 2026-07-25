import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { generarURLComprobante } from '@/lib/comprobante';
import { GET } from './route';

const DONOR_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_DONOR_ID = '22222222-2222-4222-8222-222222222222';

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  dataQueue: [] as unknown[],
}));

let currentProfile: unknown;

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

const createDataQuery = (result: QueryResult) => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(async () => result),
  };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
};

const getComprobante = (codigo: string) => GET(
  new NextRequest(`http://localhost/api/comprobante/${encodeURIComponent(codigo)}`),
  { params: Promise.resolve({ codigo }) }
);

const donationRow = (userId: string) => ({
  id: 10,
  user_id: userId,
  codigo_comprobante: 'DON-10-ABC',
  actualizado_en: null,
  creado_en: '2026-07-20T00:00:00.000Z',
  nombre_donante: 'Donante de prueba',
  email: 'donante@example.com',
  telefono: '0999999999',
  direccion_donante_completa: 'Dirección de prueba',
  cedula_donante: '1710034065',
  ruc_donante: null,
  tipo_producto: 'Arroz',
  cantidad: 10,
  unidad_simbolo: 'kg',
  estado: 'Aprobada',
});

const solicitudRow = (userId: string) => ({
  id: '33333333-3333-4333-8333-333333333333',
  usuario_id: userId,
  tipo_alimento: 'Arroz',
  cantidad: 5,
  estado: 'aprobada',
  created_at: '2026-07-20T00:00:00.000Z',
  fecha_respuesta: '2026-07-21T00:00:00.000Z',
  comentario_admin: null,
  codigo_comprobante: 'SOL-333-ABC',
  unidades: { id: 1, nombre: 'Kilogramo', simbolo: 'kg' },
  usuarios: {
    nombre: 'Solicitante',
    cedula: '1710034065',
    telefono: '0999999999',
    email: 'solicitante@example.com',
    direccion: 'Dirección de prueba',
  },
});

beforeEach(() => {
  currentProfile = {
    id: DONOR_ID,
    rol: 'DONANTE',
    estado: 'activo',
  };
  mocks.createServerSupabaseClient.mockReset();
  mocks.getUser.mockReset();
  mocks.from.mockReset();
  mocks.dataQueue.length = 0;

  mocks.getUser.mockResolvedValue({
    data: { user: { id: DONOR_ID } },
    error: null,
  });
  mocks.from.mockImplementation((table: string) => {
    if (table === 'usuarios') {
      return createProfileQuery(currentProfile);
    }

    const query = mocks.dataQueue.shift();
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

describe('/api/comprobante/[codigo]', () => {
  it('rejects a missing code before creating the Supabase client', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/comprobante/'),
      { params: Promise.resolve({ codigo: '' }) }
    );

    expect(response.status).toBe(400);
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('returns 401 without an authenticated session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await getComprobante('DON-10-ABC');

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects malformed readable codes before querying a record', async () => {
    const response = await getComprobante('codigo inseguro');

    expect(response.status).toBe(400);
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.dataQueue).toHaveLength(0);
  });

  it('denies a donor access to another donor donation', async () => {
    mocks.dataQueue.push(createDataQuery({ data: donationRow(OTHER_DONOR_ID), error: null }));

    const response = await getComprobante('DON-10-ABC');

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'No tienes permisos para ver este comprobante',
    });
  });

  it('allows a donor to view their own donation receipt', async () => {
    mocks.dataQueue.push(createDataQuery({ data: donationRow(DONOR_ID), error: null }));

    const response = await getComprobante('DON-10-ABC');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      tipo: 'donacion',
      comprobante: {
        codigoComprobante: 'DON-10-ABC',
        pedido: {
          tipo: 'donacion',
          tipoAlimento: 'Arroz',
          cantidad: 10,
        },
      },
    });
  });

  it('allows an administrator to view a request receipt', async () => {
    currentProfile = {
      id: DONOR_ID,
      rol: 'ADMINISTRADOR',
      estado: 'activo',
    };
    mocks.dataQueue.push(createDataQuery({
      data: solicitudRow(OTHER_DONOR_ID),
      error: null,
    }));

    const response = await getComprobante('SOL-333-ABC');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      tipo: 'solicitud',
      comprobante: {
        codigoComprobante: 'SOL-333-ABC',
        pedido: {
          tipo: 'solicitud',
          tipoAlimento: 'Arroz',
          cantidad: 5,
        },
      },
    });
  });

  it('returns 404 when a valid readable code has no record', async () => {
    mocks.dataQueue.push(createDataQuery({ data: null, error: { message: 'not found' } }));

    const response = await getComprobante('DON-10-ABC');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Donación no encontrada',
    });
  });

  it('rejects codes that exceed the maximum length', async () => {
    const response = await getComprobante('x'.repeat(2049));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Código de comprobante demasiado largo',
    });
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('denies a donor access to another user request', async () => {
    mocks.dataQueue.push(createDataQuery({
      data: solicitudRow(OTHER_DONOR_ID),
      error: null,
    }));

    const response = await getComprobante('SOL-333-ABC');

    expect(response.status).toBe(403);
  });

  it('allows an owner to view a request receipt', async () => {
    mocks.dataQueue.push(createDataQuery({
      data: solicitudRow(DONOR_ID),
      error: null,
    }));

    const response = await getComprobante('SOL-333-ABC');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tipo: 'solicitud',
      comprobante: {
        pedido: { tipo: 'solicitud', unidad: 'kg' },
      },
    });
  });

  it('resolves a valid donation QR payload', async () => {
    const url = generarURLComprobante(
      'http://localhost:3000',
      'DON-10-ABC',
      'donacion',
      DONOR_ID,
      '10',
    );
    const encoded = url.split('/').pop() ?? '';
    mocks.dataQueue.push(createDataQuery({ data: donationRow(DONOR_ID), error: null }));

    const response = await getComprobante(encoded);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      tipo: 'donacion',
    });
  });

  it('validates QR payload type and corrupted payloads before querying records', async () => {
    const payload = {
      c: 'DON-10-ABC',
      t: 'X',
      u: DONOR_ID,
      p: '10',
      f: String(Date.now()),
    };
    const checksum = createHash('sha256')
      .update(`${payload.c}|${payload.t}|${payload.u}|${payload.p}|${payload.f}`)
      .digest('hex')
      .substring(0, 8);
    const encoded = Buffer.from(JSON.stringify({ ...payload, v: checksum })).toString('base64url');

    const invalidType = await getComprobante(encoded);
    expect(invalidType.status).toBe(400);
    await expect(invalidType.json()).resolves.toEqual({ error: 'Tipo de comprobante inválido' });

    const invalidChecksum = await getComprobante(`${encoded.slice(0, -1)}A`);
    expect(invalidChecksum.status).toBe(400);
    expect(mocks.dataQueue).toHaveLength(0);
  });
});
