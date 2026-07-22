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
  select: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data, error }),
});

const createSupabase = (updateData: unknown, updateError: { message: string; code?: string } | null = null) => {
  const stateQuery = createQuery({ estado: 'Pendiente' });
  const updateQuery = createQuery(updateData, updateError);
  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: ADMIN_ID } },
        error: null,
      }),
    },
    from: vi.fn()
      .mockReturnValueOnce(stateQuery)
      .mockReturnValueOnce(updateQuery),
  } as unknown as SupabaseClient;

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
});
