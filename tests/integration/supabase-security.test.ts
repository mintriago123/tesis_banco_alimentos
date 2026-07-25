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

type TestUser = {
  authUser: User;
  email: string;
  password: string;
  role: 'SOLICITANTE' | 'ADMINISTRADOR';
};

const createAuthenticatedClient = (): SupabaseClient =>
  createClient(supabaseUrl, publishableKey ?? 'integration-disabled', {
    auth: { autoRefreshToken: false, persistSession: false },
  });

describeIntegration('Supabase local security', () => {
  let adminClient: SupabaseClient;
  let requester: TestUser | undefined;
  let otherRequester: TestUser | undefined;

  const createTestUser = async (
    role: TestUser['role'],
    suffix: string,
  ): Promise<TestUser> => {
    const email = `coverage-${suffix}-${Date.now()}@example.test`;
    const password = 'Integration-Password-123!';
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw error ?? new Error('Supabase no devolvió el usuario de prueba.');
    }

    const { error: profileError } = await adminClient.from('usuarios').upsert({
      id: data.user.id,
      email,
      nombre: `Usuario ${suffix}`,
      rol: role,
      tipo_persona: 'Natural',
      estado: 'activo',
    });

    if (profileError) {
      throw profileError;
    }

    return { authUser: data.user, email, password, role };
  };

  const signIn = async (testUser: TestUser): Promise<SupabaseClient> => {
    const client = createAuthenticatedClient();
    const { error } = await client.auth.signInWithPassword({
      email: testUser.email,
      password: testUser.password,
    });

    if (error) {
      throw error;
    }

    return client;
  };

  beforeAll(async () => {
    adminClient = createClient(supabaseUrl, serviceRoleKey ?? 'integration-disabled', {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    requester = await createTestUser('SOLICITANTE', 'requester');
    otherRequester = await createTestUser('SOLICITANTE', 'other');
  });

  afterAll(async () => {
    if (!adminClient) return;

    const userIds = [requester?.authUser.id, otherRequester?.authUser.id]
      .filter((id): id is string => Boolean(id));

    await Promise.all(userIds.map((id) => adminClient.auth.admin.deleteUser(id)));
  });

  it('applies ownership RLS to solicitudes', async () => {
    if (!requester || !otherRequester) {
      throw new Error('Los usuarios de integración no fueron preparados.');
    }

    const currentRequester = requester;
    const currentOtherRequester = otherRequester;
    const ownerClient = await signIn(currentRequester);
    const otherClient = await signIn(currentOtherRequester);
    const solicitudId = crypto.randomUUID();

    try {
      const { error: insertError } = await ownerClient.from('solicitudes').insert({
        id: solicitudId,
        usuario_id: currentRequester.authUser.id,
        tipo_alimento: 'Arroz',
        cantidad: 1,
        unidad_id: 1,
        estado: 'pendiente',
      });

      expect(insertError).toBeNull();

      const { data: visibleToOwner, error: ownerError } = await ownerClient
        .from('solicitudes')
        .select('id, usuario_id')
        .eq('id', solicitudId)
        .maybeSingle();
      const { data: visibleToOther, error: otherError } = await otherClient
        .from('solicitudes')
        .select('id, usuario_id')
        .eq('id', solicitudId)
        .maybeSingle();

      expect(ownerError).toBeNull();
      expect(visibleToOwner?.usuario_id).toBe(currentRequester.authUser.id);
      expect(otherError).toBeNull();
      expect(visibleToOther).toBeNull();
    } finally {
      await adminClient.from('solicitudes').delete().eq('id', solicitudId);
    }
  });

  it('does not allow a regular authenticated user to execute the admin catalog RPC', async () => {
    if (!requester) {
      throw new Error('El usuario de integración no fue preparado.');
    }

    const client = await signIn(requester);
    const { error } = await client.rpc('aprobar_solicitud_alta_alimento_server', {
      p_admin_id: requester.authUser.id,
      p_categoria: 'Granos',
      p_nombre: 'Producto de prueba',
      p_solicitud_id: crypto.randomUUID(),
      p_unidad_ids: [1],
      p_unidad_principal_id: 1,
    });

    expect(error).not.toBeNull();
  });
});
