import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Contract test for PATCH /api/admin/usuarios, replacing the old
 * Supabase-client-mocked `route.test.ts`. Rather than mocking the DB layer,
 * this hits the real dbAdmin write against test Postgres and only mocks the
 * one thing that can't run outside a real Next.js request scope: the
 * `@/auth` session lookup (same technique as src/lib/server-auth.test.ts).
 */

const integrationEnabled = process.env.RUN_DB_INTEGRATION === 'true';
const describeIntegration = integrationEnabled ? describe : describe.skip;

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock('@/auth', () => ({ auth: authMock }));

describeIntegration('PATCH /api/admin/usuarios', () => {
  let setupClient: ReturnType<typeof postgres>;
  let PATCH: (typeof import('@/app/api/admin/usuarios/route'))['PATCH'];
  let adminId: string;
  let targetId: string;
  const origin = 'http://localhost:3000';

  const request = (body: unknown, headers: Record<string, string> = {}) =>
    new Request(`${origin}/api/admin/usuarios`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    setupClient = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
    ({ PATCH } = await import('@/app/api/admin/usuarios/route'));

    const suffix = Date.now();
    const [admin] = await setupClient`insert into "user" (email, password_hash) values (${`apiadmin-${suffix}@example.test`}, 'x') returning id`;
    const [target] = await setupClient`insert into "user" (email, password_hash) values (${`apitarget-${suffix}@example.test`}, 'x') returning id`;
    adminId = admin.id;
    targetId = target.id;

    await setupClient`
      insert into usuarios (id, email, rol, estado, nombre) values
        (${adminId}, ${`apiadmin-${suffix}@example.test`}, 'ADMINISTRADOR', 'activo', 'Admin API Test'),
        (${targetId}, ${`apitarget-${suffix}@example.test`}, 'SOLICITANTE', 'activo', 'Target original')
    `;
  });

  afterAll(async () => {
    if (!setupClient) return;
    await setupClient`delete from usuarios where id in (${adminId}, ${targetId})`;
    await setupClient`delete from "user" where id in (${adminId}, ${targetId})`;
    await setupClient.end();
  });

  beforeEach(() => {
    authMock.mockReset();
  });

  it('rejects a request from an untrusted Origin before touching auth', async () => {
    authMock.mockResolvedValue(null);

    const response = await PATCH(request({ userId: targetId, updates: { nombre: 'x' } }, { Origin: 'https://evil.example.test' }));
    expect(response.status).toBe(403);
  });

  it('rejects an unauthenticated caller', async () => {
    authMock.mockResolvedValue(null);

    const response = await PATCH(request({ userId: targetId, updates: { nombre: 'x' } }));
    expect(response.status).toBe(401);
  });

  it('rejects a non-administrator caller (role gate)', async () => {
    authMock.mockResolvedValue({ user: { id: targetId, rol: 'OPERADOR', estado: 'activo' } });

    const response = await PATCH(request({ userId: targetId, updates: { nombre: 'x' } }));
    expect(response.status).toBe(403);

    const [row] = await setupClient`select nombre from usuarios where id = ${targetId}`;
    expect(row.nombre).toBe('Target original');
  });

  it('rejects an update payload containing a field outside the allowlist', async () => {
    authMock.mockResolvedValue({ user: { id: adminId, rol: 'ADMINISTRADOR', estado: 'activo' } });

    const response = await PATCH(request({ userId: targetId, updates: { id: 'should-not-be-patchable' } }));
    expect(response.status).toBe(400);
  });

  it('applies a valid patch as ADMINISTRADOR via the privileged (BYPASSRLS) connection', async () => {
    authMock.mockResolvedValue({ user: { id: adminId, rol: 'ADMINISTRADOR', estado: 'activo' } });

    const response = await PATCH(request({ userId: targetId, updates: { nombre: 'Renombrado por admin', estado: 'bloqueado', motivo_bloqueo: 'Prueba de integración' } }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });

    const [row] = await setupClient`select nombre, estado, motivo_bloqueo from usuarios where id = ${targetId}`;
    expect(row).toMatchObject({ nombre: 'Renombrado por admin', estado: 'bloqueado', motivo_bloqueo: 'Prueba de integración' });
  });
});
