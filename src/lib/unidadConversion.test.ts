import { describe, expect, it } from 'vitest';
import {
  aplicarConversion,
  convertirEntreUnidades,
  resolverConversionLocal,
  validarCantidadParaUnidad,
} from './unidadConversion';

const conversiones = [
  {
    unidad_origen_id: 1,
    unidad_destino_id: 2,
    unidad_origen: 'Kilogramo',
    simbolo_origen: 'kg',
    unidad_destino: 'Gramo',
    simbolo_destino: 'g',
    factor_conversion: 1000,
    activo: true,
  },
  {
    unidad_origen_id: 10,
    unidad_destino_id: 11,
    unidad_origen: 'Unidad',
    simbolo_origen: 'ud',
    unidad_destino: 'Docena',
    simbolo_destino: 'doc',
    factor_conversion: 1 / 12,
    activo: true,
  },
];

describe('resolverConversionLocal', () => {
  it('resuelve la misma unidad con factor uno', () => {
    expect(resolverConversionLocal(1, 1, conversiones)).toMatchObject({
      convertible: true,
      factor: 1,
      source: 'same_unit',
    });
  });

  it('resuelve una conversión directa e inversa', () => {
    expect(resolverConversionLocal(1, 2, conversiones)).toMatchObject({
      convertible: true,
      factor: 1000,
      source: 'database',
    });
    expect(resolverConversionLocal(2, 1, conversiones)).toMatchObject({
      convertible: true,
      factor: 0.001,
      source: 'database',
    });
  });

  it('no infiere equivalencia cuando no existe un factor explícito', () => {
    expect(resolverConversionLocal(11, 10, conversiones)).toMatchObject({
      convertible: true,
      factor: 12,
    });
    expect(resolverConversionLocal(10, 12, conversiones)).toEqual({
      convertible: false,
      reason: 'no_conversion',
    });
  });

  it('rechaza cantidades no finitas y unidades discretas fraccionadas', () => {
    expect(aplicarConversion(Number.NaN, resolverConversionLocal(1, 2, conversiones))).toEqual({
      success: false,
      reason: 'invalid_quantity',
    });
    expect(validarCantidadParaUnidad(1.5, {
      nombre: 'Caja',
      es_discreta: true,
      permite_fraccion: false,
    })).toEqual({
      valid: false,
      error: 'La unidad Caja no permite cantidades decimales.',
    });
  });

  it('mantiene una conversión explícita para la previsualización', () => {
    expect(convertirEntreUnidades(2, 'kg', 'g', conversiones)).toMatchObject({
      success: true,
      cantidad: 2000,
    });
  });

  it('no usa IDs implícitos cuando los símbolos no están en el catálogo', () => {
    expect(convertirEntreUnidades(3, 'caja', 'lata', conversiones)).toEqual({
      success: false,
      reason: 'no_conversion',
    });
  });
});
