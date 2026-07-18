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

const baseSolicitud: Solicitud = {
  id: 'solicitud-1',
  usuario_id: 'user-1',
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
          id_producto: 'producto-1',
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

    const result = await approveSolicitud({ solicitud: baseSolicitud }, deps);

    expect(result.success).toBe(true);
    expect(supabase.updates[0]).toMatchObject({
      table: 'solicitudes',
      data: {
        estado: 'aprobada',
        codigo_comprobante: 'CODIGO-TEST',
      },
      field: 'id',
      value: 'solicitud-1',
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
    vi.mocked(inventoryService.validarStockDisponible).mockResolvedValue({
      suficiente: false,
      disponible: 2,
      solicitado: 10,
    });

    const result = await approveSolicitud({ solicitud: baseSolicitud }, deps);

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

    const result = await approveSolicitud({ solicitud: baseSolicitud }, deps);

    expect(result.success).toBe(false);
    expect(inventoryService.restaurarInventario).toHaveBeenCalledTimes(1);
    expect(supabase.updates).toHaveLength(2);
    expect(supabase.updates[0].data.estado).toBe('aprobada');
    expect(supabase.updates[1].data.estado).toBe('pendiente');
  });

  it('rejects a solicitud and notifies the requester', async () => {
    const { deps, supabase, notificationService } = createDeps();

    const result = await rejectSolicitud({
      solicitud: baseSolicitud,
      comentarioAdmin: 'No cumple criterios',
      motivoRechazo: 'Stock reservado',
      operadorId: 'operador-1',
    }, deps);

    expect(result.success).toBe(true);
    expect(supabase.updates[0].data).toMatchObject({
      estado: 'rechazada',
      comentario_admin: 'No cumple criterios',
      motivo_rechazo: 'Stock reservado',
      operador_rechazo_id: 'operador-1',
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
      operadorId: 'operador-1',
      depositoId: 'deposito-1',
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
        solicitud_id: 'solicitud-1',
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
});
