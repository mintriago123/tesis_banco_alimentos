import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { NotificationDispatchError } from '@/modules/shared/services/notificationEventDispatcher';

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createAdminSupabaseClient: vi.fn(),
  serverGetUser: vi.fn(),
  adminFrom: vi.fn(),
  adminFromQueue: [] as unknown[],
  buildNotificationForEvent: vi.fn(),
  createNotification: vi.fn(),
  NotificationService: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: mocks.createAdminSupabaseClient,
}));

vi.mock('@/modules/shared/services/notificationEventDispatcher', async () => {
  const actual = await vi.importActual<typeof import('@/modules/shared/services/notificationEventDispatcher')>(
    '@/modules/shared/services/notificationEventDispatcher'
  );

  return {
    ...actual,
    buildNotificationForEvent: mocks.buildNotificationForEvent,
  };
});

vi.mock('@/modules/shared/services/notificationService', () => ({
  NotificationService: mocks.NotificationService,
}));

const jsonRequest = (body: unknown) =>
  new Request('http://localhost/api/notificaciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const createProfileQuery = (profile: unknown) => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({
        data: profile,
        error: null,
      })),
    })),
  })),
});

const enqueueProfile = (overrides: Record<string, unknown> = {}) => {
  mocks.adminFromQueue.push(createProfileQuery({
    id: 'user-1',
    rol: 'DONANTE',
    estado: 'activo',
    nombre: 'Usuario',
    email: 'usuario@example.com',
    ...overrides,
  }));
};

beforeEach(() => {
  mocks.createServerSupabaseClient.mockReset();
  mocks.createAdminSupabaseClient.mockReset();
  mocks.serverGetUser.mockReset();
  mocks.adminFrom.mockReset();
  mocks.adminFromQueue.length = 0;
  mocks.buildNotificationForEvent.mockReset();
  mocks.createNotification.mockReset();
  mocks.NotificationService.mockReset();

  mocks.serverGetUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'usuario@example.com' } },
    error: null,
  });
  mocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getUser: mocks.serverGetUser },
  });
  mocks.createAdminSupabaseClient.mockReturnValue({
    from: mocks.adminFrom,
  });
  mocks.adminFrom.mockImplementation(() => {
    const query = mocks.adminFromQueue.shift();

    if (!query) {
      throw new Error('Unexpected admin query');
    }

    return query;
  });
  mocks.NotificationService.mockImplementation(function MockNotificationService() {
    return {
      createNotification: mocks.createNotification,
    };
  });
  mocks.buildNotificationForEvent.mockResolvedValue({
    titulo: 'Notificacion segura',
    mensaje: 'Mensaje seguro',
    destinatarioId: 'destinatario-1',
  });
  mocks.createNotification.mockResolvedValue({
    id: 'notification-1',
    titulo: 'Notificacion segura',
  });
});

describe('/api/notificaciones', () => {
  it('returns 401 without an authenticated session', async () => {
    mocks.serverGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const response = await POST(jsonRequest({
      event: 'catalog_food_request_created',
      entityId: 'request-1',
    }));

    expect(response.status).toBe(401);
    expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
    expect(mocks.buildNotificationForEvent).not.toHaveBeenCalled();
  });

  it('returns 403 for inactive users', async () => {
    enqueueProfile({ estado: 'bloqueado' });

    const response = await POST(jsonRequest({
      event: 'catalog_food_request_created',
      entityId: 'request-1',
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Usuario inactivo o bloqueado.' });
    expect(mocks.buildNotificationForEvent).not.toHaveBeenCalled();
  });

  it('rejects sensitive notification fields from the client', async () => {
    enqueueProfile();

    const response = await POST(jsonRequest({
      event: 'catalog_food_request_created',
      entityId: 'request-1',
      titulo: 'Titulo elegido por cliente',
      destinatarioId: 'otro-usuario',
      email: { html: '<p>HTML arbitrario</p>' },
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Campos no permitidos: titulo, destinatarioId, email.',
    });
    expect(mocks.buildNotificationForEvent).not.toHaveBeenCalled();
    expect(mocks.NotificationService).not.toHaveBeenCalled();
  });

  it('dispatches a valid event and creates the server-built notification', async () => {
    enqueueProfile({ rol: 'ADMINISTRADOR' });

    const response = await POST(jsonRequest({
      event: 'catalog_food_request_reviewed',
      entityId: 'request-1',
    }));

    expect(response.status).toBe(200);
    expect(mocks.buildNotificationForEvent).toHaveBeenCalledWith(
      expect.objectContaining({ from: mocks.adminFrom }),
      expect.objectContaining({
        id: 'user-1',
        rol: 'ADMINISTRADOR',
        estado: 'activo',
      }),
      {
        event: 'catalog_food_request_reviewed',
        entityId: 'request-1',
      }
    );
    expect(mocks.createNotification).toHaveBeenCalledWith({
      titulo: 'Notificacion segura',
      mensaje: 'Mensaje seguro',
      destinatarioId: 'destinatario-1',
    });
  });

  it('maps dispatcher authorization errors to the response status', async () => {
    enqueueProfile({ rol: 'DONANTE' });
    mocks.buildNotificationForEvent.mockRejectedValue(
      new NotificationDispatchError(403, 'Rol no permitido para este evento.')
    );

    const response = await POST(jsonRequest({
      event: 'donation_status_changed',
      entityId: '10',
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Rol no permitido para este evento.',
    });
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });
});
