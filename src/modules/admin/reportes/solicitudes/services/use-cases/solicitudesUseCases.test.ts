import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Solicitud } from '../../types';
import type { SolicitudesInventoryService } from '../solicitudesInventoryService';
import type { SolicitudesMovementService } from '../solicitudesMovementService';
import type { SolicitudesNotificationService } from '../solicitudesNotificationService';
import { approveSolicitud } from './approveSolicitud';
import { deliverSolicitud } from './deliverSolicitud';
import { processPartialDelivery } from './processPartialDelivery';
import { rejectSolicitud } from './rejectSolicitud';
import type { SolicitudUseCaseDeps } from './types';

vi.mock('@/lib/comprobante', () => ({
  generarCodigoComprobante: vi.fn(() => 'CODIGO-TEST'),
}));

interface RecordedUpdate {
  table: string;
  data: Record<string, unknown>;
  field: string;
  value: string;
}

interface RecordedInsert {
  table: string;
  data: Record<string, unknown>;
}

const SOLICITUD_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const OPERADOR_ID = '33333333-3333-4333-8333-333333333333';
const DEPOSITO_ID = '44444444-4444-4444-8444-444444444444';
const PRODUCTO_ID = '55555555-5555-4555-8555-555555555555';

const baseSolicitud: Solicitud = {
  id: SOLICITUD_ID,
  usuario_id: USER_ID,
  tipo_alimento: 'Arroz',
  cantidad: 10,
  estado: 'pendiente',
  created_at: '2026-01-01T00:00:00.000Z',
  unidad_id: 1,
  unidades: {
    id: 1,
    nombre: 'Kilogramo',
    simbolo: 'kg',
    tipo_magnitud_id: 1,
    es_base: true,
  },
  usuarios: {
    nombre: 'Solicitante',
    cedula: '0102030405',
    telefono: '0999999999',
    email: 'user@example.com',
  },
};

const createSupabaseRecorder = () => {
  const updates: RecordedUpdate[] = [];
  const inserts: RecordedInsert[] = [];
  const updateResults: Array<{ error: unknown }> = [];
  const insertResults: Array<{ error: unknown }> = [];

  const client = {
    from: vi.fn((table: string) => ({
      update: vi.fn((data: Record<string, unknown>) => ({
        eq: vi.fn(async (field: string, value: string) => {
          updates.push({ table, data, field, value });
          return updateResults.shift() ?? { error: null };
        }),
      })),
      insert: vi.fn(async (data: Record<string, unknown>) => {
        inserts.push({ table, data });
        return insertResults.shift() ?? { error: null };
      }),
    })),
  } as unknown as SupabaseClient;

  return {
    client,
    updates,
    inserts,
    updateResults,
    insertResults,
  };
};

const createDeps = () => {
  const supabase = createSupabaseRecorder();
  const inventoryService = {
    validarStockDisponible: vi.fn(async () => ({ suficiente: true, disponible: 10, solicitado: 10 })),
    validarStockDisponiblePorDeposito: vi.fn(async () => ({ suficiente: true, disponible: 10, solicitado: 10 })),
    descontarDelInventario: vi.fn(async () => ({
      cantidadRestante: 0,
      productosActualizados: 1,
      detalleEntregado: [{
        producto: {
          id_producto: PRODUCTO_ID,
          nombre_producto: 'Arroz',
          unidad_id: 1,
        },
        cantidadEntregada: 10,
      }],
      noStock: false,
    })),
    restaurarInventario: vi.fn(async () => ({ success: true, data: { productosActualizados: 1 } })),
  } as unknown as SolicitudesInventoryService;
  const movementService = {
    registrarMovimientoSolicitud: vi.fn(async () => ({ success: true })),
    registrarMovimientoReversion: vi.fn(async () => ({ success: true })),
    obtenerMovimientosEgresoSolicitud: vi.fn(async () => []),
  } as unknown as SolicitudesMovementService;
  const notificationService = {
    notificarCambioEstado: vi.fn(async () => undefined),
  } as unknown as SolicitudesNotificationService;
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const deps: SolicitudUseCaseDeps = {
    supabaseClient: supabase.client,
    inventoryService,
    movementService,
    notificationService,
    logger,
  };

  return {
    deps,
    supabase,
    inventoryService,
    movementService,
    notificationService,
  };
};

