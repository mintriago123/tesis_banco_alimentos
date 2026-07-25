import { describe, expect, it } from 'vitest';
import {
  parseEnumParam,
  parseIsoDateParam,
  parsePaginationParams,
  parsePositiveIntParam,
  parsePositiveNumber,
  parseUuid,
  readJsonObject,
} from './api-validation';
import { escapeLikePattern } from './validation-core';

describe('api-validation', () => {
  it('reads only JSON objects', async () => {
    const valid = await readJsonObject(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ ok: true }),
    }));
    expect(valid.success).toBe(true);

    const invalid = await readJsonObject(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify(['nope']),
    }));
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.response.status).toBe(400);
    }
  });

  it('rejects ambiguous integers', async () => {
    for (const value of ['abc', '30abc', '1.5', '-1', '1e3']) {
      const result = parsePositiveIntParam(value, { name: 'dias', min: 1, max: 365 });
      expect(result.success).toBe(false);
    }

    expect(parsePositiveIntParam('30', { name: 'dias', min: 1, max: 365 }))
      .toEqual({ success: true, value: 30 });
  });

  it('rejects invalid positive numbers', () => {
    for (const value of ['abc', '30abc', '0', '-1', 'Infinity']) {
      const result = parsePositiveNumber(value, { name: 'cantidad' });
      expect(result.success).toBe(false);
    }

    expect(parsePositiveNumber('2.5', { name: 'cantidad' }))
      .toEqual({ success: true, value: 2.5 });
  });

  it('validates enums, UUIDs, ISO dates and pagination ranges', () => {
    expect(parseEnumParam('alta', ['alta', 'media'] as const, { name: 'prioridad' }))
      .toEqual({ success: true, value: 'alta' });
    expect(parseEnumParam('otra', ['alta', 'media'] as const, { name: 'prioridad' }).success)
      .toBe(false);

    expect(parseUuid('11111111-1111-4111-8111-111111111111', { name: 'id' }).success)
      .toBe(true);
    expect(parseUuid('not-a-uuid', { name: 'id' }).success).toBe(false);

    expect(parseIsoDateParam('2026-02-30', { name: 'fecha' }).success).toBe(false);
    expect(parseIsoDateParam('2026-02-28', { name: 'fecha' }))
      .toEqual({ success: true, value: '2026-02-28' });

    const pagination = parsePaginationParams(new URLSearchParams('limit=200&offset=0'), {
      defaultLimit: 50,
      maxLimit: 200,
    });
    expect(pagination).toEqual({ success: true, value: { limit: 200, offset: 0 } });
    expect(parsePaginationParams(new URLSearchParams('limit=201'), {
      defaultLimit: 50,
      maxLimit: 200,
    }).success).toBe(false);
  });

  it('escapes LIKE wildcards from user input', () => {
    expect(escapeLikePattern('10%_stock\\test')).toBe('10\\%\\_stock\\\\test');
  });
});

