import { describe, expect, it, vi } from 'vitest';
// The dispatcher module transitively imports @/lib/server-auth -> @/auth
// (next-auth), which doesn't resolve under the jsdom unit-test environment.
// Only the pure `parseNotificationEventPayload` export is exercised here.
vi.mock('@/auth', () => ({ auth: vi.fn() }));
import { parseNotificationEventPayload } from './notificationEventDispatcher';

/**
 * `parseNotificationEventPayload` is the pure request-shape gate in front of
 * `buildNotificationForEvent` (which is DB-coupled via `dbAdmin` and covered
 * indirectly, end-to-end, by tests/integration/api-notificaciones.test.ts).
 * This file only exercises the pure parsing/validation logic — no DB, no
 * mocks — which the old Supabase-mocked `notificationEventDispatcher.test.ts`
 * never isolated from its DB-dependent assertions.
 */
describe('parseNotificationEventPayload', () => {
  const uuid = '11111111-1111-4111-8111-111111111111';

  it('accepts a well-formed payload for a UUID-keyed event', () => {
    const result = parseNotificationEventPayload({ event: 'catalog_food_request_created', entityId: uuid });
    expect(result).toEqual({ success: true, payload: { event: 'catalog_food_request_created', entityId: uuid } });
  });

  it('accepts a well-formed payload for the integer-keyed donation_status_changed event', () => {
    const result = parseNotificationEventPayload({ event: 'donation_status_changed', entityId: '42' });
    expect(result).toEqual({ success: true, payload: { event: 'donation_status_changed', entityId: '42' } });
  });

  it('rejects a non-object body', () => {
    expect(parseNotificationEventPayload('not-an-object').success).toBe(false);
    expect(parseNotificationEventPayload(null).success).toBe(false);
    expect(parseNotificationEventPayload(undefined).success).toBe(false);
  });

  it('rejects an unrecognized event type', () => {
    const result = parseNotificationEventPayload({ event: 'not_a_real_event', entityId: uuid });
    expect(result.success).toBe(false);
  });

  it('rejects a missing or blank entityId', () => {
    expect(parseNotificationEventPayload({ event: 'catalog_food_request_created' }).success).toBe(false);
    expect(parseNotificationEventPayload({ event: 'catalog_food_request_created', entityId: '   ' }).success).toBe(false);
  });

  it('rejects a non-UUID entityId for a UUID-keyed event', () => {
    const result = parseNotificationEventPayload({ event: 'catalog_food_request_created', entityId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-numeric entityId for donation_status_changed', () => {
    const result = parseNotificationEventPayload({ event: 'donation_status_changed', entityId: uuid });
    expect(result.success).toBe(false);
  });

  it('rejects any client-supplied sensitive field, even alongside a valid event/entityId', () => {
    const result = parseNotificationEventPayload({ event: 'catalog_food_request_created', entityId: uuid, titulo: 'Inyectado' });
    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toContain('titulo');
  });

  it('rejects multiple sensitive fields at once, listing all of them', () => {
    const result = parseNotificationEventPayload({ event: 'catalog_food_request_created', entityId: uuid, mensaje: 'x', rolDestinatario: 'ADMINISTRADOR' });
    expect(result.success).toBe(false);
    const error = (result as { success: false; error: string }).error;
    expect(error).toContain('mensaje');
    expect(error).toContain('rolDestinatario');
  });
});
