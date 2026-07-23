import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProductSelector from './ProductSelector';
import StepIndicator from './StepIndicator';

const alimentos = [
  { id: 1, nombre: 'Arroz', categoria: 'Granos' },
  { id: 2, nombre: 'Lentejas', categoria: 'Granos' },
];

describe('componentes accesibles del formulario de donación', () => {
  it('permite seleccionar el producto activo con el teclado', async () => {
    const user = userEvent.setup();
    const onSeleccionarProducto = vi.fn();

    render(
      <ProductSelector
        busqueda=""
        onBusquedaChange={vi.fn()}
        onFocus={vi.fn()}
        alimentoSeleccionado={null}
        onLimpiarSeleccion={vi.fn()}
        mostrarDropdown
        cargando={false}
        alimentosFiltrados={alimentos}
        onSeleccionarProducto={onSeleccionarProducto}
        onCerrarDropdown={vi.fn()}
      />
    );

    const input = screen.getByRole('combobox', { name: /producto a donar/i });
    await user.click(input);
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onSeleccionarProducto).toHaveBeenCalledWith(alimentos[1]);
  });

  it('expone el paso actual y conserva las etiquetas en pantallas pequeñas', () => {
    render(
      <StepIndicator
        currentStep={2}
        totalSteps={3}
        stepLabels={['Producto', 'Logística', 'Confirmación']}
      />
    );

    expect(screen.getByText('Paso 2 de 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Logística, paso actual')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Producto')).toBeInTheDocument();
    expect(screen.getByText('Confirmación')).toBeInTheDocument();
  });
});
