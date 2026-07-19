import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

describe('/api/proxy/consultar-cedula', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    mocks.createServerSupabaseClient.mockReset();
    mocks.getUser.mockReset();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
      error: null,
    });
    mocks.createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
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
});
