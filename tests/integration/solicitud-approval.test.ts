import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration coverage for the highest-risk business logic in the
 * migration: FEFO stock consumption on request approval and partial
 * delivery (src/modules/admin/reportes/solicitudes/services/use-cases/).
 * Rather than mocking the old Supabase-shaped `deps.supabaseClient` (which
 * no longer exists), this calls the real Server Action end-to-end against
 * test Postgres and asserts on final DB state — the use-cases' own
 * dependency-injection design (inventoryService/movementService/
 * notificationService as separate factories) already makes the pure
 * decision logic unit-testable in isolation; what's actually at risk here
 * is the DB orchestration, which only a real Postgres run can catch.
 */

const integrationEnabled = process.env.RUN_DB_INTEGRATION === 'true';
const describeIntegration = integrationEnabled ? describe : describe.skip;

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock('@/auth', () => ({ auth: authMock }));
// Server Actions are invoked here by direct import, not through a real Next.js
// request — revalidatePath throws "static generation store missing" outside
// that scope. Only the cache-invalidation side effect is stubbed; the actions'
// actual DB work runs unmocked.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

interface Seed {
  unidadId: number;
  tipoMagnitudId: number;
  depositoId: string;
  donanteUserId: string;
  administradorId: string;
  solicitanteId: string;
  productoId: string;
  nombreProducto: string;
}

