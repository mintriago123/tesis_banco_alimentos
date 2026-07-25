import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { DataTable } from './DataTable';
import { FormField, TextInput } from './FormField';
import { Modal } from './Modal';
import { RoleBadge, StatusBadge } from './RoleBadge';

afterEach(() => cleanup());

describe('componentes visuales compartidos', () => {
  it('expone variantes de botón y estado de carga accesibles', () => {
    render(
      <Button accent="operador" variant="primary" loading>
        Guardar
      </Button>,
    );

    expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled();
    expect(screen.getByRole('button')).toHaveClass('bg-orange-700');
  });

  it('asocia el campo con su etiqueta y error', () => {
    render(
      <FormField id="correo" label="Correo electrónico" required error="El correo no es válido">
        <TextInput id="correo" type="email" aria-describedby="correo-error" />
      </FormField>,
    );

    expect(screen.getByLabelText(/correo electrónico/i)).toHaveAttribute('id', 'correo');
    expect(screen.getByRole('alert')).toHaveTextContent('El correo no es válido');
  });

  it('cierra el modal con Escape y devuelve el foco al control de origen', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const view = render(<button type="button">Abrir</button>);
    const trigger = screen.getByRole('button', { name: 'Abrir' });
    trigger.focus();
    view.rerender(
      <>
        <button type="button">Abrir</button>
        <Modal open title="Confirmar acción" onClose={onClose}>
          <button type="button">Confirmar</button>
        </Modal>
      </>,
    );
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledOnce();
    view.rerender(<button type="button">Abrir</button>);
    expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus();
  });

  it('distingue la identidad de rol de los estados semánticos', () => {
    render(
      <>
        <RoleBadge role="donante" />
        <StatusBadge status="error">Rechazada</StatusBadge>
      </>,
    );

    expect(screen.getByText('Donante')).toHaveClass('text-emerald-800');
    expect(screen.getByText('Rechazada')).toHaveClass('text-rose-800');
  });

  it('aplica la superficie y el scroll compartidos a las tablas', () => {
    render(
      <DataTable caption="Usuarios registrados">
        <thead className="table-head">
          <tr>
            <th scope="col">Usuario</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody className="table-body">
          <tr>
            <td>Ana</td>
            <td>Activo</td>
          </tr>
        </tbody>
      </DataTable>,
    );

    const table = screen.getByRole('table', { name: 'Usuarios registrados' });

    expect(table).toHaveClass('table-base');
    expect(table.parentElement).toHaveClass('table-scroll');
    expect(table.parentElement?.parentElement).toHaveClass('table-surface');
    expect(screen.getByRole('columnheader', { name: 'Usuario' })).toBeInTheDocument();
  });
});
