import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const integrationEnabled = process.env.RUN_SUPABASE_INTEGRATION === 'true';
const describeIntegration = integrationEnabled ? describe.sequential : describe.skip;
const supabaseUrl = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321';
const publishableKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY
  ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (integrationEnabled && (!publishableKey || !serviceRoleKey)) {
  throw new Error(
    'La suite local requiere SUPABASE_TEST_PUBLISHABLE_KEY y SUPABASE_TEST_SERVICE_ROLE_KEY.',
  );
}

type TestRole = 'SOLICITANTE' | 'DONANTE' | 'OPERADOR' | 'ADMINISTRADOR';
type TestStatus = 'activo' | 'bloqueado' | 'desactivado';

interface TestAccount {
  user: User;
  email: string;
  password: string;
  role: TestRole;
  client: SupabaseClient;
}

const createPublicClient = (): SupabaseClient =>
  createClient(supabaseUrl, publishableKey ?? 'integration-disabled', {
    auth: { autoRefreshToken: false, persistSession: false },
  });

describeIntegration('reglas de negocio contra Supabase local', () => {
  const runId = crypto.randomUUID();
  const accounts: TestAccount[] = [];
  const solicitudIds: string[] = [];
  const notificationIds: string[] = [];
  const warehouseRequestIds: string[] = [];
  const warehouseIds: string[] = [];
  let adminClient: SupabaseClient;
  let requester: TestAccount;
  let otherRequester: TestAccount;
  let blockedRequester: TestAccount;
  let donor: TestAccount;
  let operator: TestAccount;
  let administrator: TestAccount;
  let warehouseId: string | undefined;
  let donationId: number | undefined;
  let inventoryEntryId: string | undefined;
  let donatedProductId: string | undefined;
  let catalogRequestId: string | undefined;
  let createdFoodId: number | undefined;

  const createAccount = async (
    role: TestRole,
    label: string,
    status: TestStatus = 'activo',
  ): Promise<TestAccount> => {
    const email = `business-${label}-${runId}@example.test`;
    const password = `Local-${runId}-A1!`;
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { rol: role },
    });

    if (error || !data.user) {
      throw error ?? new Error(`No se creó la cuenta ${label}.`);
    }

    const { error: profileError } = await adminClient.from('usuarios').upsert({
      id: data.user.id,
      email,
      nombre: `Business ${label}`,
      rol: role,
      tipo_persona: 'Natural',
      estado: status,
      cedula: `${runId.replaceAll('-', '').slice(0, 8)}${accounts.length + 10}`,
      direccion: `Dirección local ${label}`,
      telefono: `09900000${accounts.length}`,
      latitud: -2.17,
      longitud: -79.92,
    });

    if (profileError) {
      throw profileError;
    }

    const client = createPublicClient();
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) {
      throw signInError;
    }

    const account = { user: data.user, email, password, role, client };
    accounts.push(account);
    return account;
  };

  const expectNoError = (error: { message: string } | null, context: string) => {
    if (error) {
      throw new Error(`${context}: ${error.message}`);
    }
  };

  beforeAll(async () => {
    adminClient = createClient(supabaseUrl, serviceRoleKey ?? 'integration-disabled', {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    requester = await createAccount('SOLICITANTE', 'requester');
    otherRequester = await createAccount('SOLICITANTE', 'other-requester');
    blockedRequester = await createAccount('SOLICITANTE', 'blocked-requester', 'bloqueado');
    donor = await createAccount('DONANTE', 'donor');
    operator = await createAccount('OPERADOR', 'operator');
    administrator = await createAccount('ADMINISTRADOR', 'administrator');
  });

  afterAll(async () => {
    if (!adminClient) return;

    if (inventoryEntryId) {
      await adminClient.from('movimiento_inventario_detalle').delete().eq('id_entrada', inventoryEntryId);
      await adminClient.from('bajas_productos').delete().eq('id_entrada', inventoryEntryId);
      await adminClient.from('entradas_inventario').delete().eq('id_entrada', inventoryEntryId);
    }
    if (donatedProductId) {
      await adminClient.from('inventario').delete().eq('id_producto', donatedProductId);
      await adminClient.from('productos_donados').delete().eq('id_producto', donatedProductId);
    }
    if (donationId !== undefined) {
      await adminClient.from('donaciones').delete().eq('id', donationId);
    }
    if (catalogRequestId) {
      await adminClient
        .from('solicitudes_alta_alimentos_unidades')
        .delete()
        .eq('solicitud_id', catalogRequestId);
      await adminClient.from('solicitudes_alta_alimentos').delete().eq('id', catalogRequestId);
    }
    if (createdFoodId !== undefined) {
      await adminClient.from('alimentos_unidades').delete().eq('alimento_id', createdFoodId);
      await adminClient.from('alimentos').delete().eq('id', createdFoodId);
    }
    if (warehouseRequestIds.length > 0) {
      await adminClient.from('solicitudes_bodega').delete().in('id', warehouseRequestIds);
    }
    if (warehouseIds.length > 0) {
      await adminClient.from('donante_depositos').delete().in('id_deposito', warehouseIds);
      await adminClient.from('depositos').delete().in('id_deposito', warehouseIds);
    }
    if (solicitudIds.length > 0) {
      await adminClient.from('solicitudes').delete().in('id', solicitudIds);
    }
    if (notificationIds.length > 0) {
      await adminClient
        .from('notificaciones_usuario')
        .delete()
        .in('notificacion_id', notificationIds);
      await adminClient.from('notificaciones').delete().in('id', notificationIds);
    }

    for (const account of accounts.reverse()) {
      const { error } = await adminClient.auth.admin.deleteUser(account.user.id);
      if (error) {
        throw error;
      }
    }
  });

  it('SOL-001 SOL-002 SOL-003 AUTH-P0-006 SEC-P0-004 enforces requester ownership', async () => {
    const solicitudId = crypto.randomUUID();
    solicitudIds.push(solicitudId);

    const { error: createError } = await requester.client.from('solicitudes').insert({
      id: solicitudId,
      usuario_id: requester.user.id,
      tipo_alimento: 'Arroz',
      cantidad: 2,
      unidad_id: 1,
      estado: 'pendiente',
    });
    expect(createError).toBeNull();

    const { data: ownRow, error: ownError } = await requester.client
      .from('solicitudes')
      .select('id')
      .eq('id', solicitudId)
      .maybeSingle();
    const { data: foreignRow, error: foreignError } = await otherRequester.client
      .from('solicitudes')
      .select('id')
      .eq('id', solicitudId)
      .maybeSingle();
    const { error: impersonationError } = await otherRequester.client
      .from('solicitudes')
      .insert({
        usuario_id: requester.user.id,
        tipo_alimento: 'Arroz',
        cantidad: 1,
        unidad_id: 1,
        estado: 'pendiente',
      });

    expect(ownError).toBeNull();
    expect(ownRow?.id).toBe(solicitudId);
    expect(foreignError).toBeNull();
    expect(foreignRow).toBeNull();
    expect(impersonationError).not.toBeNull();
  });

  it('AUTH-P0-002 SOL-004 rejects operations from a blocked profile', async () => {
    const { data, error } = await blockedRequester.client
      .from('solicitudes')
      .insert({
        usuario_id: blockedRequester.user.id,
        tipo_alimento: 'Arroz',
        cantidad: 1,
        unidad_id: 1,
        estado: 'pendiente',
      })
      .select('id');

    expect(error).not.toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('BOD-P1-001 creates and approves an additional donor warehouse through role-bound RPCs', async () => {
    const { data: requestId, error: requestError } = await donor.client.rpc(
      'crear_solicitud_bodega',
      {
        p_tipo: 'ALTA',
        p_nombre: `Bodega ${runId.slice(0, 8)}`,
        p_direccion: 'Dirección de bodega de pruebas 123',
        p_telefono: '0991234567',
        p_descripcion: `runId=${runId}`,
        p_id_deposito: null,
        p_latitud: -2.18,
        p_longitud: -79.91,
      },
    );
    expectNoError(requestError, 'crear solicitud de bodega');
    expect(typeof requestId).toBe('string');
    warehouseRequestIds.push(String(requestId));

    const { data: approvedWarehouseId, error: approvalError } = await operator.client.rpc(
      'aprobar_solicitud_bodega',
      { p_solicitud_id: requestId },
    );
    expectNoError(approvalError, 'aprobar solicitud de bodega');
    warehouseId = String(approvedWarehouseId);
    warehouseIds.push(warehouseId);

    const { data: mapping, error: mappingError } = await donor.client
      .from('donante_depositos')
      .select('id_deposito, es_principal, activo')
      .eq('id_deposito', warehouseId)
      .single();

    expect(mappingError).toBeNull();
    expect(mapping).toMatchObject({ es_principal: false, activo: true });
  });

  it('CAT-P1-001 keeps a proposal outside the catalog until an administrator approves it', async () => {
    const foodName = `Alimento ${runId.slice(0, 12)}`;
    const { data: requestRow, error: createError } = await donor.client
      .from('solicitudes_alta_alimentos')
      .insert({
        solicitante_id: donor.user.id,
        nombre: foodName,
        categoria: 'Pruebas',
        comentario_donante: `runId=${runId}`,
        estado: 'pendiente',
      })
      .select('id')
      .single();
    expectNoError(createError, 'crear propuesta de catálogo');
    catalogRequestId = requestRow?.id;
    if (!catalogRequestId) throw new Error('La propuesta no devolvió id.');

    const { error: unitError } = await donor.client
      .from('solicitudes_alta_alimentos_unidades')
      .insert({
        solicitud_id: catalogRequestId,
        unidad_id: 1,
        es_unidad_principal: true,
      });
    expectNoError(unitError, 'asociar unidad a propuesta');

    const { data: beforeApproval } = await donor.client
      .from('alimentos')
      .select('id')
      .eq('nombre', foodName);
    expect(beforeApproval ?? []).toHaveLength(0);

    const { data: foodId, error: approvalError } = await administrator.client.rpc(
      'aprobar_solicitud_alta_alimento',
      {
        p_solicitud_id: catalogRequestId,
        p_nombre: foodName,
        p_categoria: 'Pruebas',
        p_unidad_ids: [1],
        p_unidad_principal_id: 1,
      },
    );
    expectNoError(approvalError, 'aprobar propuesta de catálogo');
    createdFoodId = Number(foodId);
    expect(Number.isSafeInteger(createdFoodId)).toBe(true);
  });

  it('DON-P0-002 INV-P0-003 OPS-002 OPS-003 OPS-008 REPORT-P1-001 reconciles approval, concurrent discount and restoration', async () => {
    const { data: mainWarehouse, error: mainWarehouseError } = await donor.client.rpc(
      'crear_bodega_principal_donante',
    );
    expectNoError(mainWarehouseError, 'crear bodega principal');
    const principalWarehouseId = Array.isArray(mainWarehouse)
      ? mainWarehouse[0]?.id_deposito
      : undefined;
    if (typeof principalWarehouseId !== 'string') {
      throw new Error('No se obtuvo la bodega principal del donante.');
    }
    warehouseIds.push(principalWarehouseId);

    const { data: donation, error: donationError } = await donor.client
      .from('donaciones')
      .insert({
        user_id: donor.user.id,
        nombre_donante: 'Donante de integración',
        cedula_donante: '0999999999',
        direccion_donante_completa: 'Dirección local',
        telefono: '0991234567',
        email: donor.email,
        tipo_persona_donante: 'Natural',
        alimento_id: 1,
        tipo_producto: 'Arroz',
        categoria_comida: 'Granos y Cereales',
        es_producto_personalizado: false,
        cantidad: 10,
        unidad_id: 1,
        unidad_nombre: 'Kilogramo',
        unidad_simbolo: 'kg',
        fecha_disponible: '2099-01-01',
        direccion_entrega: 'Dirección local',
        estado: 'Pendiente',
        id_deposito: principalWarehouseId,
        observaciones: `runId=${runId}`,
      })
      .select('id')
      .single();
    expectNoError(donationError, 'crear donación');
    donationId = donation?.id;
    if (donationId === undefined) throw new Error('La donación no devolvió id.');

    const { error: approvalError } = await operator.client
      .from('donaciones')
      .update({ estado: 'Aprobada' })
      .eq('id', donationId);
    expectNoError(approvalError, 'aprobar donación');

    const { data: entries, error: entryError } = await adminClient
      .from('entradas_inventario')
      .select('id_entrada, id_producto, cantidad_original, cantidad_disponible')
      .eq('donacion_id', donationId);
    expectNoError(entryError, 'consultar entrada');
    expect(entries).toHaveLength(1);
    inventoryEntryId = entries?.[0]?.id_entrada;
    donatedProductId = entries?.[0]?.id_producto;
    expect(Number(entries?.[0]?.cantidad_original)).toBe(10);

    if (!inventoryEntryId || !donatedProductId) {
      throw new Error('La aprobación no creó una entrada trazable.');
    }

    const discountCalls = await Promise.all([
      operator.client.rpc('descontar_stock_por_lote', {
        p_id_deposito: principalWarehouseId,
        p_id_producto: donatedProductId,
        p_cantidad: 6,
        p_unidad_id: 1,
      }),
      operator.client.rpc('descontar_stock_por_lote', {
        p_id_deposito: principalWarehouseId,
        p_id_producto: donatedProductId,
        p_cantidad: 6,
        p_unidad_id: 1,
      }),
    ]);
    const successfulDiscounts = discountCalls.filter(({ error }) => error === null);
    const rejectedDiscounts = discountCalls.filter(({ error }) => error !== null);
    expect(successfulDiscounts).toHaveLength(1);
    expect(rejectedDiscounts).toHaveLength(1);

    const { data: discountedEntry, error: discountedError } = await adminClient
      .from('entradas_inventario')
      .select('cantidad_original, cantidad_disponible')
      .eq('id_entrada', inventoryEntryId)
      .single();
    expectNoError(discountedError, 'consultar saldo descontado');
    expect(Number(discountedEntry?.cantidad_disponible)).toBe(4);

    const successfulPayload = successfulDiscounts[0]?.data;
    const details = (
      typeof successfulPayload === 'object'
      && successfulPayload !== null
      && 'detalles' in successfulPayload
      && Array.isArray(successfulPayload.detalles)
    ) ? successfulPayload.detalles : [];
    expect(details).toHaveLength(1);

    const consumedAmount = details[0]?.cantidad;
    const consumedEntryId = details[0]?.idEntrada;
    const { error: restoreError } = await operator.client.rpc(
      'restaurar_entrada_inventario',
      {
        p_id_entrada: consumedEntryId,
        p_cantidad: consumedAmount,
      },
    );
    expectNoError(restoreError, 'restaurar descuento');

    const { data: restoredEntry, error: restoredError } = await adminClient
      .from('entradas_inventario')
      .select('cantidad_original, cantidad_disponible')
      .eq('id_entrada', inventoryEntryId)
      .single();
    expectNoError(restoredError, 'consultar saldo restaurado');
    expect(Number(restoredEntry?.cantidad_disponible)).toBe(10);
    expect(Number(restoredEntry?.cantidad_disponible)).toBe(
      Number(restoredEntry?.cantidad_original),
    );
  });

  it('SOL-008 rejects without touching inventory', async () => {
    const solicitudId = crypto.randomUUID();
    solicitudIds.push(solicitudId);
    const { error: insertError } = await requester.client.from('solicitudes').insert({
      id: solicitudId,
      usuario_id: requester.user.id,
      tipo_alimento: 'Arroz',
      cantidad: 1,
      unidad_id: 1,
      estado: 'pendiente',
    });
    expectNoError(insertError, 'crear solicitud para rechazo');

    const { data: beforeRows } = await adminClient
      .from('entradas_inventario')
      .select('cantidad_disponible');
    const beforeTotal = (beforeRows ?? []).reduce(
      (sum, row) => sum + Number(row.cantidad_disponible),
      0,
    );

    const { error: rejectError } = await operator.client
      .from('solicitudes')
      .update({
        estado: 'rechazada',
        motivo_rechazo: 'Datos incompletos',
        operador_rechazo_id: operator.user.id,
        fecha_rechazo: new Date().toISOString(),
      })
      .eq('id', solicitudId);
    expectNoError(rejectError, 'rechazar solicitud');

    const { data: afterRows } = await adminClient
      .from('entradas_inventario')
      .select('cantidad_disponible');
    const afterTotal = (afterRows ?? []).reduce(
      (sum, row) => sum + Number(row.cantidad_disponible),
      0,
    );
    expect(afterTotal).toBe(beforeTotal);
  });

  it('SOL-009 SOL-010 rejects invalid transitions and duplicate receipts', async () => {
    const rejectedId = crypto.randomUUID();
    const firstApprovedId = crypto.randomUUID();
    const duplicateReceiptId = crypto.randomUUID();
    solicitudIds.push(rejectedId, firstApprovedId, duplicateReceiptId);

    const { error: insertError } = await requester.client.from('solicitudes').insert([
      {
        id: rejectedId,
        usuario_id: requester.user.id,
        tipo_alimento: 'Arroz',
        cantidad: 1,
        unidad_id: 1,
        estado: 'pendiente',
      },
      {
        id: firstApprovedId,
        usuario_id: requester.user.id,
        tipo_alimento: 'Arroz',
        cantidad: 1,
        unidad_id: 1,
        estado: 'pendiente',
      },
      {
        id: duplicateReceiptId,
        usuario_id: requester.user.id,
        tipo_alimento: 'Arroz',
        cantidad: 1,
        unidad_id: 1,
        estado: 'pendiente',
      },
    ]);
    expectNoError(insertError, 'crear solicitudes para validar estados y comprobantes');

    const rejection = await operator.client
      .from('solicitudes')
      .update({
        estado: 'rechazada',
        motivo_rechazo: 'Regla de transición',
        operador_rechazo_id: operator.user.id,
        fecha_rechazo: new Date().toISOString(),
      })
      .eq('id', rejectedId);
    expectNoError(rejection.error, 'rechazar solicitud para validar transición');

    const invalidTransition = await operator.client
      .from('solicitudes')
      .update({ estado: 'entregada' })
      .eq('id', rejectedId);
    expect(invalidTransition.error).not.toBeNull();

    const receiptCode = `SOL-LOCAL-${runId.slice(0, 8)}`;
    const firstApproval = await operator.client
      .from('solicitudes')
      .update({
        estado: 'aprobada',
        codigo_comprobante: receiptCode,
        operador_aprobacion_id: operator.user.id,
        fecha_aprobacion: new Date().toISOString(),
      })
      .eq('id', firstApprovedId);
    expectNoError(firstApproval.error, 'aprobar solicitud con comprobante');

    const duplicateReceipt = await operator.client
      .from('solicitudes')
      .update({
        estado: 'aprobada',
        codigo_comprobante: receiptCode,
        operador_aprobacion_id: operator.user.id,
        fecha_aprobacion: new Date().toISOString(),
      })
      .eq('id', duplicateReceiptId);
    expect(duplicateReceipt.error).not.toBeNull();
  });

  it('NOT-P1-001 NOT-P1-002 isolates, reads and hides notifications idempotently', async () => {
    const { data: targeted, error: targetedError } = await adminClient
      .from('notificaciones')
      .insert({
        titulo: 'Notificación dirigida',
        mensaje: `runId=${runId}`,
        tipo: 'info',
        destinatario_id: requester.user.id,
        categoria: 'pruebas',
        metadatos: { runId },
      })
      .select('id')
      .single();
    expectNoError(targetedError, 'crear notificación dirigida');
    if (!targeted?.id) throw new Error('La notificación no devolvió id.');
    notificationIds.push(targeted.id);

    const { data: requesterNotifications, error: requesterError } = await requester.client.rpc(
      'obtener_notificaciones_usuario',
      { p_limite: 50 },
    );
    const { data: otherNotifications, error: otherError } = await otherRequester.client.rpc(
      'obtener_notificaciones_usuario',
      { p_limite: 50 },
    );
    expectNoError(requesterError, 'consultar notificaciones propias');
    expectNoError(otherError, 'consultar notificaciones ajenas');
    expect(requesterNotifications?.some(({ id }: { id: string }) => id === targeted.id)).toBe(true);
    expect(otherNotifications?.some(({ id }: { id: string }) => id === targeted.id)).toBe(false);

    const firstRead = await requester.client.rpc('marcar_notificacion_leida', {
      p_notificacion_id: targeted.id,
    });
    const secondRead = await requester.client.rpc('marcar_notificacion_leida', {
      p_notificacion_id: targeted.id,
    });
    expectNoError(firstRead.error, 'marcar notificación leída');
    expectNoError(secondRead.error, 'repetir lectura');
    expect(firstRead.data).toBe(true);
    expect(secondRead.data).toBe(true);

    const firstHide = await requester.client.rpc('ocultar_notificacion', {
      p_notificacion_id: targeted.id,
    });
    const secondHide = await requester.client.rpc('ocultar_notificacion', {
      p_notificacion_id: targeted.id,
    });
    expectNoError(firstHide.error, 'ocultar notificación');
    expectNoError(secondHide.error, 'repetir ocultamiento');
    expect(firstHide.data).toBe(true);
    expect(secondHide.data).toBe(true);
  });

  it('AUTH-P0-001 AUTH-P0-004 SEC-P0-007 resolves role and profile using the real session', async () => {
    const { data: role, error: roleError } = await administrator.client
      .schema('private_auth')
      .rpc('current_user_role');
    const { data: profile, error: profileError } = await administrator.client
      .from('usuarios')
      .select('id, rol, estado')
      .eq('id', administrator.user.id)
      .single();

    expectNoError(roleError, 'obtener rol');
    expectNoError(profileError, 'obtener perfil');
    expect(role).toBe('ADMINISTRADOR');
    expect(profile).toMatchObject({
      id: administrator.user.id,
      rol: 'ADMINISTRADOR',
      estado: 'activo',
    });
  });
});
