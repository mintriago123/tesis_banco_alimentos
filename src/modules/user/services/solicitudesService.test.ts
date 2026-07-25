import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { SolicitudFormData } from '../types';
import { SolicitudesService } from './solicitudesService';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SOLICITUD_ID = '22222222-2222-4222-8222-222222222222';

const validForm: SolicitudFormData = {
  tipo_alimento: 'Arroz',
  cantidad: 5,
  unidad_id: 1,
  comentarios: '  Entregar en la mañana  ',
  latitud: -2.19,
  longitud: -79.88,
};

const createInsertQuery = (data: unknown, error: unknown = null) => {
  const query = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn(async () => ({ data, error })),
  };

  query.insert.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
};

const createService = (query = createInsertQuery({ id: SOLICITUD_ID })) => {
  const supabase = {
    from: vi.fn().mockReturnValue(query),
  } as unknown as SupabaseClient;

  return { service: new SolicitudesService(supabase), supabase, query };
};

describe('SolicitudesService.createSolicitud', () => {
  it('rejects an invalid user id before querying Supabase', async () => {
    const { service, supabase } = createService();

    const result = await service.createSolicitud('usuario-invalido', validForm);

    expect(result.data).toBeNull();
    expect(result.error).toBe('usuarioId debe ser un UUID valido.');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it.each([
    ['zero quantity', { cantidad: 0 }],
    ['negative quantity', { cantidad: -1 }],
  ])('rejects %s before inserting', async (_label, overrides) => {
    const { service, supabase } = createService();

    const result = await service.createSolicitud(USER_ID, {
      ...validForm,
      ...overrides,
    });

    expect(result.data).toBeNull();
    expect(result.error).toBeTypeOf('string');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('rejects comments over the maximum length before inserting', async () => {
    const { service, supabase } = createService();

    const result = await service.createSolicitud(USER_ID, {
      ...validForm,
      comentarios: 'a'.repeat(501),
    });

    expect(result.data).toBeNull();
    expect(result.error).toBe('comentarios no debe superar 500 caracteres.');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('inserts a normalized valid request', async () => {
    const createdSolicitud = { id: SOLICITUD_ID, estado: 'pendiente' };
    const { service, query } = createService(createInsertQuery(createdSolicitud));

    const result = await service.createSolicitud(USER_ID, validForm);

    expect(result).toEqual({ data: createdSolicitud, error: null });
    expect(query.insert).toHaveBeenCalledWith({
      usuario_id: USER_ID,
      tipo_alimento: 'Arroz',
      cantidad: 5,
      unidad_id: 1,
      comentarios: 'Entregar en la mañana',
      latitud: -2.19,
      longitud: -79.88,
    });
  });

  it('returns the persistence error without hiding it', async () => {
    const persistenceError = { message: 'insert failed', code: '23505' };
    const { service } = createService(createInsertQuery(null, persistenceError));

    const result = await service.createSolicitud(USER_ID, validForm);

    expect(result).toEqual({ data: null, error: persistenceError });
  });
});
