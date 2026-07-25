import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AlimentoSelector } from './AlimentoSelector';

describe('AlimentoSelector', () => {
  it('asocia la ayuda de categoría al select real', () => {
    render(
      <AlimentoSelector
        alimentos={[]}
        alimentosFiltrados={[]}
        alimentoSeleccionado={null}
        busqueda=""
        filtroCategoria=""
        categorias={['Granos']}
        mostrarDropdown={false}
        onBusquedaChange={vi.fn()}
        onCategoriaChange={vi.fn()}
        onAlimentoSelect={vi.fn()}
        onLimpiarSeleccion={vi.fn()}
        onFocus={vi.fn()}
        onBlur={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: /categoría de alimentos/i }))
      .toHaveAttribute('aria-describedby', 'filtroCategoria-hint');
  });
});
