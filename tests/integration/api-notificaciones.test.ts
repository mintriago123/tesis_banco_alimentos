import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Contract test for POST /api/notificaciones, replacing the old
 * Supabase-client-mocked `route.test.ts`. Covers the dispatcher's two real
 * security properties: event-to-role gating (EVENT_ALLOWED_ROLES) and
 * ownership checks (a donor can only notify about their own catalog
 * request) — both hit the real DB, only `@/auth` is mocked.
 */

const integrationEnabled = process.env.RUN_DB_INTEGRATION === 'true';
const describeIntegration = integrationEnabled ? describe : describe.skip;

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock('@/auth', () => ({ auth: authMock }));

describeIntegration('POST /api/notificaciones', () => {
  let setupClient: ReturnType<typeof postgres>;
  let POST: (typeof import('@/app/api/notificaciones/route'))['POST'];
  let donanteId: string;
  let otroDonanteId: string;
  let solicitanteId: string;
  let solicitudAltaId: string;
  let ajenaSolicitudAltaId: string;
  const origin = 'http://localhost:3000';

  const request = (body: unknown, headers: Record<string, string> = {}) =>
    new Request(`${origin}/api/notificaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    process.env.EMAIL_SUPPRESS_SEND = 'true';
    setupClient = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
    ({ POST } = await import('@/app/api/notificaciones/route'));

    const suffix = Date.now();
    const [donante] = await setupClient`insert into "user" (email, password_hash) values (${`apinotif-donante-${suffix}@example.test`}, 'x') returning id`;
    const [otroDonante] = await setupClient`insert into "user" (email, password_hash) values (${`apinotif-otro-${suffix}@example.test`}, 'x') returning id`;
    const [solicitante] = await setupClient`insert into "user" (email, password_hash) values (${`apinotif-sol-${suffix}@example.test`}, 'x') returning id`;
    donanteId = donante.id;
    otroDonanteId = otroDonante.id;
    solicitanteId = solicitante.id;

    await setupClient`
      insert into usuarios (id, email, rol, estado, nombre) values
        (${donanteId}, ${`apinotif-donante-${suffix}@example.test`}, 'DONANTE', 'activo', 'Donante API Test'),
        (${otroDonanteId}, ${`apinotif-otro-${suffix}@example.test`}, 'DONANTE', 'activo', 'Otro Donante'),
        (${solicitanteId}, ${`apinotif-sol-${suffix}@example.test`}, 'SOLICITANTE', 'activo', 'Solicitante API Test')
    `;

    const [solicitudAlta] = await setupClient`
      insert into solicitudes_alta_alimentos (solicitante_id, nombre, categoria, estado)
      values (${donanteId}, ${`Producto API Test ${suffix}`}, 'Granos', 'pendiente')
      returning id
    `;
    solicitudAltaId = solicitudAlta.id;

    const [ajena] = await setupClient`
      insert into solicitudes_alta_alimentos (solicitante_id, nombre, categoria, estado)
      values (${otroDonanteId}, ${`Producto Ajeno API Test ${suffix}`}, 'Granos', 'pendiente')
      returning id
    `;
    ajenaSolicitudAltaId = ajena.id;
  });

  afterAll(async () => {
    if (!setupClient) return;
    await setupClient`delete from notificaciones where destinatario_id in (${donanteId}, ${otroDonanteId}, ${solicitanteId}) or rol_destinatario = 'ADMINISTRADOR'`;
    await setupClient`delete from solicitudes_alta_alimentos where id in (${solicitudAltaId}, ${ajenaSolicitudAltaId})`;
    await setupClient`delete from usuarios where id in (${donanteId}, ${otroDonanteId}, ${solicitanteId})`;
    await setupClient`delete from "user" where id in (${donanteId}, ${otroDonanteId}, ${solicitanteId})`;
    await setupClient.end();
  });

  beforeEach(() => {
    authMock.mockReset();
  });

  it('rejects an untrusted Origin', async () => {
    const response = await POST(
      request({ event: 'catalog_food_request_created', entityId: solicitudAltaId }, { Origin: 'https://evil.example.test' }),
    );
    expect(response.status).toBe(403);
  });

  it('rejects an unauthenticated caller', async () => {
    authMock.mockResolvedValue(null);
    const response = await POST(request({ event: 'catalog_food_request_created', entityId: solicitudAltaId }));
    expect(response.status).toBe(401);
  });

  it('rejects an event the caller role is not allowed to fire (SOLICITANTE cannot fire catalog_food_request_created)', async () => {
    authMock.mockResolvedValue({ user: { id: solicitanteId, rol: 'SOLICITANTE', estado: 'activo' } });
    const response = await POST(request({ event: 'catalog_food_request_created', entityId: solicitudAltaId }));
    expect(response.status).toBe(403);
  });

  it("rejects a DONANTE notifying about another donor's catalog request", async () => {
    authMock.mockResolvedValue({ user: { id: donanteId, rol: 'DONANTE', estado: 'activo' } });
    const response = await POST(request({ event: 'catalog_food_request_created', entityId: ajenaSolicitudAltaId }));
    expect(response.status).toBe(403);
  });

  it('rejects a payload carrying a client-supplied sensitive field (server derives content itself)', async () => {
    authMock.mockResolvedValue({ user: { id: donanteId, rol: 'DONANTE', estado: 'activo' } });
    const response = await POST(request({ event: 'catalog_food_request_created', entityId: solicitudAltaId, titulo: 'Inyectado' }));
    expect(response.status).toBe(400);
  });

  it('creates a real notification row for a DONANTE notifying about their own catalog request', async () => {
    authMock.mockResolvedValue({ user: { id: donanteId, rol: 'DONANTE', estado: 'activo' } });
    const response = await POST(request({ event: 'catalog_food_request_created', entityId: solicitudAltaId }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.notificacion).toMatchObject({ categoria: 'catalogo', rol_destinatario: 'ADMINISTRADOR' });

    const rows = await setupClient`select rol_destinatario, categoria from notificaciones where id = ${body.notificacion.id}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rol_destinatario: 'ADMINISTRADOR', categoria: 'catalogo' });
  });
});