describe('solicitudes use cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('approves a solicitud with stock and records inventory movement', async () => {
    const { deps, supabase, movementService, notificationService } = createDeps();

    const result = await approveSolicitud({ solicitud: baseSolicitud, depositoId: DEPOSITO_ID }, deps);

    expect(result.success).toBe(true);
    expect(supabase.updates[0]).toMatchObject({
      table: 'solicitudes',
      data: {
        estado: 'aprobada',
        codigo_comprobante: 'CODIGO-TEST',
      },
      field: 'id',
      value: SOLICITUD_ID,
    });
    expect(movementService.registrarMovimientoSolicitud).toHaveBeenCalledTimes(1);
    expect(notificationService.notificarCambioEstado).toHaveBeenCalledWith(
      baseSolicitud,
      'aprobada',
      expect.objectContaining({ codigoComprobanteGuardado: 'CODIGO-TEST' })
    );
  });

  it('does not update approval state when stock is insufficient', async () => {
    const { deps, supabase, inventoryService } = createDeps();
    vi.mocked(inventoryService.validarStockDisponiblePorDeposito).mockResolvedValue({
      suficiente: false,
      disponible: 2,
      solicitado: 10,
    });

    const result = await approveSolicitud({ solicitud: baseSolicitud, depositoId: DEPOSITO_ID }, deps);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No hay suficiente inventario disponible');
    expect(inventoryService.descontarDelInventario).not.toHaveBeenCalled();
    expect(supabase.updates).toHaveLength(0);
  });

  it('restores inventory and rolls back approval when movement registration fails', async () => {
    const { deps, supabase, inventoryService, movementService } = createDeps();
    vi.mocked(movementService.registrarMovimientoSolicitud).mockResolvedValue({
      success: false,
      error: 'Movimiento fallido',
    });

    const result = await approveSolicitud({ solicitud: baseSolicitud, depositoId: DEPOSITO_ID }, deps);

    expect(result.success).toBe(false);
    expect(inventoryService.restaurarInventario).toHaveBeenCalledTimes(1);
    expect(supabase.updates).toHaveLength(2);
    expect(supabase.updates[0].data.estado).toBe('aprobada');
    expect(supabase.updates[1].data.estado).toBe('pendiente');
  });

  it('requires a warehouse before approving a solicitud', async () => {
    const { deps, supabase, inventoryService } = createDeps();

    const result = await approveSolicitud({
      solicitud: baseSolicitud,
      depositoId: '',
    }, deps);

    expect(result.success).toBe(false);
    expect(result.error).toContain('depositoId');
    expect(inventoryService.validarStockDisponiblePorDeposito).not.toHaveBeenCalled();
    expect(inventoryService.descontarDelInventario).not.toHaveBeenCalled();
    expect(supabase.updates).toHaveLength(0);
  });

  it('rejects a solicitud and notifies the requester', async () => {
    const { deps, supabase, notificationService } = createDeps();

    const result = await rejectSolicitud({
      solicitud: baseSolicitud,
      comentarioAdmin: 'No cumple criterios',
      motivoRechazo: 'Stock reservado',
      operadorId: OPERADOR_ID,
    }, deps);

    expect(result.success).toBe(true);
    expect(supabase.updates[0].data).toMatchObject({
      estado: 'rechazada',
      comentario_admin: 'No cumple criterios',
      motivo_rechazo: 'Stock reservado',
      operador_rechazo_id: OPERADOR_ID,
    });
    expect(notificationService.notificarCambioEstado).toHaveBeenCalledWith(
      baseSolicitud,
      'rechazada',
      expect.objectContaining({ motivoRechazo: 'Stock reservado' })
    );
  });

  it('delivers an approved solicitud only when the comprobante code matches', async () => {
    const { deps, supabase, notificationService } = createDeps();
    const approvedSolicitud: Solicitud = {
      ...baseSolicitud,
      estado: 'aprobada',
      codigo_comprobante: 'ABC-123',
    };

    const result = await deliverSolicitud({
      solicitud: approvedSolicitud,
      codigoComprobanteVerificado: 'abc-123',
    }, deps);

    expect(result.success).toBe(true);
    expect(supabase.updates[0].data.estado).toBe('entregada');
    expect(notificationService.notificarCambioEstado).toHaveBeenCalledWith(
      approvedSolicitud,
      'entregada',
      expect.objectContaining({})
    );
  });

  it('processes partial delivery with inventory discount, movement and history', async () => {
    const { deps, supabase, movementService, notificationService } = createDeps();

    const result = await processPartialDelivery({
      solicitud: baseSolicitud,
      cantidadDonar: 4,
      porcentaje: 40,
      comentario: 'Entrega inicial',
      operadorId: OPERADOR_ID,
      depositoId: DEPOSITO_ID,
    }, deps);

    expect(result.success).toBe(true);
    expect(result.data?.message).toBe('Entrega parcial registrada: 4 kg (40% del total). Total entregado: 4/10');
    expect(supabase.updates[0].data).toMatchObject({
      estado: 'aprobada',
      cantidad_entregada: 4,
      tiene_entregas_parciales: true,
    });
    expect(supabase.inserts[0]).toMatchObject({
      table: 'historial_donaciones',
      data: {
        solicitud_id: SOLICITUD_ID,
        cantidad_entregada: 4,
        porcentaje_entregado: 40,
      },
    });
    expect(movementService.registrarMovimientoSolicitud).toHaveBeenCalledTimes(1);
    expect(notificationService.notificarCambioEstado).toHaveBeenCalledWith(
      baseSolicitud,
      'aprobada',
      expect.objectContaining({ esParcial: true, cantidadParcial: 4 })
    );
  });

  it('validates approval identifiers and approved quantities', async () => {
    const { deps } = createDeps();

    await expect(approveSolicitud({
      solicitud: { ...baseSolicitud, id: 'invalid' }, depositoId: DEPOSITO_ID,
    }, deps)).resolves.toMatchObject({ success: false, error: expect.stringContaining('solicitud.id') });
    await expect(approveSolicitud({
      solicitud: { ...baseSolicitud, usuario_id: 'invalid' }, depositoId: DEPOSITO_ID,
    }, deps)).resolves.toMatchObject({ success: false, error: expect.stringContaining('usuario_id') });
    await expect(approveSolicitud({
      solicitud: baseSolicitud, depositoId: DEPOSITO_ID, cantidadAprobada: 0,
    }, deps)).resolves.toMatchObject({ success: false, error: 'cantidadAprobada debe ser mayor a 0.' });
  });

  it('restores inventory when the discount or state update fails', async () => {
    const first = createDeps();
    vi.mocked(first.inventoryService.descontarDelInventario).mockResolvedValue({
      cantidadRestante: 1,
      productosActualizados: 1,
      noStock: true,
      error: true,
      detalleEntregado: [{
        producto: { id_producto: PRODUCTO_ID, nombre_producto: 'Arroz', unidad_id: 1 },
        cantidadEntregada: 2,
      }],
    });
    const discountResult = await approveSolicitud({ solicitud: baseSolicitud, depositoId: DEPOSITO_ID }, first.deps);
    expect(discountResult.success).toBe(false);
    expect(first.inventoryService.restaurarInventario).toHaveBeenCalledTimes(1);

    const second = createDeps();
    second.supabase.updateResults.push({ error: { message: 'state update failed' } });
    const stateResult = await approveSolicitud({ solicitud: baseSolicitud, depositoId: DEPOSITO_ID }, second.deps);
    expect(stateResult).toMatchObject({ success: false, error: 'No fue posible actualizar el estado de la solicitud' });
    expect(second.inventoryService.restaurarInventario).toHaveBeenCalledTimes(1);
  });

  it('covers delivery validation and persistence errors', async () => {
    const { deps, supabase } = createDeps();
    await expect(deliverSolicitud({ solicitud: baseSolicitud }, deps))
      .resolves.toMatchObject({ success: false, error: expect.stringContaining('comprobante') });
    await expect(deliverSolicitud({
      solicitud: { ...baseSolicitud, codigo_comprobante: 'ABC' },
      codigoComprobanteVerificado: 'XYZ',
    }, deps)).resolves.toMatchObject({ success: false, error: expect.stringContaining('no coincide') });
    await expect(deliverSolicitud({
      solicitud: { ...baseSolicitud, codigo_comprobante: 'ABC', estado: 'rechazada' },
      codigoComprobanteVerificado: 'ABC',
    }, deps)).resolves.toMatchObject({ success: false, error: expect.stringContaining('aprobadas') });

    supabase.updateResults.push({ error: { message: 'delivery update failed' } });
    const updateError = await deliverSolicitud({
      solicitud: { ...baseSolicitud, codigo_comprobante: 'ABC', estado: 'aprobada' },
      codigoComprobanteVerificado: 'ABC',
    }, deps);
    expect(updateError).toMatchObject({ success: false, error: 'No fue posible actualizar el estado de la solicitud' });
  });

  it('handles complete partial deliveries and history errors', async () => {
    const complete = createDeps();
    complete.supabase.insertResults.push({ error: { message: 'history unavailable' } });
    const result = await processPartialDelivery({
      solicitud: baseSolicitud,
      cantidadDonar: 10,
      porcentaje: 100,
      depositoId: DEPOSITO_ID,
    }, complete.deps);
    expect(result).toMatchObject({
      success: true,
      data: { message: 'Donación completada: 10 kg de Arroz' },
    });
    expect(complete.notificationService.notificarCambioEstado).toHaveBeenCalledWith(
      baseSolicitud,
      'aprobada',
      expect.objectContaining({ esParcial: false }),
    );
  });

  it('rejects partial deliveries without stock and restores failed discounts', async () => {
    const noStock = createDeps();
    vi.mocked(noStock.inventoryService.validarStockDisponiblePorDeposito).mockResolvedValue({
      suficiente: false,
      disponible: 0,
      solicitado: 4,
    });
    await expect(processPartialDelivery({
      solicitud: baseSolicitud, cantidadDonar: 4, porcentaje: 40, depositoId: DEPOSITO_ID,
    }, noStock.deps)).resolves.toMatchObject({ success: false, error: expect.stringContaining('no tiene stock') });

    const insufficient = createDeps();
    vi.mocked(insufficient.inventoryService.validarStockDisponiblePorDeposito).mockResolvedValue({
      suficiente: false,
      disponible: 2,
      solicitado: 4,
    });
    await expect(processPartialDelivery({
      solicitud: baseSolicitud, cantidadDonar: 4, porcentaje: 40, depositoId: DEPOSITO_ID,
    }, insufficient.deps)).resolves.toMatchObject({ success: false, error: expect.stringContaining('Stock insuficiente') });

    const failedDiscount = createDeps();
    vi.mocked(failedDiscount.inventoryService.descontarDelInventario).mockResolvedValue({
      cantidadRestante: 1,
      productosActualizados: 1,
      noStock: true,
      detalleEntregado: [{
        producto: { id_producto: PRODUCTO_ID, nombre_producto: 'Arroz', unidad_id: 1 },
        cantidadEntregada: 2,
      }],
    });
    const discountResult = await processPartialDelivery({
      solicitud: baseSolicitud, cantidadDonar: 4, porcentaje: 40, depositoId: DEPOSITO_ID,
    }, failedDiscount.deps);
    expect(discountResult.success).toBe(false);
    expect(failedDiscount.inventoryService.restaurarInventario).toHaveBeenCalledTimes(1);
  });

  it('rolls partial delivery back when movement or state persistence fails', async () => {
    const movementFailure = createDeps();
    vi.mocked(movementFailure.movementService.registrarMovimientoSolicitud).mockResolvedValue({
      success: false,
      error: 'movement failed',
    });
    const movementResult = await processPartialDelivery({
      solicitud: baseSolicitud, cantidadDonar: 4, porcentaje: 40, depositoId: DEPOSITO_ID,
    }, movementFailure.deps);
    expect(movementResult).toMatchObject({ success: false, error: 'movement failed' });
    expect(movementFailure.inventoryService.restaurarInventario).toHaveBeenCalledTimes(1);
    expect(movementFailure.supabase.updates).toHaveLength(2);

    const stateFailure = createDeps();
    stateFailure.supabase.updateResults.push({ error: { message: 'state failed' } });
    const stateResult = await processPartialDelivery({
      solicitud: baseSolicitud, cantidadDonar: 4, porcentaje: 40, depositoId: DEPOSITO_ID,
    }, stateFailure.deps);
    expect(stateResult).toMatchObject({ success: false, error: 'No fue posible registrar la donación' });
    expect(stateFailure.inventoryService.restaurarInventario).toHaveBeenCalledTimes(1);
  });

  it('validates partial delivery parameters and rejection persistence', async () => {
    const { deps, supabase } = createDeps();
    await expect(processPartialDelivery({
      solicitud: baseSolicitud, cantidadDonar: 1, porcentaje: 10,
    }, deps)).resolves.toMatchObject({ success: false, error: expect.stringContaining('bodega') });
    await expect(processPartialDelivery({
      solicitud: baseSolicitud, cantidadDonar: 0, porcentaje: 10, depositoId: DEPOSITO_ID,
    }, deps)).resolves.toMatchObject({ success: false, error: 'cantidadDonar debe ser mayor a 0.' });
    await expect(processPartialDelivery({
      solicitud: baseSolicitud, cantidadDonar: 1, porcentaje: 101, depositoId: DEPOSITO_ID,
    }, deps)).resolves.toMatchObject({ success: false, error: expect.stringContaining('porcentaje') });

    supabase.updateResults.push({ error: { message: 'reject failed' } });
    const rejectResult = await rejectSolicitud({ solicitud: baseSolicitud, operadorId: OPERADOR_ID }, deps);
    expect(rejectResult).toMatchObject({ success: false, error: 'No fue posible actualizar el estado de la solicitud' });
  });
});
