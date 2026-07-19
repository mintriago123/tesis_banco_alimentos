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

describe('/api/proxy/consultar-ruc', () => {
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
      'http://localhost/api/proxy/consultar-ruc?ruc=1710034065001'
    ));

    expect(response.status).toBe(401);
  });

  it('rejects malformed RUC before calling the external service', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(new NextRequest('http://localhost/api/proxy/consultar-ruc?ruc=123'));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the configured service with an encoded valid RUC', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('SERVICIO_CONSULTAS_RUC', 'https://consultas.example.test/ruc');

    const response = await GET(new NextRequest(
      'http://localhost/api/proxy/consultar-ruc?ruc=1710034065001'
    ));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://consultas.example.test/ruc?ruc=1710034065001',
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );
    expect(mocks.adminRpc).toHaveBeenCalledWith('consume_document_lookup_quota', expect.objectContaining({
      p_endpoint: 'consulta_ruc',
      p_limit: 20,
      p_user_id: '11111111-1111-4111-8111-111111111111',
      p_window_seconds: 600,
    }));
    expect(mocks.auditInsert).toHaveBeenCalledWith(expect.objectContaining({
      document_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      endpoint: 'consulta_ruc',
      status: 'allowed',
    }));
    expect(mocks.auditInsert.mock.calls[0][0].document_hash).not.toBe('1710034065001');
  });

  it('rejects non-HTTPS service URLs in production', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SERVICIO_CONSULTAS_RUC', 'http://consultas.example.test/ruc');

    const response = await GET(new NextRequest(
      'https://app.example.test/api/proxy/consultar-ruc?ruc=1710034065001'
    ));

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
  });
});
