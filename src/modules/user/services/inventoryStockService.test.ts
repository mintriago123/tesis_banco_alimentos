import { describe, expect, it } from 'vitest';
import { calcularTotalPorUnidades } from './inventoryStockService';

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
});
