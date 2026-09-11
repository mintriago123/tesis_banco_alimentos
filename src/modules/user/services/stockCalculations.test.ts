import { describe, expect, it } from 'vitest';
import type { ConversionData } from '@/lib/unidadConversion';
import { getUnitCompatibilityMessage } from './stockCalculations';

const stockInBoxes = {
  producto_encontrado: true,
  unidad_id: 3,
  unidad_simbolo: 'caja',
  unidad_nombre: 'Caja',
  total_disponible: 10,
  depositos: [],
  unidades_disponibles: [{
    unidad_id: 3,
    unidad_nombre: 'Caja',
    unidad_simbolo: 'caja',
    cantidad_disponible: 10,
    cantidad_formateada: {
      cantidad: 10,
      simbolo: 'caja',
      unidad_nombre: 'Caja',
      cantidad_original: 10,
      simbolo_original: 'caja',
      fue_convertido: false,
    },
    depositos: [],
  }],
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
      .toBe('No existe una conversión registrada de L a las unidades disponibles (caja).');
  });
});
