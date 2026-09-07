import { describe, expect, it, vi } from 'vitest';
import {
  applyMovementFilters,
  buildMovementSummary,
} from '@/modules/admin/reportes/movimientos/utils/formatters';
import type { MovementItem } from '@/modules/admin/reportes/movimientos/types';
import { formatDateInUserTimezone, formatShortDate } from '@/lib/dateUtils';

const movements: MovementItem[] = [
  {
    id: 'entrada-1',
    fecha_movimiento: '2026-08-05T04:30:00.000Z',
    tipo_movimiento: 'ingreso',
    nombre_producto: 'Arroz',
    unidad_medida: 'kg',
    cantidad: 10,
    usuario_responsable: 'Operador',
    rol_usuario: 'ADMINISTRADOR',
    origen_movimiento: 'Donación',
    observaciones: '',
  },
  {
    id: 'egreso-1',
    fecha_movimiento: '2026-08-05T15:00:00.000Z',
    tipo_movimiento: 'egreso',
    nombre_producto: 'Arroz',
    unidad_medida: 'kg',
    cantidad: 4,
    usuario_responsable: 'Operador',
    rol_usuario: 'ADMINISTRADOR',
    origen_movimiento: 'Solicitud',
    observaciones: '',
  },
];

describe('UX-P2-001 report filters and Ecuador timezone', () => {
  it('keeps date-only values stable and converts UTC timestamps to America/Guayaquil', () => {
    const timezone = vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({
        locale: 'es-EC',
        calendar: 'gregory',
        numberingSystem: 'latn',
        timeZone: 'America/Guayaquil',
      });

    try {
      expect(formatShortDate('2026-08-05')).toBe('05/08/2026');
      expect(formatDateInUserTimezone('2026-08-05T04:30:00.000Z', 'yyyy-MM-dd HH:mm'))
        .toBe('2026-08-04 23:30');
    } finally {
      timezone.mockRestore();
    }
  });

  it('filters exact movement types and reconciles report totals', () => {
    const filtered = applyMovementFilters(movements, {
      fecha_inicio: '2026-08-05',
      fecha_fin: '2026-08-05',
      tipo_movimiento: 'egreso',
      producto: 'arroz',
    });

    expect(filtered.map(({ id }) => id)).toEqual(['egreso-1']);
    expect(buildMovementSummary(movements)).toMatchObject({
      totalRecords: 2,
      totalIngresosQuantity: 10,
      totalEgresosQuantity: 4,
      balanceQuantity: 6,
      uniqueProducts: 1,
    });
  });
});
