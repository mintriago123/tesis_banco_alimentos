import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UserSettingsContent } from './UserSettings';

vi.mock('@/app/components/SupabaseProvider', () => ({
  useSupabase: () => ({
    user: { id: 'user-1' },
    supabase: {
      auth: {
        updateUser: vi.fn(async () => ({ error: null })),
      },
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      })),
    },
  }),
}));

vi.mock('@/app/components', () => ({
  Alert: ({ mensaje }: { mensaje: string }) => <div>{mensaje}</div>,
}));

describe('UserSettingsContent', () => {
  it('renders shared preferences and password sections', () => {
    const { container } = render(<UserSettingsContent variant="donante" />);

    expect(container.firstElementChild).toHaveAttribute('data-settings-variant', 'donante');
    expect(screen.getByRole('heading', { name: /Configuración de Usuario/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Preferencias/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Cambiar Contraseña/i })).toBeInTheDocument();
  });
});
