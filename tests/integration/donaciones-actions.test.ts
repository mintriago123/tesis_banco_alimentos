import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration coverage for src/modules/admin/reportes/donaciones/actions.ts,
 * replacing the old Supabase-client-mocked `donationActionService.test.ts`
 * (that service no longer exists — cancellation/approval now live directly
 * in the Server Action, run inside `withRlsContext`, and rely on the real
 * `validar_cancelacion_donacion` + `crear_producto_desde_donacion` triggers
 * for state stamping and inventory creation). Only `@/auth` and the
 * fetch-based `sendNotification` client are mocked; everything else hits
 * real Postgres.
 */

const integrationEnabled = process.env.RUN_DB_INTEGRATION === 'true';
const describeIntegration = integrationEnabled ? describe : describe.skip;

const { authMock, sendNotificationMock } = vi.hoisted(() => ({ authMock: vi.fn(), sendNotificationMock: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/auth', () => ({ auth: authMock }));
vi.mock('@/modules/shared/services/notificationClient', () => ({ sendNotification: sendNotificationMock }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

interface Seed {
  unidadId: number;
  tipoMagnitudId: number;
  alimentoId: number;
  depositoId: string;
  donanteId: string;
  otroDonanteId: string;
  adminId: string;
  operadorId: string;
}

describeIntegration('Donation approval / cancellation (Server Action)', () => {
  let setupClient: ReturnType<typeof postgres>;
  let updateDonationEstadoAction: (typeof import('@/modules/admin/reportes/donaciones/actions'))['updateDonationEstadoAction'];
  let seed: Seed;

  const insertDonacion = async (overrides: Partial<{ userId: string; estado: string; depositoId: string | null }> = {}) => {
    const suffix = Date.now() + Math.random();
    const [row] = await setupClient`
      insert into donaciones (user_id, nombre_donante, telefono, email, tipo_persona_donante, tipo_producto, categoria_comida, alimento_id, cantidad, unidad_id, unidad_nombre, unidad_simbolo, fecha_disponible, direccion_entrega, estado, id_deposito)
      values (
        ${overrides.userId ?? seed.donanteId}, 'Donante Prueba', '0999999999', 'donante@example.test', 'Natural',
        ${`Producto Donacion Test ${suffix}`}, 'Granos', ${seed.alimentoId}, 5, ${seed.unidadId}, 'Kilogramo', 'kg', current_date, 'Direccion prueba',
        ${overrides.estado ?? 'Pendiente'}, ${overrides.depositoId === undefined ? seed.depositoId : overrides.depositoId}
      )
      returning id
    `;
    return row.id as number;
  };

  beforeAll(async () => {
    setupClient = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
    ({ updateDonationEstadoAction } = await import('@/modules/admin/reportes/donaciones/actions'));

    const suffix = Date.now();
    const [tipoMagnitud] = await setupClient`insert into tipos_magnitud (nombre) values (${`Peso-Don-${suffix}`}) returning id`;
    const [unidad] = await setupClient`
      insert into unidades (nombre, simbolo, tipo_magnitud_id, es_discreta, permite_fraccion)
      values (${`Kilogramo-Don-${suffix}`}, ${`kgd${suffix}`.slice(0, 10)}, ${tipoMagnitud.id}, false, true)
      returning id
    `;
    const [deposito] = await setupClient`insert into depositos (nombre, activo) values (${`Bodega Donaciones Test ${suffix}`}, true) returning id_deposito`;
    const [alimento] = await setupClient`insert into alimentos (nombre, categoria) values (${`Alimento Donacion Test ${suffix}`}, 'Granos') returning id`;

    const [donante] = await setupClient`insert into "user" (email, password_hash) values (${`dondonante-${suffix}@example.test`}, 'x') returning id`;
    const [otroDonante] = await setupClient`insert into "user" (email, password_hash) values (${`dondonante2-${suffix}@example.test`}, 'x') returning id`;
    const [admin] = await setupClient`insert into "user" (email, password_hash) values (${`donadmin-${suffix}@example.test`}, 'x') returning id`;
    const [operador] = await setupClient`insert into "user" (email, password_hash) values (${`donoperador-${suffix}@example.test`}, 'x') returning id`;

    await setupClient`
      insert into usuarios (id, email, rol, estado, nombre) values
        (${donante.id}, ${`dondonante-${suffix}@example.test`}, 'DONANTE', 'activo', 'Donante Test'),
        (${otroDonante.id}, ${`dondonante2-${suffix}@example.test`}, 'DONANTE', 'activo', 'Otro Donante Test'),
        (${admin.id}, ${`donadmin-${suffix}@example.test`}, 'ADMINISTRADOR', 'activo', 'Admin Test'),
        (${operador.id}, ${`donoperador-${suffix}@example.test`}, 'OPERADOR', 'activo', 'Operador Test')
    `;

    await setupClient`insert into donante_depositos (donante_id, id_deposito, es_principal, activo) values (${donante.id}, ${deposito.id_deposito}, true, true)`;

    seed = {
      unidadId: unidad.id,
      tipoMagnitudId: tipoMagnitud.id,
      alimentoId: alimento.id,
      depositoId: deposito.id_deposito,
      donanteId: donante.id,
      otroDonanteId: otroDonante.id,
      adminId: admin.id,
      operadorId: operador.id,
    };
  });

  afterAll(async () => {
    if (!setupClient) return;
    const { donanteId, otroDonanteId, adminId, operadorId, depositoId, unidadId, tipoMagnitudId, alimentoId } = seed;

    // auditoria_donaciones is intentionally immutable (bloquear_mutacion_auditoria_donaciones
    // rejects any delete/update) and FK-restricts deletion of both the cancelled donation row
    // and the acting admin's "user" row — that's the feature under test, not a leak, so cleanup
    // best-effort deletes everything else and tolerates failures on the audited rows.
    const tryDelete = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (error) {
        console.warn(`[donaciones-actions.test cleanup] skipped ${label}: ${(error as Error).message}`);
      }
    };

    await tryDelete('entradas_inventario', () => setupClient`delete from entradas_inventario where donante_id = ${donanteId}`);
    await tryDelete('productos_donados', () => setupClient`delete from productos_donados where id_usuario = ${donanteId}`);
    await tryDelete('donaciones (non-audited)', () => setupClient`delete from donaciones where user_id in (${donanteId}, ${otroDonanteId})`);
    await tryDelete('donante_depositos', () => setupClient`delete from donante_depositos where donante_id = ${donanteId}`);
    await tryDelete('usuarios', () => setupClient`delete from usuarios where id in (${donanteId}, ${otroDonanteId}, ${adminId}, ${operadorId})`);
    await tryDelete('user', () => setupClient`delete from "user" where id in (${donanteId}, ${otroDonanteId}, ${adminId}, ${operadorId})`);
    await tryDelete('depositos', () => setupClient`delete from depositos where id_deposito = ${depositoId}`);
    await tryDelete('unidades', () => setupClient`delete from unidades where id = ${unidadId}`);
    await tryDelete('tipos_magnitud', () => setupClient`delete from tipos_magnitud where id = ${tipoMagnitudId}`);
    await tryDelete('alimentos', () => setupClient`delete from alimentos where id = ${alimentoId}`);
    await setupClient.end();
  });

  beforeEach(() => {
    authMock.mockReset();
  });

  afterEach(() => {
    sendNotificationMock.mockClear();
  });

  it('approves a pending donation and lets the DB trigger create the inventory entry', async () => {
    authMock.mockResolvedValue({ user: { id: seed.adminId, rol: 'ADMINISTRADOR', estado: 'activo' } });
    const donationId = await insertDonacion();

    const result = await updateDonationEstadoAction(donationId, 'Aprobada');
    expect(result.success).toBe(true);
    expect(sendNotificationMock).toHaveBeenCalledWith({ event: 'donation_status_changed', entityId: String(donationId) });

    const [row] = await setupClient`select estado, codigo_comprobante from donaciones where id = ${donationId}`;
    expect(row.estado).toBe('Aprobada');
    expect(row.codigo_comprobante).toMatch(/^DON-/);

    const entradas = await setupClient`select cantidad_disponible, estado from entradas_inventario where donacion_id = ${donationId}`;
    expect(entradas).toHaveLength(1);
    expect(entradas[0]).toMatchObject({ estado: 'disponible' });
    expect(Number(entradas[0].cantidad_disponible)).toBe(5);
  });

  it('rejects cancellation from a non-administrator (OPERADOR) before touching the DB', async () => {
    authMock.mockResolvedValue({ user: { id: seed.operadorId, rol: 'OPERADOR', estado: 'activo' } });
    const donationId = await insertDonacion();

    const result = await updateDonationEstadoAction(donationId, 'Cancelada', { motivo: 'solicitud_donante' });
    expect(result.success).toBe(false);

    const [row] = await setupClient`select estado from donaciones where id = ${donationId}`;
    expect(row.estado).toBe('Pendiente');
  });

  it('cancels a pending donation as ADMINISTRADOR, letting the trigger stamp the actor and write an audit row', async () => {
    authMock.mockResolvedValue({ user: { id: seed.adminId, rol: 'ADMINISTRADOR', estado: 'activo' } });
    const donationId = await insertDonacion();

    const result = await updateDonationEstadoAction(donationId, 'Cancelada', { motivo: 'otro', observaciones: 'Prueba de integración' });
    expect(result.success).toBe(true);

    const [row] = await setupClient`select estado, motivo_cancelacion, usuario_cancelacion_id, fecha_cancelacion from donaciones where id = ${donationId}`;
    expect(row).toMatchObject({ estado: 'Cancelada', motivo_cancelacion: 'otro', usuario_cancelacion_id: seed.adminId });
    expect(row.fecha_cancelacion).not.toBeNull();

    const auditoria = await setupClient`select estado_anterior, estado_nuevo, usuario_id from auditoria_donaciones where donacion_id = ${donationId}`;
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]).toMatchObject({ estado_anterior: 'Pendiente', estado_nuevo: 'Cancelada', usuario_id: seed.adminId });
  });

  it('rejects cancelling a donation that is no longer pending, without invoking the trigger', async () => {
    authMock.mockResolvedValue({ user: { id: seed.adminId, rol: 'ADMINISTRADOR', estado: 'activo' } });
    const donationId = await insertDonacion({ estado: 'Aprobada' });

    const result = await updateDonationEstadoAction(donationId, 'Cancelada', { motivo: 'solicitud_donante' });
    expect(result.success).toBe(false);

    const [row] = await setupClient`select estado, motivo_cancelacion from donaciones where id = ${donationId}`;
    expect(row).toMatchObject({ estado: 'Aprobada', motivo_cancelacion: null });
  });
});
