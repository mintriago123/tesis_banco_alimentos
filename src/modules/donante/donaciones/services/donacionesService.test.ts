import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DonacionesService } from './donacionesService';

const DONOR_ID = '11111111-1111-4111-8111-111111111111';

const cancellationRow = {
  id: 10,
  user_id: DONOR_ID,
  nombre_donante: 'Donante de prueba',
  telefono: '0999999999',
  email: 'donante@example.com',
  tipo_producto: 'Arroz',
  categoria_comida: 'Granos',
  es_producto_personalizado: false,
  cantidad: 10,
  unidad_id: 1,
  unidad_nombre: '',
  unidad_simbolo: '',
  fecha_disponible: '2026-07-21',
  direccion_entrega: 'Dirección de prueba',
  estado: 'Cancelada' as const,
  creado_en: '2026-07-20T00:00:00.000Z',
  actualizado_en: '2026-07-21T00:00:00.000Z',
  motivo_cancelacion: 'solicitud_donante' as const,
  observaciones_cancelacion: 'Ya no está disponible',
  usuario_cancelacion_id: DONOR_ID,
  fecha_cancelacion: '2026-07-21T00:00:00.000Z',
  unidades: { nombre: 'Kilogramo', simbolo: 'kg' },
};

const createQuery = (data: unknown, error: { message: string } | null = null) => ({
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data, error }),
});

const createService = (query: ReturnType<typeof createQuery>, userId = DONOR_ID) => {
  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue(query),
  } as unknown as SupabaseClient;

  return { service: new DonacionesService(supabase), supabase };
};

describe('DonacionesService.cancelarDonacion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('actualiza una donación pendiente y conserva la fila cancelada', async () => {
    const query = createQuery(cancellationRow);
    const { service } = createService(query);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const result = await service.cancelarDonacion(
      cancellationRow.id,
      'solicitud_donante',
      cancellationRow.observaciones_cancelacion,
    );

    expect(query.delete).not.toHaveBeenCalled();
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({
      estado: 'Cancelada',
      motivo_cancelacion: 'solicitud_donante',
      observaciones_cancelacion: 'Ya no está disponible',
      usuario_cancelacion_id: DONOR_ID,
    }));
    expect(query.eq).toHaveBeenNthCalledWith(1, 'id', cancellationRow.id);
    expect(query.eq).toHaveBeenNthCalledWith(2, 'estado', 'Pendiente');
    expect(result.estado).toBe('Cancelada');
    expect(result.unidad_simbolo).toBe('kg');
  });

  it('rechaza otro motivo sin observaciones antes de tocar Supabase', async () => {
    const query = createQuery(cancellationRow);
    const { service, supabase } = createService(query);

    await expect(service.cancelarDonacion(10, 'otro')).rejects.toThrow(
      'Las observaciones son obligatorias',
    );
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('trata una donación ajena como no cancelable cuando RLS no devuelve fila', async () => {
    const query = createQuery(null);
    const { service } = createService(query, '22222222-2222-4222-8222-222222222222');

    await expect(service.cancelarDonacion(10, 'solicitud_donante')).rejects.toThrow(
      'Solo se pueden cancelar donaciones pendientes propias',
    );
    expect(query.delete).not.toHaveBeenCalled();
  });

  it.each([
    ['Aprobada'],
    ['Cancelada'],
  ])('rechaza una donación %s porque la actualización condicionada no encuentra fila', async () => {
    const query = createQuery(null);
    const { service } = createService(query);

    await expect(service.cancelarDonacion(10, 'solicitud_donante')).rejects.toThrow(/Solo se pueden cancelar/);
    expect(query.eq).toHaveBeenNthCalledWith(2, 'estado', 'Pendiente');
  });
});
