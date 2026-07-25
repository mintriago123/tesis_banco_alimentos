import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendNotification } from '@/modules/shared/services/notificationClient';
import type { Donation } from '../types';
import { createDonationActionService } from './donationActionService';

vi.mock('@/modules/shared/services/notificationClient', () => ({
  sendNotification: vi.fn().mockResolvedValue(undefined),
}));

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

const donation: Donation = {
  id: 10,
  user_id: '22222222-2222-4222-8222-222222222222',
  nombre_donante: 'Donante de prueba',
  telefono: '0999999999',
  email: 'donante@example.com',
  tipo_persona_donante: 'Natural',
  tipo_producto: 'Arroz',
  categoria_comida: 'Granos',
  es_producto_personalizado: false,
  cantidad: 10,
  unidad_id: 1,
  unidad_nombre: 'Kilogramo',
  unidad_simbolo: 'kg',
  fecha_disponible: '2026-07-21',
  direccion_entrega: 'Dirección de prueba',
  estado: 'Pendiente',
  creado_en: '2026-07-20T00:00:00.000Z',
  actualizado_en: '2026-07-20T00:00:00.000Z',
};

const createQuery = (data: unknown, error: { message: string; code?: string } | null = null) => ({
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data, error }),
});

const createSupabase = (
  updateData: unknown,
  updateError: { message: string; code?: string } | null = null,
  includeDonorMapping = false,
  mappingData: unknown = { id_deposito: '33333333-3333-4333-8333-333333333333' },
  stateData: unknown = { estado: 'Pendiente' },
) => {
  const mappingQuery = createQuery(mappingData);
  const stateQuery = createQuery(stateData);
  const updateQuery = createQuery(updateData, updateError);
  const queries = includeDonorMapping
    ? [mappingQuery, stateQuery, updateQuery]
    : [stateQuery, updateQuery];
  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: ADMIN_ID } },
        error: null,
      }),
    },
    from: vi.fn(),
  } as unknown as SupabaseClient;
  (supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => queries.shift());

  return { supabase, stateQuery, updateQuery };
};

