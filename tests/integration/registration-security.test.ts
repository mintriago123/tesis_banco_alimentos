import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * Ports `tests/integration/registration-security.test.ts` from `main`.
 *
 * The underlying architecture changed in a way that changes some
 * assertions, not just the plumbing — noted per-case below:
 *
 * - OLD: `signUp` with a privileged/invalid `rol` in client metadata was
 *   silently DEGRADED to SOLICITANTE by a DB trigger reading
 *   `raw_user_meta_data`, because that metadata channel existed and had to
 *   be defended against.
 * - NEW: `registrarAction`'s zod schema (`rolRegistrableSchema =
 *   z.enum(['DONANTE','SOLICITANTE'])`) is the only channel `rol` can arrive
 *   through at all, and it flatly REJECTS anything outside those two exact
 *   values — including lowercase variants the old trigger used to
 *   normalize. There is no more "degrade and proceed" path; invalid input
 *   fails registration outright. This is a strictly stronger property (the
 *   attack surface — a client-controlled metadata field — no longer
 *   exists), but it means the old lowercase-normalization and
 *   missing-metadata-defaults-to-SOLICITANTE assertions no longer hold and
 *   are rewritten as "rejected" cases instead.
 * - The self-promotion property (a freshly-registered user cannot escalate
 *   their own `rol`) is preserved via a Postgres column-level GRANT
 *   (`usuarios` UPDATE grant to `app_user` excludes `rol`/`estado`/`id`/
 *   `email`), asserted directly in `db-security.test.ts` — not re-asserted
 *   here to avoid duplicating that DB-level test.
 */

const integrationEnabled = process.env.RUN_DB_INTEGRATION === 'true';
const describeIntegration = integrationEnabled ? describe : describe.skip;

describeIntegration('Registration security: rol nunca llega por un canal no confiable', () => {
  let setupClient: ReturnType<typeof postgres>;
  let registrarAction: (typeof import('@/modules/auth/actions/register'))['registrarAction'];
  const createdEmails: string[] = [];

  beforeAll(async () => {
    setupClient = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
    ({ registrarAction } = await import('@/modules/auth/actions/register'));
  });

  afterEach(async () => {
    if (createdEmails.length === 0) return;
    await setupClient`delete from usuarios where email = any(${createdEmails})`;
    await setupClient`delete from "user" where email = any(${createdEmails})`;
    createdEmails.length = 0;
  });

  afterAll(async () => {
    await setupClient?.end();
  });

  const attemptRegister = async (label: string, rol: unknown) => {
    const email = `regsec-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
    const result = await registrarAction({ email, password: 'Registration-Security-123!', confirmPassword: 'Registration-Security-123!', rol });
    if (result.success) createdEmails.push(email);
    return { result, email };
  };

  const fetchProfile = async (email: string) => {
    const [row] = await setupClient`select u.rol, u.estado from usuarios u join "user" au on au.id = u.id where au.email = ${email}`;
    return row as { rol: string; estado: string } | undefined;
  };

  it.each([['ADMINISTRADOR'], ['OPERADOR'], ['SUPERADMIN']])(
    'registro directo con rol "%s" es rechazado (no degradado)',
    async (privileged) => {
      const { result } = await attemptRegister(`priv-${privileged}`, privileged);
      expect(result.success).toBe(false);
    },
  );

  it('registro sin rol es rechazado (el campo es requerido, no tiene default implícito)', async () => {
    const { result } = await attemptRegister('no-rol', undefined);
    expect(result.success).toBe(false);
  });

  it('registro con rol en minúsculas es rechazado (sin normalización — coincidencia exacta con el enum)', async () => {
    const { result } = await attemptRegister('lowercase-donante', 'donante');
    expect(result.success).toBe(false);
  });

  it('registro con DONANTE explícito se respeta y persiste activo', async () => {
    const { result, email } = await attemptRegister('explicit-donante', 'DONANTE');
    expect(result.success).toBe(true);

    const profile = await fetchProfile(email);
    expect(profile?.rol).toBe('DONANTE');
    expect(profile?.estado).toBe('activo');
  });

  it('registro con SOLICITANTE explícito se respeta y persiste activo', async () => {
    const { result, email } = await attemptRegister('explicit-solicitante', 'SOLICITANTE');
    expect(result.success).toBe(true);

    const profile = await fetchProfile(email);
    expect(profile?.rol).toBe('SOLICITANTE');
    expect(profile?.estado).toBe('activo');
  });

  it('un correo ya registrado no puede registrarse de nuevo', async () => {
    const { result: first, email } = await attemptRegister('duplicate', 'SOLICITANTE');
    expect(first.success).toBe(true);

    const second = await registrarAction({ email, password: 'Registration-Security-123!', confirmPassword: 'Registration-Security-123!', rol: 'SOLICITANTE' });
    expect(second.success).toBe(false);
  });
});
