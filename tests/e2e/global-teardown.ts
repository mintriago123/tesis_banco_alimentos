import { rm } from 'node:fs/promises';
import postgres from 'postgres';
import { AUTH_DIRECTORY, RUNTIME_DIRECTORY, readRuntime } from './helpers/runtime';

export default async function globalTeardown() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // No .env.local (e.g. CI with real env vars already set) — fine.
  }

  let runtime;
  try {
    runtime = await readRuntime();
  } catch {
    return;
  }

  const sql = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
  try {
    const userIds = runtime.accounts.map(({ id }) => id);
    if (userIds.length > 0) {
      const warehouses = await sql`select id_deposito from donante_depositos where donante_id = any(${userIds})`;
      const warehouseIds = warehouses.map((w) => w.id_deposito);

      const donations = await sql`select id from donaciones where user_id = any(${userIds})`;
      const donationIds = donations.map((d) => d.id);

      if (donationIds.length > 0) {
        const entries = await sql`select id_entrada, id_producto from entradas_inventario where donacion_id = any(${donationIds})`;
        const entryIds = entries.map((e) => e.id_entrada);
        const productIds = entries.map((e) => e.id_producto);

        if (entryIds.length > 0) {
          await sql`delete from movimiento_inventario_detalle where id_entrada = any(${entryIds})`;
          await sql`delete from bajas_productos where id_entrada = any(${entryIds})`;
          await sql`delete from entradas_inventario where id_entrada = any(${entryIds})`;
        }
        if (productIds.length > 0) {
          await sql`delete from productos_donados where id_producto = any(${productIds})`;
        }
        await sql`delete from donaciones where id = any(${donationIds})`;
      }

      const solicitudes = await sql`select id from solicitudes where usuario_id = any(${userIds})`;
      const solicitudIds = solicitudes.map((s) => s.id);
      if (solicitudIds.length > 0) {
        await sql`delete from historial_donaciones where solicitud_id = any(${solicitudIds})`;
        await sql`delete from detalles_solicitud where id_solicitud = any(${solicitudIds})`;
        await sql`delete from solicitudes where id = any(${solicitudIds})`;
      }

      await sql`delete from notificaciones_usuario where usuario_id = any(${userIds})`;
      await sql`delete from notificaciones where destinatario_id = any(${userIds})`;
      await sql`delete from solicitudes_bodega where donante_id = any(${userIds})`;
      await sql`delete from solicitudes_alta_alimentos where solicitante_id = any(${userIds})`;
      await sql`delete from donante_depositos where donante_id = any(${userIds})`;
      if (warehouseIds.length > 0) {
        await sql`delete from depositos where id_deposito = any(${warehouseIds})`;
      }

      await sql`delete from usuarios where id = any(${userIds})`;
      await sql`delete from "user" where id = any(${userIds})`;
    }
  } finally {
    await sql.end();
  }

  await Promise.all([rm(AUTH_DIRECTORY, { recursive: true, force: true }), rm(RUNTIME_DIRECTORY, { recursive: true, force: true })]);
}
