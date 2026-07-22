import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DonacionesTable } from './DonacionesTable';
import type { Donacion } from '../types';

const cancelledDonation: Donacion = {
  id: 10,
  user_id: '11111111-1111-4111-8111-111111111111',
  nombre_donante: 'Donante de prueba',
  telefono: '0999999999',
  email: 'donante@example.com',
  tipo_producto: 'Arroz',
  categoria_comida: 'Granos',
  es_producto_personalizado: false,
  cantidad: 10,
  unidad_id: 1,
  unidad_nombre: 'Kilogramo',
  unidad_simbolo: 'kg',
  fecha_disponible: '2026-07-21',
  direccion_entrega: 'Dirección de prueba',
  estado: 'Cancelada',
  creado_en: '2026-07-20T00:00:00.000Z',
  actualizado_en: '2026-07-21T00:00:00.000Z',
  motivo_cancelacion: 'solicitud_donante',
  observaciones_cancelacion: 'Ya no está disponible',
  fecha_cancelacion: '2026-07-21T00:00:00.000Z',
};

describe('DonacionesTable', () => {
  it('mantiene visible una donación cancelada y deshabilita acciones de mutación', () => {
    render(
      <DonacionesTable
        donaciones={[cancelledDonation]}
        onVerDetalle={vi.fn()}
        onEditar={vi.fn()}
        onCancelar={vi.fn()}
      />,
    );

    expect(screen.getByText('Cancelada')).toBeInTheDocument();
    expect(screen.getByText('Arroz')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancelar donación/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar donación/i })).not.toBeInTheDocument();
  });
});
