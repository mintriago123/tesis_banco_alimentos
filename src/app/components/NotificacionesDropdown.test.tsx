import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NotificacionesDropdown from './NotificacionesDropdown';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  useNotificaciones: vi.fn(),
  marcarComoLeida: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@/app/components/SupabaseProvider', () => ({
  useSupabase: () => ({ supabase: {}, user: { id: 'user-1' } }),
}));

vi.mock('@/modules/shared', () => ({
  useNotificaciones: mocks.useNotificaciones,
}));

const createNotification = (overrides: Record<string, unknown>) => ({
  id: 'notification-1',
  titulo: 'Notificacion',
  mensaje: 'Mensaje',
  tipo: 'info',
  categoria: 'sistema',
  metadatos: {},
  fecha_creacion: '2026-07-19T00:00:00.000Z',
  leida: false,
  url_accion: null,
  ...overrides,
});

const mockNotifications = (notificaciones: ReturnType<typeof createNotification>[]) => {
  mocks.useNotificaciones.mockReturnValue({
    notificaciones,
    loading: false,
    conteoNoLeidas: notificaciones.filter((notificacion) => !notificacion.leida).length,
    marcarComoLeida: mocks.marcarComoLeida,
    marcarTodasComoLeidas: vi.fn(),
    eliminarNotificacion: vi.fn(),
  });
};

beforeEach(() => {
  mocks.push.mockReset();
  mocks.useNotificaciones.mockReset();
  mocks.marcarComoLeida.mockReset();
  mocks.marcarComoLeida.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
});

describe('NotificacionesDropdown', () => {
  it('navigates from the dropdown when the action URL is safe', async () => {
    mockNotifications([
      createNotification({
        titulo: 'Ruta segura',
        url_accion: '/user/solicitudes',
      }),
    ]);

    render(<NotificacionesDropdown />);
    await userEvent.click(screen.getByRole('button', { name: 'Notificaciones' }));
    await userEvent.click(screen.getByText('Ruta segura'));

    await waitFor(() => {
      expect(mocks.marcarComoLeida).toHaveBeenCalledWith('notification-1');
      expect(mocks.push).toHaveBeenCalledWith('/user/solicitudes');
    });
  });

  it('marks unsafe dropdown notification URLs as read without navigating', async () => {
    mockNotifications([
      createNotification({
        titulo: 'Ruta insegura',
        url_accion: '//evil.com',
      }),
    ]);

    render(<NotificacionesDropdown />);
    await userEvent.click(screen.getByRole('button', { name: 'Notificaciones' }));
    await userEvent.click(screen.getByText('Ruta insegura'));

    await waitFor(() => {
      expect(mocks.marcarComoLeida).toHaveBeenCalledWith('notification-1');
    });
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
