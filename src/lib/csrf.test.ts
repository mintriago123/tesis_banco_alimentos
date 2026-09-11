import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateCsrfRequest } from './csrf';

describe('validateCsrfRequest', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects requests from an external Origin', async () => {
    vi.stubEnv('APP_ORIGIN', 'https://app.example.test');

    const response = validateCsrfRequest(new Request('https://app.example.test/api/admin/usuarios', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example.test',
      },
    }));

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: 'Origen de la solicitud no permitido.',
    });
  });

  it('accepts requests from APP_ORIGIN', () => {
    vi.stubEnv('APP_ORIGIN', 'https://app.example.test');

    const response = validateCsrfRequest(new Request('https://app.example.test/api/admin/usuarios', {
      method: 'POST',
      headers: {
        Origin: 'https://app.example.test',
      },
    }));

    expect(response).toBeNull();
  });

  it('accepts Referer when Origin is absent', () => {
    vi.stubEnv('APP_ORIGIN', 'https://app.example.test');

    const response = validateCsrfRequest(new Request('https://app.example.test/api/admin/usuarios', {
      method: 'POST',
      headers: {
        Referer: 'https://app.example.test/admin/usuarios',
      },
    }));

    expect(response).toBeNull();
  });
});
