import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Ports `tests/integration/supabase-security.test.ts` from `main`. Same two
 * properties, new plumbing: RLS ownership isolation and RPC privilege
 * gating, now verified directly against Postgres via `withRlsContext`
 * instead of a Supabase test client's `auth.signInWithPassword`.
 */

const integrationEnabled = process.env.RUN_DB_INTEGRATION === 'true';
const describeIntegration = integrationEnabled ? describe : describe.skip;

describeIntegration('Postgres RLS security', () => {
  let setupClient: ReturnType<typeof postgres>;
  let withRlsContext: (typeof import('@/db/client'))['withRlsContext'];
  let schema: typeof import('@/db/schema');
  let requesterId: string;
  let otherRequesterId: string;
  let unidadId: number;
  let tipoMagnitudId: number;

  beforeAll(async () => {
    setupClient = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
    ({ withRlsContext } = await import('@/db/client'));
    schema = await import('@/db/schema');

    const suffix = Date.now();
    const [requester] = await setupClient`
      insert into "user" (email, password_hash) values (${`dbsec-req-${suffix}@example.test`}, 'x') returning id
    `;
    const [other] = await setupClient`
      insert into "user" (email, password_hash) values (${`dbsec-other-${suffix}@example.test`}, 'x') returning id
    `;
    requesterId = requester.id;
    otherRequesterId = other.id;

    await setupClient`
      insert into usuarios (id, email, rol, estado) values
        (${requesterId}, ${`dbsec-req-${suffix}@example.test`}, 'SOLICITANTE', 'activo'),
        (${otherRequesterId}, ${`dbsec-other-${suffix}@example.test`}, 'SOLICITANTE', 'activo')
    `;

    // No assumption of pre-existing catalog data — this fresh DB has no seed
    // rows, so create the one unidad this suite needs itself.
    const [tipoMagnitud] = await setupClient`
      insert into tipos_magnitud (nombre) values (${`DbSecTest-${suffix}`}) returning id
    `;
    tipoMagnitudId = tipoMagnitud.id;
    const [unidad] = await setupClient`
      insert into unidades (nombre, simbolo, tipo_magnitud_id) values (${`unidad-test-${suffix}`}, ${`ut${suffix}`.slice(0, 10)}, ${tipoMagnitudId}) returning id
    `;
    unidadId = unidad.id;
  });

  afterAll(async () => {
    if (!setupClient) return;
    await setupClient`delete from solicitudes where usuario_id in (${requesterId}, ${otherRequesterId})`;
    await setupClient`delete from usuarios where id in (${requesterId}, ${otherRequesterId})`;
    await setupClient`delete from "user" where id in (${requesterId}, ${otherRequesterId})`;
    await setupClient`delete from unidades where id = ${unidadId}`;
    await setupClient`delete from tipos_magnitud where id = ${tipoMagnitudId}`;
    await setupClient.end();
  });

  it('applies ownership RLS to solicitudes', async () => {
    const [created] = await withRlsContext(requesterId, (tx) =>
      tx
        .insert(schema.solicitudes)
        .values({ usuarioId: requesterId, tipoAlimento: 'Arroz', cantidad: '1', unidadId, estado: 'pendiente' })
        .returning({ id: schema.solicitudes.id }),
    );

    try {
      const visibleToOwner = await withRlsContext(requesterId, (tx) =>
        tx.select({ id: schema.solicitudes.id, usuarioId: schema.solicitudes.usuarioId }).from(schema.solicitudes).where(eq(schema.solicitudes.id, created.id)),
      );
      const visibleToOther = await withRlsContext(otherRequesterId, (tx) =>
        tx.select({ id: schema.solicitudes.id, usuarioId: schema.solicitudes.usuarioId }).from(schema.solicitudes).where(eq(schema.solicitudes.id, created.id)),
      );

      expect(visibleToOwner).toHaveLength(1);
      expect(visibleToOwner[0]?.usuarioId).toBe(requesterId);
      expect(visibleToOther).toHaveLength(0);
    } finally {
      await setupClient`delete from solicitudes where id = ${created.id}`;
    }
  });

  it('does not allow a regular authenticated user to execute the admin catalog RPC', async () => {
    const error = await withRlsContext(requesterId, (tx) =>
      tx.execute(
        `select aprobar_solicitud_alta_alimento_server('${requesterId}'::uuid, gen_random_uuid(), 'Producto de prueba', 'Granos', array[1]::bigint[], 1)`,
      ),
    ).catch((e: unknown) => e);

    expect(deepestMessage(error)).toMatch(/permission denied/i);
  });

  it("a user's self-UPDATE cannot change their own rol (column-level grant excludes rol)", async () => {
    const error = await withRlsContext(requesterId, (tx) => tx.update(schema.usuarios).set({ rol: 'ADMINISTRADOR' }).where(eq(schema.usuarios.id, requesterId))).catch(
      (e: unknown) => e,
    );

    expect(deepestMessage(error)).toMatch(/permission denied/i);

    const [row] = await setupClient`select rol from usuarios where id = ${requesterId}`;
    expect(row.rol).toBe('SOLICITANTE');
  });
});

/** Drizzle wraps the real Postgres error (e.g. `permission denied for table usuarios`, code 42501) in a `DrizzleQueryError` whose own `.message` is a generic "Failed query: ..." — walk `.cause` to find the actual driver error. */
function deepestMessage(error: unknown): string {
  let current = error;
  while (current && typeof current === 'object' && 'cause' in current && current.cause) {
    current = current.cause;
  }
  return current instanceof Error ? current.message : String(current);
}
