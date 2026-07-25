import { describe, expect, it } from 'vitest';
import type { ConversionData } from '@/lib/unidadConversion';
import { getUnitCompatibilityMessage } from './useInventoryStock';

const stockInBoxes = {
  producto_encontrado: true,
  unidad_id: 3,
  unidad_simbolo: 'caja',
};

const liquidConversions: ConversionData[] = [{
  unidad_origen_id: 1,
  unidad_destino_id: 2,
  unidad_origen: 'Litro',
  simbolo_origen: 'L',
  unidad_destino: 'Mililitro',
  simbolo_destino: 'ml',
  factor_conversion: 1000,
  activo: true,
}];

describe('getUnitCompatibilityMessage', () => {
  it('does not warn when the requested unit matches stock', () => {
    expect(getUnitCompatibilityMessage(stockInBoxes, [], 'CAJA')).toBeNull();
  });

  it('explains when stock cannot be converted to the requested unit', () => {
    expect(getUnitCompatibilityMessage(stockInBoxes, liquidConversions, 'L'))
      .toBe('No existe una conversión registrada de L a caja. Selecciona caja o una unidad equivalente.');
  });
});