describeIntegration('Request approval — FEFO stock consumption', () => {
  let setupClient: ReturnType<typeof postgres>;
  let updateSolicitudEstadoAction: (typeof import('@/modules/admin/reportes/solicitudes/actions'))['updateSolicitudEstadoAction'];
  let procesarDonacionAction: (typeof import('@/modules/admin/reportes/solicitudes/actions'))['procesarDonacionAction'];
  let seed: Seed;

  beforeAll(async () => {
    process.env.EMAIL_SUPPRESS_SEND = 'true';
    setupClient = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
    ({ updateSolicitudEstadoAction, procesarDonacionAction } = await import('@/modules/admin/reportes/solicitudes/actions'));

    const suffix = Date.now();
    const [tipoMagnitud] = await setupClient`insert into tipos_magnitud (nombre) values (${`Peso-${suffix}`}) returning id`;
    const [unidad] = await setupClient`
      insert into unidades (nombre, simbolo, tipo_magnitud_id, es_discreta, permite_fraccion)
      values (${`Kilogramo-${suffix}`}, ${`kg${suffix}`.slice(0, 10)}, ${tipoMagnitud.id}, false, true)
      returning id
    `;
    const [deposito] = await setupClient`insert into depositos (nombre, activo) values (${`Bodega API Test ${suffix}`}, true) returning id_deposito`;

    const [donanteUser] = await setupClient`insert into "user" (email, password_hash) values (${`solapproval-donante-${suffix}@example.test`}, 'x') returning id`;
    const [adminUser] = await setupClient`insert into "user" (email, password_hash) values (${`solapproval-admin-${suffix}@example.test`}, 'x') returning id`;
    const [solicitanteUser] = await setupClient`insert into "user" (email, password_hash) values (${`solapproval-sol-${suffix}@example.test`}, 'x') returning id`;

    await setupClient`
      insert into usuarios (id, email, rol, estado, nombre) values
        (${donanteUser.id}, ${`solapproval-donante-${suffix}@example.test`}, 'DONANTE', 'activo', 'Donante FEFO Test'),
        (${adminUser.id}, ${`solapproval-admin-${suffix}@example.test`}, 'ADMINISTRADOR', 'activo', 'Admin FEFO Test'),
        (${solicitanteUser.id}, ${`solapproval-sol-${suffix}@example.test`}, 'SOLICITANTE', 'activo', 'Solicitante FEFO Test')
    `;

    const nombreProducto = `Arroz FEFO Test ${suffix}`;
    const [producto] = await setupClient`
      insert into productos_donados (id_usuario, nombre_producto, unidad_id) values (${donanteUser.id}, ${nombreProducto}, ${unidad.id}) returning id_producto
    `;

    seed = {
      unidadId: unidad.id,
      tipoMagnitudId: tipoMagnitud.id,
      depositoId: deposito.id_deposito,
      donanteUserId: donanteUser.id,
      administradorId: adminUser.id,
      solicitanteId: solicitanteUser.id,
      productoId: producto.id_producto,
      nombreProducto,
    };
  });

  afterAll(async () => {
    if (!setupClient) return;
    const { donanteUserId, administradorId, solicitanteId, productoId, depositoId, unidadId, tipoMagnitudId } = seed;
    await setupClient`delete from movimiento_inventario_detalle where id_producto = ${productoId}`;
    await setupClient`delete from movimiento_inventario_cabecera where id_solicitante = ${solicitanteId}`;
    await setupClient`delete from historial_donaciones where solicitud_id in (select id from solicitudes where usuario_id = ${solicitanteId})`;
    await setupClient`delete from notificaciones where destinatario_id = ${solicitanteId} or rol_destinatario in ('ADMINISTRADOR', 'OPERADOR')`;
    await setupClient`delete from solicitudes where usuario_id = ${solicitanteId}`;
    await setupClient`delete from entradas_inventario where id_producto = ${productoId}`;
    await setupClient`delete from productos_donados where id_producto = ${productoId}`;
    await setupClient`delete from usuarios where id in (${donanteUserId}, ${administradorId}, ${solicitanteId})`;
    await setupClient`delete from "user" where id in (${donanteUserId}, ${administradorId}, ${solicitanteId})`;
    await setupClient`delete from depositos where id_deposito = ${depositoId}`;
    await setupClient`delete from unidades where id = ${unidadId}`;
    await setupClient`delete from tipos_magnitud where id = ${tipoMagnitudId}`;
    await setupClient.end();
  });

  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { id: seed.administradorId, rol: 'ADMINISTRADOR', estado: 'activo' } });
  });

  it('approves a request, consumes stock from the FEFO lot, and records a movement', async () => {
    const [entrada] = await setupClient`
      insert into entradas_inventario (donante_id, id_deposito, id_producto, unidad_id, cantidad_original, cantidad_disponible, estado)
      values (${seed.donanteUserId}, ${seed.depositoId}, ${seed.productoId}, ${seed.unidadId}, 10, 10, 'disponible')
      returning id_entrada
    `;

    const [solicitud] = await setupClient`
      insert into solicitudes (usuario_id, tipo_alimento, cantidad, unidad_id, estado)
      values (${seed.solicitanteId}, ${seed.nombreProducto}, 4, ${seed.unidadId}, 'pendiente')
      returning id
    `;

    try {
      const result = await updateSolicitudEstadoAction({ solicitudId: solicitud.id, nuevoEstado: 'aprobada', depositoId: seed.depositoId });
      expect(result.success).toBe(true);

      const [solicitudRow] = await setupClient`select estado, codigo_comprobante from solicitudes where id = ${solicitud.id}`;
      expect(solicitudRow.estado).toBe('aprobada');
      expect(solicitudRow.codigo_comprobante).toMatch(/^SOL-/);

      const [entradaRow] = await setupClient`select cantidad_disponible from entradas_inventario where id_entrada = ${entrada.id_entrada}`;
      expect(Number(entradaRow.cantidad_disponible)).toBe(6);

      const movimientos = await setupClient`
        select mid.cantidad, mid.tipo_transaccion from movimiento_inventario_detalle mid
        join movimiento_inventario_cabecera mic on mic.id_movimiento = mid.id_movimiento
        where mic.id_solicitante = ${seed.solicitanteId} and mid.id_producto = ${seed.productoId}
      `;
      expect(movimientos).toHaveLength(1);
      expect(movimientos[0]).toMatchObject({ tipo_transaccion: 'egreso' });
      expect(Number(movimientos[0].cantidad)).toBe(4);
    } finally {
      await setupClient`delete from solicitudes where id = ${solicitud.id}`;
      await setupClient`delete from entradas_inventario where id_entrada = ${entrada.id_entrada}`;
    }
  });

  it('rejects approval when the requested quantity exceeds available stock, leaving state untouched', async () => {
    const [entrada] = await setupClient`
      insert into entradas_inventario (donante_id, id_deposito, id_producto, unidad_id, cantidad_original, cantidad_disponible, estado)
      values (${seed.donanteUserId}, ${seed.depositoId}, ${seed.productoId}, ${seed.unidadId}, 2, 2, 'disponible')
      returning id_entrada
    `;

    const [solicitud] = await setupClient`
      insert into solicitudes (usuario_id, tipo_alimento, cantidad, unidad_id, estado)
      values (${seed.solicitanteId}, ${seed.nombreProducto}, 5, ${seed.unidadId}, 'pendiente')
      returning id
    `;

    try {
      const result = await updateSolicitudEstadoAction({ solicitudId: solicitud.id, nuevoEstado: 'aprobada', depositoId: seed.depositoId });
      expect(result.success).toBe(false);

      const [solicitudRow] = await setupClient`select estado from solicitudes where id = ${solicitud.id}`;
      expect(solicitudRow.estado).toBe('pendiente');

      const [entradaRow] = await setupClient`select cantidad_disponible from entradas_inventario where id_entrada = ${entrada.id_entrada}`;
      expect(Number(entradaRow.cantidad_disponible)).toBe(2);
    } finally {
      await setupClient`delete from solicitudes where id = ${solicitud.id}`;
      await setupClient`delete from entradas_inventario where id_entrada = ${entrada.id_entrada}`;
    }
  });

  it('processes a partial delivery, leaves the request approved-but-incomplete, and logs delivery history', async () => {
    const [entrada] = await setupClient`
      insert into entradas_inventario (donante_id, id_deposito, id_producto, unidad_id, cantidad_original, cantidad_disponible, estado)
      values (${seed.donanteUserId}, ${seed.depositoId}, ${seed.productoId}, ${seed.unidadId}, 10, 10, 'disponible')
      returning id_entrada
    `;

    const [solicitud] = await setupClient`
      insert into solicitudes (usuario_id, tipo_alimento, cantidad, unidad_id, estado)
      values (${seed.solicitanteId}, ${seed.nombreProducto}, 10, ${seed.unidadId}, 'pendiente')
      returning id
    `;

    try {
      const result = await procesarDonacionAction({ solicitudId: solicitud.id, cantidadDonar: 3, porcentaje: 30, depositoId: seed.depositoId });
      expect(result.success).toBe(true);

      const [solicitudRow] = await setupClient`select estado, cantidad_entregada, tiene_entregas_parciales from solicitudes where id = ${solicitud.id}`;
      expect(solicitudRow.estado).toBe('aprobada');
      expect(Number(solicitudRow.cantidad_entregada)).toBe(3);
      expect(solicitudRow.tiene_entregas_parciales).toBe(true);

      const [entradaRow] = await setupClient`select cantidad_disponible from entradas_inventario where id_entrada = ${entrada.id_entrada}`;
      expect(Number(entradaRow.cantidad_disponible)).toBe(7);

      const historial = await setupClient`select cantidad_entregada, porcentaje_entregado from historial_donaciones where solicitud_id = ${solicitud.id}`;
      expect(historial).toHaveLength(1);
      expect(Number(historial[0].cantidad_entregada)).toBe(3);
    } finally {
      await setupClient`delete from historial_donaciones where solicitud_id = ${solicitud.id}`;
      await setupClient`delete from solicitudes where id = ${solicitud.id}`;
      await setupClient`delete from entradas_inventario where id_entrada = ${entrada.id_entrada}`;
    }
  });
});
