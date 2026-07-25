import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  calcularTotalPorUnidades,
  createInventoryStockService,
} from './inventoryStockService';

const conversiones = [{
  unidad_origen_id: 1,
  unidad_destino_id: 2,
  unidad_origen: 'Kilogramo',
  simbolo_origen: 'kg',
  unidad_destino: 'Gramo',
  simbolo_destino: 'g',
  factor_conversion: 1000,
  activo: true,
}];

describe('calcularTotalPorUnidades', () => {
  it('returns a non-calculable result when the first balance has no unit', () => {
    expect(calcularTotalPorUnidades([
      { cantidad_disponible: 10, unidad_simbolo: undefined },
    ], conversiones)).toEqual({ calculable: false, cantidad: 0 });
  });

  it('no suma saldos de unidades comerciales no equivalentes', () => {
    expect(calcularTotalPorUnidades([
      { cantidad_disponible: 10, unidad_id: 13, unidad_simbolo: 'caja' },
      { cantidad_disponible: 20, unidad_id: 12, unidad_simbolo: 'lata' },
    ], conversiones)).toEqual({ calculable: false, cantidad: 0 });
  });

  it('suma saldos cuando existe una unidad común explícita', () => {
    expect(calcularTotalPorUnidades([
      { cantidad_disponible: 2, unidad_id: 1, unidad_simbolo: 'kg' },
      { cantidad_disponible: 500, unidad_id: 2, unidad_simbolo: 'g' },
    ], conversiones)).toEqual({ calculable: true, cantidad: 2.5 });
  });

  it('does not calculate a total when a later balance has no unit', () => {
    expect(calcularTotalPorUnidades([
      { cantidad_disponible: 2, unidad_id: 1, unidad_simbolo: 'kg' },
      { cantidad_disponible: 500, unidad_simbolo: 'g' },
    ], conversiones)).toEqual({ calculable: false, cantidad: 0 });
  });
});

