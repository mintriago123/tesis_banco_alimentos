import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const integrationEnabled = process.env.RUN_SUPABASE_INTEGRATION === 'true';
const describeIntegration = integrationEnabled ? describe : describe.skip;

const supabaseUrl = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321';
const publishableKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY
  ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (integrationEnabled && (!publishableKey || !serviceRoleKey)) {
  throw new Error(
    'La suite de integración requiere SUPABASE_TEST_PUBLISHABLE_KEY y SUPABASE_TEST_SERVICE_ROLE_KEY.',
  );
}

type TestAccount = {
  authUser: User;
  email: string;
  password: string;
};

const createPublicClient = (): SupabaseClient =>
  createClient(supabaseUrl, publishableKey ?? 'integration-disabled', {
    auth: { autoRefreshToken: false, persistSession: false },
  });

const createAdminClient = (): SupabaseClient =>
  createClient(supabaseUrl, serviceRoleKey ?? 'integration-disabled', {
    auth: { autoRefreshToken: false, persistSession: false },
  });

const signUpWithMetadata = async (
  client: SupabaseClient,
  email: string,
  password: string,
  metadataRol: string | null,
) => {
  return client.auth.signUp({
    email,
    password,
    options: metadataRol === null ? undefined : { data: { rol: metadataRol } },
  });
};

describeIntegration('Registration security: metadata.rol nunca determina rol final', () => {
  let adminClient: SupabaseClient;
  const accounts: TestAccount[] = [];

  const cleanup = async () => {
    for (const account of accounts) {
      await adminClient.auth.admin.deleteUser(account.authUser.id).catch(() => undefined);
    }
    accounts.length = 0;
  };

  beforeAll(() => {
    adminClient = createAdminClient();
  });

  afterAll(async () => {
    await cleanup();
  });

  const attemptSignUp = async (
    label: string,
    metadataRol: string | null,
  ): Promise<{ authUser: User; rol: string | null; estado: string | null } | null> => {
    const email = `regsec-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
    const password = 'Registration-Security-123!';
    const publicClient = createPublicClient();

    const { data, error } = await signUpWithMetadata(publicClient, email, password, metadataRol);
    if (error || !data.user) {
      return null;
    }

    accounts.push({ authUser: data.user, email, password });

    const { data: profile } = await adminClient
      .from('usuarios')
      .select('rol, estado')
      .eq('id', data.user.id)
      .single();

    return {
      authUser: data.user,
      rol: profile?.rol ?? null,
      estado: profile?.estado ?? null,
    };
  };

  it.each([
    ['ADMINISTRADOR'],
    ['OPERADOR'],
    ['SUPERADMIN'],
  ])('signUp directo con rol "%s" en metadata se degrada a SOLICITANTE', async (privileged) => {
    const result = await attemptSignUp(`priv-${privileged}`, privileged);
    expect(result).not.toBeNull();
    expect(result!.rol).toBe('SOLICITANTE');
    expect(result!.estado).toBe('activo');
  });

  it('signUp directo sin metadata cae al default SOLICITANTE', async () => {
    const result = await attemptSignUp('no-metadata', null);
    expect(result).not.toBeNull();
    expect(result!.rol).toBe('SOLICITANTE');
    expect(result!.estado).toBe('activo');
  });

  it('signUp directo con metadata vacía cae al default SOLICITANTE', async () => {
    const result = await attemptSignUp('empty-metadata', '');
    expect(result).not.toBeNull();
    expect(result!.rol).toBe('SOLICITANTE');
    expect(result!.estado).toBe('activo');
  });

  it('signUp directo con metadata lowercase se normaliza y acepta DONANTE/SOLICITANTE', async () => {
    const donor = await attemptSignUp('lowercase-donante', 'donante');
    expect(donor).not.toBeNull();
    expect(donor!.rol).toBe('DONANTE');

    const requester = await attemptSignUp('lowercase-solicitante', 'solicitante');
    expect(requester).not.toBeNull();
    expect(requester!.rol).toBe('SOLICITANTE');
  });

  it('signUp directo con DONANTE explicito se respeta', async () => {
    const result = await attemptSignUp('explicit-donante', 'DONANTE');
    expect(result).not.toBeNull();
    expect(result!.rol).toBe('DONANTE');
    expect(result!.estado).toBe('activo');
  });

  it('un usuario creado por signUp no puede auto-promocionarse a ADMINISTRADOR via API directa', async () => {
    const result = await attemptSignUp('self-promotion', 'SOLICITANTE');
    expect(result).not.toBeNull();

    const publicClient = createPublicClient();
    await publicClient.auth.signInWithPassword({
      email: accounts[accounts.length - 1]!.email,
      password: accounts[accounts.length - 1]!.password,
    });

    const { data: before } = await publicClient
      .from('usuarios')
      .select('rol')
      .eq('id', result!.authUser.id)
      .single();

    expect(before?.rol).toBe('SOLICITANTE');

    const { error: updateError } = await publicClient
      .from('usuarios')
      .update({ rol: 'ADMINISTRADOR' })
      .eq('id', result!.authUser.id);

    expect(updateError).not.toBeNull();

    const { data: after } = await publicClient
      .from('usuarios')
      .select('rol')
      .eq('id', result!.authUser.id)
      .single();

    expect(after?.rol).toBe('SOLICITANTE');
  });
});