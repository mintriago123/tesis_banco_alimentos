import { rm } from 'node:fs/promises';
import {
  AUTH_DIRECTORY,
  RUNTIME_DIRECTORY,
  createAdminClient,
  readRuntime,
} from './helpers/runtime';

export default async function globalTeardown() {
  let runtime;
  try {
    runtime = await readRuntime();
  } catch {
    return;
  }

  const adminClient = createAdminClient();
  const userIds = runtime.accounts.map(({ id }) => id);
  const { data: mappings, error: mappingError } = await adminClient
    .from('donante_depositos')
    .select('id_deposito')
    .in('donante_id', userIds);
  if (mappingError) throw mappingError;
  const warehouseIds = (mappings ?? []).map(({ id_deposito }) => id_deposito);

  const { data: donations, error: donationError } = await adminClient
    .from('donaciones')
    .select('id')
    .in('user_id', userIds);
  if (donationError) throw donationError;
  const donationIds = (donations ?? []).map(({ id }) => id);

  if (donationIds.length > 0) {
    const { data: entries, error: entryError } = await adminClient
      .from('entradas_inventario')
      .select('id_entrada, id_producto')
      .in('donacion_id', donationIds);
    if (entryError) throw entryError;
    const entryIds = (entries ?? []).map(({ id_entrada }) => id_entrada);
    const productIds = (entries ?? []).map(({ id_producto }) => id_producto);

    if (entryIds.length > 0) {
      await adminClient.from('movimiento_inventario_detalle').delete().in('id_entrada', entryIds);
      await adminClient.from('bajas_productos').delete().in('id_entrada', entryIds);
      await adminClient.from('entradas_inventario').delete().in('id_entrada', entryIds);
    }
    if (productIds.length > 0) {
      await adminClient.from('inventario').delete().in('id_producto', productIds);
      await adminClient.from('productos_donados').delete().in('id_producto', productIds);
    }
    await adminClient.from('donaciones').delete().in('id', donationIds);
  }

  const { data: solicitudes, error: solicitudesError } = await adminClient
    .from('solicitudes')
    .select('id')
    .in('usuario_id', userIds);
  if (solicitudesError) throw solicitudesError;
  const solicitudIds = (solicitudes ?? []).map(({ id }) => id);
  if (solicitudIds.length > 0) {
    await adminClient.from('historial_donaciones').delete().in('solicitud_id', solicitudIds);
    await adminClient.from('detalles_solicitud').delete().in('id_solicitud', solicitudIds);
    await adminClient.from('solicitudes').delete().in('id', solicitudIds);
  }

  await adminClient.from('notificaciones_usuario').delete().in('usuario_id', userIds);
  await adminClient.from('notificaciones').delete().in('destinatario_id', userIds);
  await adminClient.from('solicitudes_bodega').delete().in('donante_id', userIds);
  await adminClient.from('solicitudes_alta_alimentos').delete().in('solicitante_id', userIds);
  await adminClient.from('donante_depositos').delete().in('donante_id', userIds);
  if (warehouseIds.length > 0) {
    await adminClient.from('depositos').delete().in('id_deposito', warehouseIds);
  }

  for (const account of runtime.accounts) {
    const { error } = await adminClient.auth.admin.deleteUser(account.id);
    if (error) throw error;
  }

  await Promise.all([
    rm(AUTH_DIRECTORY, { recursive: true, force: true }),
    rm(RUNTIME_DIRECTORY, { recursive: true, force: true }),
  ]);
}
