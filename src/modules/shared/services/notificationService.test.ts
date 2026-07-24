import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { NotificationService } from './notificationService';

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(),
}));

const createSupabaseMock = () => {
  const insert = vi.fn((record) => ({
    select: vi.fn(() => ({
      single: vi.fn(async () => ({
        data: {
          id: 'notification-1',
          fecha_creacion: '2026-07-19T00:00:00.000Z',
          ...record,
        },
        error: null,
      })),
    })),
  }));

  const from = vi.fn((table: string) => {
    if (table !== 'notificaciones') {
      throw new Error(`Unexpected table: ${table}`);
    }

    return { insert };
  });

  return {
    insert,
    supabase: { from } as unknown as SupabaseClient,
  };
};

describe('NotificationService', () => {
  it('stores safe action URLs', async () => {
    const { insert, supabase } = createSupabaseMock();
    const service = new NotificationService(supabase);

    await service.createNotification({
      titulo: 'Titulo',
      mensaje: 'Mensaje',
      urlAccion: '/admin/dashboard',
      enviarEmail: false,
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      url_accion: '/admin/dashboard',
    }));
    expect(insert.mock.calls[0]?.[0]).not.toHaveProperty('leida');
    expect(insert.mock.calls[0]?.[0]).not.toHaveProperty('fecha_leida');
    expect(insert.mock.calls[0]?.[0]).not.toHaveProperty('activa');
  });

  it('converts unsafe action URLs to null', async () => {
    const { insert, supabase } = createSupabaseMock();
    const service = new NotificationService(supabase);

    await service.createNotification({
      titulo: 'Titulo',
      mensaje: 'Mensaje',
      urlAccion: 'https://evil.com',
      enviarEmail: false,
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      url_accion: null,
    }));
  });
});
