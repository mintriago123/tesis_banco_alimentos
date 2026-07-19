import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createAdminSupabaseClient: vi.fn(),
  getUser: vi.fn(),
  adminRpc: vi.fn(),
  adminFrom: vi.fn(),
  auditInsert: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: mocks.createAdminSupabaseClient,
}));

describe('/api/proxy/consultar-cedula', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    mocks.createServerSupabaseClient.mockReset();
    mocks.createAdminSupabaseClient.mockReset();
    mocks.getUser.mockReset();
    mocks.adminRpc.mockReset();
    mocks.adminFrom.mockReset();
    mocks.auditInsert.mockReset();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
      error: null,
    });
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
    });
    mocks.adminRpc.mockResolvedValue({
      data: [{
        allowed: true,
        requests_used: 1,
        reset_at: new Date(Date.now() + 600_000).toISOString(),
      }],
      error: null,
    });
    mocks.auditInsert.mockResolvedValue({ error: null });
    mocks.adminFrom.mockReturnValue({
      insert: mocks.auditInsert,
    });
    mocks.createAdminSupabaseClient.mockReturnValue({
      rpc: mocks.adminRpc,
      from: mocks.adminFrom,
    });
  });

  it('requires an authenticated session', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const response = await GET(new NextRequest(
      'http://localhost/api/proxy/consultar-cedula?identificacion=1710034065'
    ));

    expect(response.status).toBe(401);
  });

  it('rejects malformed cedula before calling the external service', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(new NextRequest(
      'http://localhost/api/proxy/consultar-cedula?identificacion=123'
    ));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-HTTPS service URLs in production', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SERVICIO_CONSULTAS_DINARAP', 'http://consultas.example.test/cedula');

    const response = await GET(new NextRequest(
      'https://app.example.test/api/proxy/consultar-cedula?identificacion=1710034065'
    ));

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
  });

  it('returns 429 when the server-side rate limit is exceeded', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('SERVICIO_CONSULTAS_DINARAP', 'https://consultas.example.test/cedula');
    mocks.adminRpc.mockResolvedValue({
      data: [{
        allowed: false,
        requests_used: 20,
        reset_at: new Date(Date.now() + 600_000).toISOString(),
      }],
      error: null,
    });

    const response = await GET(new NextRequest(
      'http://localhost/api/proxy/consultar-cedula?identificacion=1710034065'
    ));

    expect(response.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.auditInsert).toHaveBeenCalledWith(expect.objectContaining({
      document_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      endpoint: 'consulta_cedula',
      status: 'blocked_rate_limit',
      user_id: '11111111-1111-4111-8111-111111111111',
    }));
    expect(mocks.auditInsert.mock.calls[0][0].document_hash).not.toBe('1710034065');
  });
});
