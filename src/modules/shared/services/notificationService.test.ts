import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendEmail } from '@/lib/email';
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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendEmail).mockResolvedValue(undefined);
  });

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

  const createRecipientSupabase = (options: {
    notificationError?: { message: string } | null;
    usuario?: unknown;
    usuarioError?: { message: string } | null;
    usuariosPorRol?: unknown[] | null;
    usuariosPorRolError?: { message: string } | null;
    preferencias?: unknown[] | null;
    preferenciasError?: { message: string } | null;
  } = {}) => {
    const notification = {
      id: 'notification-2',
      titulo: 'Estado actualizado',
      mensaje: 'La operación cambió de estado.',
      tipo: 'info' as const,
      categoria: 'solicitudes',
      destinatario_id: null,
      rol_destinatario: null,
      url_accion: '/notificaciones',
      metadatos: {},
      fecha_creacion: '2026-07-19T00:00:00.000Z',
      expira_en: null,
    };
    const insert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: notification,
          error: options.notificationError ?? null,
        })),
      })),
    }));
    const userQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(async () => ({
        data: options.usuario ?? null,
        error: options.usuarioError ?? null,
      })),
    };
    const roleQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    roleQuery.eq.mockResolvedValue({
      data: options.usuariosPorRol ?? [],
      error: options.usuariosPorRolError ?? null,
    });
    const preferencesQuery = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn(async () => ({
        data: options.preferencias ?? [],
        error: options.preferenciasError ?? null,
      })),
    };
    const from = vi.fn((table: string) => {
      if (table === 'notificaciones') return { insert };
      if (table === 'usuarios') {
        return options.usuariosPorRol !== undefined || options.usuariosPorRolError
          ? roleQuery
          : userQuery;
      }
      if (table === 'configuracion_notificaciones') return preferencesQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    return {
      supabase: { from } as unknown as SupabaseClient,
      insert,
      userQuery,
      roleQuery,
      preferencesQuery,
    };
  };

  const RECIPIENT_ID = '11111111-1111-4111-8111-111111111111';
  const SECOND_RECIPIENT_ID = '22222222-2222-4222-8222-222222222222';

  it('throws when notification persistence fails', async () => {
    const { supabase } = createRecipientSupabase({
      notificationError: { message: 'insert failed' },
    });

    await expect(new NotificationService(supabase).createNotification({
      titulo: 'Titulo',
      mensaje: 'Mensaje',
      enviarEmail: false,
    })).rejects.toThrow('insert failed');
  });

  it('resolves a recipient by id and sends its notification email', async () => {
    const { supabase, preferencesQuery } = createRecipientSupabase({
      usuario: {
        id: RECIPIENT_ID,
        email: 'recipient@example.com',
        nombre: 'Destinatario',
        estado: 'activo',
        recibir_notificaciones: true,
      },
      preferencias: [{ usuario_id: RECIPIENT_ID, email_activo: true }],
    });

    await new NotificationService(supabase).createNotification({
      titulo: 'Titulo',
      mensaje: 'Mensaje',
      destinatarioId: RECIPIENT_ID,
      categoria: 'solicitudes',
    });

    expect(preferencesQuery.in).toHaveBeenCalledWith('usuario_id', [RECIPIENT_ID]);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'recipient@example.com',
    }));
  });

  it('does not email inactive or opted-out recipients', async () => {
    const inactive = createRecipientSupabase({
      usuario: {
        id: RECIPIENT_ID,
        email: 'recipient@example.com',
        estado: 'bloqueado',
        recibir_notificaciones: true,
      },
    });
    await new NotificationService(inactive.supabase).createNotification({
      titulo: 'Titulo', mensaje: 'Mensaje', destinatarioId: RECIPIENT_ID,
    });
    expect(sendEmail).not.toHaveBeenCalled();

    const optedOut = createRecipientSupabase({
      usuario: {
        id: RECIPIENT_ID,
        email: 'recipient@example.com',
        estado: 'activo',
        recibir_notificaciones: false,
      },
    });
    await new NotificationService(optedOut.supabase).createNotification({
      titulo: 'Titulo', mensaje: 'Mensaje', destinatarioId: RECIPIENT_ID,
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('filters role recipients by status and category preferences', async () => {
    const { supabase } = createRecipientSupabase({
      usuariosPorRol: [
        {
          id: RECIPIENT_ID,
          email: 'enabled@example.com',
          nombre: 'Activo',
          estado: 'activo',
          recibir_notificaciones: true,
        },
        {
          id: SECOND_RECIPIENT_ID,
          email: 'disabled@example.com',
          nombre: 'Desactivado',
          estado: 'activo',
          recibir_notificaciones: true,
        },
        {
          id: '33333333-3333-4333-8333-333333333333',
          email: null,
          estado: 'activo',
          recibir_notificaciones: true,
        },
      ],
      preferencias: [{ usuario_id: SECOND_RECIPIENT_ID, email_activo: false }],
    });

    await new NotificationService(supabase).createNotification({
      titulo: 'Titulo',
      mensaje: 'Mensaje',
      rolDestinatario: 'operador',
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'enabled@example.com' }));
  });

  it('supports explicit email recipients and tolerates email failures', async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('SMTP unavailable'));
    const { supabase } = createRecipientSupabase();

    await expect(new NotificationService(supabase).createNotification({
      titulo: 'Titulo',
      mensaje: 'Mensaje',
      email: { to: ['one@example.com', 'two@example.com'] },
    })).resolves.toMatchObject({ id: 'notification-2' });

    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('does not send a message when no recipient is configured', async () => {
    const { supabase } = createRecipientSupabase();

    await new NotificationService(supabase).createNotification({
      titulo: 'Titulo',
      mensaje: 'Mensaje',
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });
});