describe('createInventoryStockService', () => {
  const createQuery = (result: { data: unknown; error: unknown }, finalMethod: 'eq' | 'order') => {
    const query = {
      select: vi.fn(),
      ilike: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    };

    query.select.mockReturnValue(query);
    query.ilike.mockReturnValue(query);
    query.eq.mockImplementation(() => finalMethod === 'eq' ? Promise.resolve(result) : query);
    query.order.mockImplementation(() => finalMethod === 'order' ? Promise.resolve(result) : query);
    return query;
  };

  const createSupabase = (options: {
    conversionRows?: unknown[] | null;
    conversionError?: unknown;
    inventoryRows?: unknown[] | null;
    inventoryError?: unknown;
  } = {}) => {
    const conversionQuery = createQuery({
      data: options.conversionRows ?? [],
      error: options.conversionError ?? null,
    }, 'eq');
    const inventoryQuery = createQuery({
      data: options.inventoryRows ?? [],
      error: options.inventoryError ?? null,
    }, 'order');
    const from = vi.fn((table: string) =>
      table === 'conversiones' ? conversionQuery : inventoryQuery
    );

    return {
      supabase: { from } as unknown as SupabaseClient,
      conversionQuery,
      inventoryQuery,
    };
  };

  const stockRow = (overrides: Record<string, unknown> = {}) => ({
    id_entrada: 'entrada-1',
    id_deposito: 'deposito-1',
    unidad_id: 1,
    cantidad_disponible: 10,
    fecha_ingreso: '2026-07-20T00:00:00.000Z',
    productos_donados: {
      id_producto: 'producto-1',
      nombre_producto: 'Arroz',
      unidad_id: 1,
      unidades: { id: 1, nombre: 'Kilogramo', simbolo: 'kg' },
    },
    depositos: { nombre: 'Bodega principal' },
    ...overrides,
  });

  it('returns an empty summary for blank product names and rejects oversized names', async () => {
    const { supabase } = createSupabase();
    const service = createInventoryStockService(supabase);

    await expect(service.getStockByProductName('   ')).resolves.toMatchObject({
      success: true,
      data: { producto_encontrado: false, estado_stock: 'sin_stock' },
    });
    await expect(service.getStockByProductName('x'.repeat(151))).resolves.toMatchObject({
      success: false,
    });
  });

  it('returns an empty summary when no rows match the product', async () => {
    const { supabase } = createSupabase({ inventoryRows: null });

    await expect(createInventoryStockService(supabase).getStockByProductName('Arroz'))
      .resolves.toMatchObject({
        success: true,
        data: { producto_encontrado: false, depositos: [] },
      });
  });

  it('aggregates rows by warehouse and unit while retaining the newest date', async () => {
    const { supabase } = createSupabase({
      conversionRows: [{
        unidad_origen_id: 1,
        unidad_destino_id: 2,
        factor_conversion: '1000',
        activo: true,
        unidad_origen: [{ id: 1, nombre: 'Kilogramo', simbolo: 'kg' }],
        unidad_destino: { id: 2, nombre: 'Gramo', simbolo: 'g' },
      }, {
        unidad_origen_id: 4,
        unidad_destino_id: 5,
        factor_conversion: 0,
        activo: true,
        unidad_origen: { id: 4, nombre: 'Caja', simbolo: 'caja' },
        unidad_destino: { id: 5, nombre: 'Paquete', simbolo: 'paq' },
      }],
      inventoryRows: [
        stockRow(),
        stockRow({
          id_entrada: 'entrada-2',
          cantidad_disponible: 2.5,
          fecha_ingreso: '2026-07-21T00:00:00.000Z',
        }),
        stockRow({
          id_entrada: 'entrada-3',
          id_deposito: 'deposito-2',
          cantidad_disponible: 1,
          depositos: [{ name: 'ignored' }],
        }),
        stockRow({ id_entrada: 'zero', cantidad_disponible: 0 }),
        stockRow({ id_entrada: 'invalid', cantidad_disponible: 'not-a-number' }),
      ],
    });

    const result = await createInventoryStockService(supabase).getStockByProductName(' Arroz ');

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      producto_encontrado: true,
      total_calculable: true,
      total_disponible: 13.5,
      estado_stock: 'disponible',
    });
    expect(result.data?.depositos).toHaveLength(2);
    expect(result.data?.depositos[0]).toMatchObject({
      cantidad_disponible: 12.5,
      fecha_actualizacion: '2026-07-21T00:00:00.000Z',
    });
    expect(result.data?.total_formateado?.cantidad).toBe(13.5);
    expect(inventoryQueryCalledWith(supabase, 'productos_donados.nombre_producto')).toBe(true);
  });

  it('marks a product as found but not calculable when units are incompatible', async () => {
    const { supabase } = createSupabase({
      inventoryRows: [
        stockRow(),
        stockRow({
          id_entrada: 'entrada-2',
          id_deposito: 'deposito-2',
          unidad_id: 99,
          productos_donados: {
            id_producto: 'producto-2',
            nombre_producto: 'Arroz',
            unidad_id: 99,
            unidades: { id: 99, nombre: 'Caja', simbolo: 'caja' },
          },
        }),
      ],
    });

    const result = await createInventoryStockService(supabase).getStockByProductName('Arroz');

    expect(result).toMatchObject({
      success: true,
      data: {
        producto_encontrado: true,
        total_calculable: false,
        total_disponible: 0,
        estado_stock: 'unidades_no_convertibles',
      },
    });
    expect(result.data?.total_formateado).toBeUndefined();
  });

  it('keeps same-unit stock calculable when conversion lookup fails', async () => {
    const { supabase } = createSupabase({
      conversionRows: null,
      conversionError: { message: 'conversion table unavailable' },
      inventoryRows: [stockRow()],
    });

    const result = await createInventoryStockService(supabase).getStockByProductName('Arroz');

    expect(result).toMatchObject({
      success: true,
      data: { total_calculable: true, total_disponible: 10 },
    });
  });

  it('returns a safe error when the inventory query fails', async () => {
    const conversionQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const inventoryQuery = {
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'database unavailable' },
      }),
    };
    const supabase = {
      from: vi.fn()
        .mockReturnValueOnce(conversionQuery)
        .mockReturnValueOnce(inventoryQuery),
    } as unknown as SupabaseClient;

    const result = await createInventoryStockService(supabase).getStockByProductName('Arroz');

    expect(result).toEqual({
      success: false,
      error: 'No fue posible consultar el inventario',
    });
  });

  it('validates requested quantities before querying stock', async () => {
    const { supabase } = createSupabase();
    const service = createInventoryStockService(supabase);

    await expect(service.checkStockSufficiency('Arroz', 0)).resolves.toMatchObject({
      success: false,
      error: 'cantidadSolicitada debe ser mayor a 0.',
    });
    await expect(service.checkStockSufficiency('Arroz', Number.NaN)).resolves.toMatchObject({
      success: false,
    });
  });

  it('reports sufficient and missing stock using the resolved total', async () => {
    const { supabase } = createSupabase({ inventoryRows: [stockRow()] });
    const service = createInventoryStockService(supabase);

    await expect(service.checkStockSufficiency('Arroz', 4)).resolves.toEqual({
      success: true,
      data: { sufficient: true, available: 10, missing: 0 },
    });

    const secondClient = createSupabase({ inventoryRows: [stockRow()] });
    await expect(createInventoryStockService(secondClient.supabase).checkStockSufficiency('Arroz', 14))
      .resolves.toEqual({
        success: true,
        data: { sufficient: false, available: 10, missing: 4 },
      });
  });

  it('converts requested units and rejects unknown or incompatible units', async () => {
    const options = {
      conversionRows: [{
        unidad_origen_id: 2,
        unidad_destino_id: 1,
        factor_conversion: 0.001,
        activo: true,
        unidad_origen: { id: 2, nombre: 'Gramo', simbolo: 'g' },
        unidad_destino: { id: 1, nombre: 'Kilogramo', simbolo: 'kg' },
      }],
      inventoryRows: [stockRow()],
    };
    const service = createInventoryStockService(createSupabase(options).supabase);

    await expect(service.checkStockSufficiencyWithConversion('Arroz', 500, 'g'))
      .resolves.toMatchObject({
        success: true,
        data: {
          sufficient: true,
          available: 10,
          requestedInBaseUnit: 0.5,
          missing: 0,
        },
      });

    const unknownUnit = createSupabase(options);
    await expect(createInventoryStockService(unknownUnit.supabase)
      .checkStockSufficiencyWithConversion('Arroz', 1, 'litro'))
      .resolves.toMatchObject({
        success: false,
        error: 'No se puede resolver la unidad litro',
      });
  });

  it('returns a conversion error for a known but incompatible unit', async () => {
    const service = createInventoryStockService(createSupabase({
      conversionRows: [{
        unidad_origen_id: 3,
        unidad_destino_id: 4,
        factor_conversion: 2,
        activo: true,
        unidad_origen: { id: 3, nombre: 'Litro', simbolo: 'l' },
        unidad_destino: { id: 4, nombre: 'Mililitro', simbolo: 'ml' },
      }],
      inventoryRows: [stockRow()],
    }).supabase);

    await expect(service.checkStockSufficiencyWithConversion('Arroz', 1, 'l'))
      .resolves.toMatchObject({
        success: false,
        error: 'No se puede convertir de l a kg',
      });
  });
});

const inventoryQueryCalledWith = (supabase: SupabaseClient, field: string): boolean => {
  const from = (supabase.from as unknown as ReturnType<typeof vi.fn>);
  const inventoryQuery = from.mock.results[1]?.value as { ilike?: ReturnType<typeof vi.fn> } | undefined;
  return inventoryQuery?.ilike?.mock.calls.some((call: unknown[]) => call[0] === field) ?? false;
};
