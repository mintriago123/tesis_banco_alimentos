import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

describe('/api/proxy/consultar-ruc', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
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
  });
});

