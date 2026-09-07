import { expect, test } from '@playwright/test';
import {
  createAdminClient,
  createRoleClient,
  getAccount,
  readRuntime,
} from './helpers/runtime';

test.describe.configure({ mode: 'serial' });

test('@p0 E2E-P2-001 donor approval feeds requester stock and remains visible to staff', async ({
  browser,
}) => {
  const runtime = await readRuntime();
  const donor = getAccount(runtime, 'DONANTE');
  const operator = getAccount(runtime, 'OPERADOR');
  const requester = getAccount(runtime, 'SOLICITANTE');
  const administrator = getAccount(runtime, 'ADMINISTRADOR');
  const donorClient = await createRoleClient(donor);
  const operatorClient = await createRoleClient(operator);
  const requesterClient = await createRoleClient(requester);
  const adminClient = createAdminClient();

  const { data: mapping, error: mappingError } = await donorClient
    .from('donante_depositos')
    .select('id_deposito')
    .eq('donante_id', donor.id)
    .eq('es_principal', true)
    .eq('activo', true)
    .single();
  expect(mappingError).toBeNull();
  const warehouseId = mapping?.id_deposito;
  if (!warehouseId) throw new Error('El donante E2E no tiene bodega principal.');

  let donationId: number | undefined;
  let solicitudId: string | undefined;
  let entryId: string | undefined;
  let productId: string | undefined;

  try {
    const { data: donation, error: donationError } = await donorClient
      .from('donaciones')
      .insert({
        user_id: donor.id,
        nombre_donante: 'Donante flujo dorado',
        cedula_donante: '0999999999',
        direccion_donante_completa: 'Dirección E2E',
        telefono: '0991234567',
        email: donor.email,
        tipo_persona_donante: 'Natural',
        alimento_id: 1,
        tipo_producto: 'Arroz',
        categoria_comida: 'Granos y Cereales',
        es_producto_personalizado: false,
        cantidad: 8,
        unidad_id: 1,
        unidad_nombre: 'Kilogramo',
        unidad_simbolo: 'kg',
        fecha_disponible: '2099-01-01',
        direccion_entrega: 'Dirección E2E',
        estado: 'Pendiente',
        id_deposito: warehouseId,
        observaciones: `runId=${runtime.runId}`,
      })
      .select('id')
      .single();
    expect(donationError).toBeNull();
    donationId = donation?.id;
    if (donationId === undefined) throw new Error('La donación E2E no devolvió id.');

    const { error: approvalError } = await operatorClient
      .from('donaciones')
      .update({ estado: 'Aprobada' })
      .eq('id', donationId);
    expect(approvalError).toBeNull();

    const { data: entry, error: entryError } = await adminClient
      .from('entradas_inventario')
      .select('id_entrada, id_producto, cantidad_original, cantidad_disponible')
      .eq('donacion_id', donationId)
      .single();
    expect(entryError).toBeNull();
    expect(Number(entry?.cantidad_original)).toBe(8);
    expect(Number(entry?.cantidad_disponible)).toBe(8);
    entryId = entry?.id_entrada;
    productId = entry?.id_producto;

    solicitudId = crypto.randomUUID();
    const { error: requestError } = await requesterClient.from('solicitudes').insert({
      id: solicitudId,
      usuario_id: requester.id,
      tipo_alimento: 'Arroz',
      cantidad: 4,
      unidad_id: 1,
      estado: 'pendiente',
      comentarios: `runId=${runtime.runId}`,
      latitud: -2.17,
      longitud: -79.92,
    });
    expect(requestError).toBeNull();

    for (const account of [operator, administrator]) {
      if (!account.storageStatePath) throw new Error(`Falta sesión de ${account.role}.`);
      const context = await browser.newContext({ storageState: account.storageStatePath });
      const page = await context.newPage();
      const route = account.role === 'OPERADOR'
        ? '/operador/solicitudes'
        : '/admin/reportes/solicitudes';
      await page.goto(route);
      await expect(page.getByText(/Arroz/i).first()).toBeVisible();
      await context.close();
    }
  } finally {
    if (solicitudId) {
      await adminClient.from('solicitudes').delete().eq('id', solicitudId);
    }
    if (entryId) {
      await adminClient.from('movimiento_inventario_detalle').delete().eq('id_entrada', entryId);
      await adminClient.from('bajas_productos').delete().eq('id_entrada', entryId);
      await adminClient.from('entradas_inventario').delete().eq('id_entrada', entryId);
    }
    if (productId) {
      await adminClient.from('inventario').delete().eq('id_producto', productId);
      await adminClient.from('productos_donados').delete().eq('id_producto', productId);
    }
    if (donationId !== undefined) {
      await adminClient.from('donaciones').delete().eq('id', donationId);
    }
  }
});
