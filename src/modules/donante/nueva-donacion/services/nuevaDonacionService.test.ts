import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { DonacionFormulario } from '../../donaciones/types';
import type { Alimento, ImpactoCalculado, ProductoSeleccionado } from '../types';
import { NuevaDonacionService } from './nuevaDonacionService';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const validForm: DonacionFormulario = {
  id_deposito: '33333333-3333-4333-8333-333333333333',
  tipo_producto: '1',
  cantidad: '10.5',
  unidad_id: '1',
  fecha_vencimiento: '2026-08-01',
  fecha_disponible: '2026-07-25',
  direccion_entrega: 'Dirección de prueba',
  horario_preferido: '08:00-10:00',
  observaciones: '  Entregar en recepción  ',
};

const impact: ImpactoCalculado = {
  personasAlimentadas: 8,
  comidaEquivalente: '16 porciones',
};

const product: ProductoSeleccionado = {
  nombre: 'Arroz blanco',
  categoria: 'Granos',
};

const foods: Alimento[] = [{
  id: 1,
  nombre: 'Arroz',
  categoria: 'Granos',
}];

const createService = (error: unknown = null) => {
  const insert = vi.fn().mockResolvedValue({ error });
  const supabase = {
    from: vi.fn().mockReturnValue({ insert }),
  } as unknown as SupabaseClient;

  return { service: new NuevaDonacionService(supabase), supabase, insert };
};

describe('NuevaDonacionService.crearDonacion', () => {
  it('rejects an invalid user id before inserting', async () => {
    const { service, supabase } = createService();

    await expect(service.crearDonacion(
      validForm,
      impact,
      product,
      { id: 1, nombre: 'Kilogramo', simbolo: 'kg' },
      foods,
      'usuario-invalido',
      null,
    )).rejects.toThrow('userId debe ser un UUID valido.');

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('rejects invalid dates before inserting', async () => {
    const { service, supabase } = createService();

    await expect(service.crearDonacion(
      { ...validForm, fecha_disponible: '2026-02-30' },
      impact,
      product,
      null,
      foods,
      USER_ID,
      null,
    )).rejects.toThrow('fecha_disponible debe ser una fecha ISO valida.');

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('rejects a product not present in the catalog before inserting', async () => {
    const { service, supabase } = createService();

    await expect(service.crearDonacion(
      { ...validForm, tipo_producto: '999' },
      impact,
      product,
      null,
      foods,
      USER_ID,
      null,
    )).rejects.toThrow(
      'Selecciona un alimento existente del catálogo antes de registrar la donación.',
    );

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('inserts a normalized donation with profile and impact data', async () => {
    const { service, insert } = createService();

    await service.crearDonacion(
      validForm,
      impact,
      product,
      { id: 1, nombre: 'Kilogramo', simbolo: 'kg' },
      foods,
      USER_ID,
      {
        nombre: 'Donante de prueba',
        telefono: '0999999999',
        email: 'donante@example.com',
        cedula: '1710034065',
        direccion: 'Dirección de prueba',
        tipo_persona: 'Natural',
      },
    );

    expect(insert).toHaveBeenCalledWith([expect.objectContaining({
      user_id: USER_ID,
      id_deposito: validForm.id_deposito,
      nombre_donante: 'Donante de prueba',
      alimento_id: 1,
      tipo_producto: 'Arroz blanco',
      categoria_comida: 'Granos',
      cantidad: 10.5,
      unidad_id: 1,
      unidad_nombre: 'Kilogramo',
      unidad_simbolo: 'kg',
      fecha_disponible: '2026-07-25',
      fecha_vencimiento: '2026-08-01',
      observaciones: 'Entregar en recepción',
      impacto_estimado_personas: 8,
      impacto_equivalente: '16 porciones',
      estado: 'Pendiente',
    })]);
  });

  it('surfaces the persistence error after a valid request', async () => {
    const { service } = createService({ message: 'database unavailable' });

    await expect(service.crearDonacion(
      validForm,
      impact,
      product,
      null,
      foods,
      USER_ID,
      null,
    )).rejects.toThrow('Error al crear la donación: database unavailable');
  });
});
