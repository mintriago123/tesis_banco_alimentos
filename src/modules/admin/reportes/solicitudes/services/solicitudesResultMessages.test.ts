import { describe, expect, it } from 'vitest';
import { buildInventoryDiscountError } from './solicitudesResultMessages';

describe('buildInventoryDiscountError', () => {
  it('explica cuando la unidad no admite cantidades decimales', () => {
    expect(buildInventoryDiscountError(
      { message: 'La unidad Caja no permite cantidades decimales' },
      'No fue posible descontar el inventario',
    )).toBe(
      'La unidad Caja no permite cantidades decimales. Ingresa una cantidad entera (por ejemplo, 1 caja).',
    );
  });
});