describe('createDonationActionService cancellation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('cancela una donación pendiente con una actualización condicionada', async () => {
    const { supabase, updateQuery } = createSupabase({ id: donation.id });
    const service = createDonationActionService(supabase);

    const result = await service.updateDonationEstado(donation, 'Cancelada', {
      motivo: 'solicitud_donante',
    });

    expect(result.success).toBe(true);
    expect(updateQuery.delete).not.toHaveBeenCalled();
    expect(updateQuery.eq).toHaveBeenCalledWith('estado', 'Pendiente');
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      estado: 'Cancelada',
      motivo_cancelacion: 'solicitud_donante',
      usuario_cancelacion_id: ADMIN_ID,
    }));
    expect(sendNotification).toHaveBeenCalledWith({
      event: 'donation_status_changed',
      entityId: String(donation.id),
    });
  });

  it('rechaza cancelar una donación aprobada antes de actualizarla', async () => {
    const approvedDonation = { ...donation, estado: 'Aprobada' as const };
    const { supabase } = createSupabase({ id: donation.id });
    const service = createDonationActionService(supabase);

    const result = await service.updateDonationEstado(approvedDonation, 'Cancelada', {
      motivo: 'solicitud_donante',
    });

    expect(result).toEqual({
      success: false,
      error: 'Solo se pueden cancelar donaciones pendientes',
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('rechaza otro motivo sin observaciones', async () => {
    const { supabase } = createSupabase({ id: donation.id });
    const service = createDonationActionService(supabase);

    const result = await service.updateDonationEstado(donation, 'Cancelada', {
      motivo: 'otro',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('observaciones son obligatorias');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('reporta la carrera cuando la fila dejó de estar pendiente', async () => {
    const { supabase } = createSupabase(null);
    const service = createDonationActionService(supabase);
    const raceDonation = { ...donation, id: 11 };

    const result = await service.updateDonationEstado(raceDonation, 'Cancelada', {
      motivo: 'solicitud_donante',
    });

    expect(result).toEqual({
      success: false,
      error: 'La donación ya no está pendiente o fue cancelada por otro usuario',
    });
  });

  it('propaga un constraint inválido sin intentar guardar Entregada como fallback', async () => {
    const constraintError = {
      message: 'new row violates check constraint "donaciones_estado_check"',
      code: '23514',
    };
    const { supabase, updateQuery } = createSupabase(null, constraintError, true);
    const service = createDonationActionService(supabase);

    const result = await service.updateDonationEstado({ ...donation, id: 12 }, 'Aprobada');

    expect(result).toEqual({
      success: false,
      error: 'No fue posible actualizar el estado de la donación',
      errorDetails: constraintError,
    });
    expect(supabase.from).toHaveBeenCalledTimes(3);
    expect(updateQuery.update).toHaveBeenCalledTimes(1);
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({ estado: 'Aprobada' }));
  });

  it('validates malformed donations before touching Supabase', async () => {
    const { supabase } = createSupabase({ id: donation.id });
    const service = createDonationActionService(supabase);

    const result = await service.updateDonationEstado({ ...donation, id: 0 }, 'Aprobada');

    expect(result.success).toBe(false);
    expect(result.error).toContain('donation.id');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('requires an active donor warehouse before approving', async () => {
    const { supabase } = createSupabase(
      { id: donation.id },
      null,
      true,
      null,
    );
    const service = createDonationActionService(supabase);

    const result = await service.updateDonationEstado({ ...donation, id: 13 }, 'Aprobada');

    expect(result).toMatchObject({
      success: false,
      error: 'El donante no tiene una bodega principal activa. Debe completar la configuración de su perfil.',
    });
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('approves a donation only after resolving the donor warehouse', async () => {
    const { supabase, updateQuery } = createSupabase({ id: donation.id }, null, true);
    const service = createDonationActionService(supabase);

    const result = await service.updateDonationEstado({ ...donation, id: 14 }, 'Aprobada');

    expect(result.success).toBe(true);
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      estado: 'Aprobada',
      codigo_comprobante: expect.any(String),
    }));
    expect(sendNotification).toHaveBeenCalledWith({
      event: 'donation_status_changed',
      entityId: '14',
    });
  });

  it('returns a migration error when cancellation audit columns are missing', async () => {
    const { supabase } = createSupabase(
      null,
      { message: 'column motivo_cancelacion does not exist', code: '42703' },
    );
    const service = createDonationActionService(supabase);

    const result = await service.updateDonationEstado({ ...donation, id: 15 }, 'Cancelada', {
      motivo: 'solicitud_donante',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('base de datos no está actualizada');
  });

  it('keeps a successful state change when notification delivery fails', async () => {
    vi.mocked(sendNotification).mockRejectedValueOnce(new Error('mailer unavailable'));
    const { supabase } = createSupabase({ id: donation.id });
    const service = createDonationActionService(supabase);

    const result = await service.updateDonationEstado({ ...donation, id: 16 }, 'Cancelada', {
      motivo: 'solicitud_donante',
    });

    expect(result.success).toBe(true);
  });

  it('rolls back an approval when the database reports a newer approved state', async () => {
    const stateQuery = createQuery({ estado: 'Aprobada' });
    const updateQuery = createQuery({ id: 17 });
    const rollbackLookup = createQuery({ id_entrada: 'entrada-17', estado: 'disponible' });
    const rollbackMutation = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn(),
    };
    rollbackMutation.eq
      .mockReturnValueOnce(rollbackMutation)
      .mockResolvedValueOnce({ error: null });

    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null }),
      },
      from: vi.fn()
        .mockReturnValueOnce(stateQuery)
        .mockReturnValueOnce(updateQuery)
        .mockReturnValueOnce(rollbackLookup)
        .mockReturnValueOnce(rollbackMutation),
    } as unknown as SupabaseClient;
    const service = createDonationActionService(supabase);

    const result = await service.updateDonationEstado({ ...donation, id: 17 }, 'Cancelada', {
      motivo: 'solicitud_donante',
    });

    expect(result.success).toBe(true);
    expect(rollbackMutation.update).toHaveBeenCalledWith(expect.objectContaining({
      cantidad_disponible: 0,
      estado: 'cancelado',
    }));
  });
});
