import { act, renderHook, waitFor } from '@testing-library/react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { useNotificaciones } from './useNotificaciones';

type RealtimePayload = {
  eventType: string;
  new: unknown;
};

type RealtimeRegistration = {
  config: { filter?: string };
  callback: (payload: RealtimePayload) => void;
};

type RealtimeStatusCallback = (status: string, error?: Error) => void;

type MockChannel = {
  name: string;
  handlers: RealtimeRegistration[];
  statusCallback?: RealtimeStatusCallback;
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
};

const user = { id: 'user-1' } as User;

const createNotification = (overrides: Record<string, unknown> = {}) => ({
  id: 'notification-1',
  titulo: 'Nueva notificacion',
  mensaje: 'Mensaje',
  tipo: 'info' as const,
  categoria: 'general',
  metadatos: {},
  fecha_creacion: '2026-07-19T00:00:00.000Z',
  leida: false,
  ...overrides,
});

const createChannel = (name: string): MockChannel => {
  const channel = {
    name,
    handlers: [],
    on: vi.fn(),
    subscribe: vi.fn(),
  } as MockChannel;

  channel.on.mockImplementation((_event, config, callback) => {
    channel.handlers.push({ config, callback });
    return channel;
  });
  channel.subscribe.mockImplementation((callback?: RealtimeStatusCallback) => {
    channel.statusCallback = callback;
    return channel;
  });

  return channel;
};

const createSupabaseMock = ({
  role = 'ADMINISTRADOR',
  notifications = [],
  subscribeError,
}: {
  role?: string;
  notifications?: ReturnType<typeof createNotification>[];
  subscribeError?: Error;
} = {}) => {
  const channels: MockChannel[] = [];
  const removeChannel = vi.fn();
  const channel = vi.fn((name: string) => {
    const mockChannel = createChannel(name);
    if (subscribeError) {
      mockChannel.subscribe.mockImplementation(() => {
        throw subscribeError;
      });
    }
    channels.push(mockChannel);
    return mockChannel;
  });

  const from = vi.fn((table: string) => {
    if (table === 'usuarios') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { rol: role },
              error: null,
            })),
          })),
        })),
      };
    }

    if (table === 'configuracion_notificaciones') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({
            data: [],
            error: null,
          })),
        })),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  const rpc = vi.fn(async (functionName: string) => {
    if (functionName === 'obtener_notificaciones_usuario') {
      return { data: notifications, error: null };
    }

    return { data: true, error: null };
  });

  const supabase = {
    from,
    rpc,
    channel,
    removeChannel,
  };

  return {
    channels,
    rpc,
    removeChannel,
    supabase: supabase as unknown as SupabaseClient,
  };
};

const findHandlerByFilter = (channels: MockChannel[], filter: string) => {
  const handler = channels
    .flatMap(channel => channel.handlers)
    .find(registration => registration.config.filter === filter);

  if (!handler) {
    throw new Error(`Handler not found for filter: ${filter}`);
  }

  return handler.callback;
};

describe('useNotificaciones', () => {
  it('subscribes to direct, role and global realtime filters', async () => {
    const { channels, removeChannel, supabase } = createSupabaseMock();
    const { unmount } = renderHook(() => useNotificaciones(supabase, user));

    await waitFor(() => expect(channels).toHaveLength(1));

    const filters = channels.flatMap(channel =>
      channel.handlers.map(handler => handler.config.filter)
    );

    expect(filters).toEqual(expect.arrayContaining([
      'destinatario_id=eq.user-1',
      'rol_destinatario=eq.ADMINISTRADOR',
      'rol_destinatario=eq.TODOS',
      'usuario_id=eq.user-1',
    ]));

    unmount();

    expect(removeChannel).toHaveBeenCalledTimes(1);
    expect(removeChannel).toHaveBeenCalledWith(channels[0]);
  });

  it('adds role notifications once and keeps unread count deduplicated', async () => {
    const { channels, supabase } = createSupabaseMock();
    const { result } = renderHook(() => useNotificaciones(supabase, user));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(channels).toHaveLength(1));

    const handleRoleNotification = findHandlerByFilter(
      channels,
      'rol_destinatario=eq.ADMINISTRADOR'
    );
    const notification = createNotification({ id: 'role-notification-1' });

    act(() => {
      handleRoleNotification({ eventType: 'INSERT', new: notification });
    });

    expect(result.current.notificaciones).toHaveLength(1);
    expect(result.current.notificaciones[0].id).toBe('role-notification-1');
    expect(result.current.conteoNoLeidas).toBe(1);

    act(() => {
      handleRoleNotification({ eventType: 'INSERT', new: notification });
    });

    expect(result.current.notificaciones).toHaveLength(1);
    expect(result.current.conteoNoLeidas).toBe(1);
  });

  it('uses the per-user RPC to mark one notification as read', async () => {
    const notification = createNotification();
    const { rpc, supabase } = createSupabaseMock({ notifications: [notification] });
    const { result } = renderHook(() => useNotificaciones(supabase, user));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.marcarComoLeida(notification.id);
    });

    expect(rpc).toHaveBeenCalledWith('marcar_notificacion_leida', {
      p_notificacion_id: notification.id,
    });
    expect(result.current.notificaciones[0]?.leida).toBe(true);
    expect(result.current.conteoNoLeidas).toBe(0);
  });

  it('uses the per-user RPCs for bulk read and hiding', async () => {
    const notification = createNotification();
    const { rpc, supabase } = createSupabaseMock({ notifications: [notification] });
    const { result } = renderHook(() => useNotificaciones(supabase, user));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.marcarTodasComoLeidas();
    });
    expect(rpc).toHaveBeenCalledWith('marcar_todas_notificaciones_leidas');

    await act(async () => {
      await result.current.eliminarNotificacion(notification.id);
    });
    expect(rpc).toHaveBeenCalledWith('ocultar_notificacion', {
      p_notificacion_id: notification.id,
    });
    expect(result.current.notificaciones).toHaveLength(0);
  });

  it('applies realtime state changes only for the subscribed user', async () => {
    const notification = createNotification();
    const { channels, supabase } = createSupabaseMock({ notifications: [notification] });
    const { result } = renderHook(() => useNotificaciones(supabase, user));

    await waitFor(() => expect(result.current.loading).toBe(false));
    const handleStateChange = findHandlerByFilter(channels, 'usuario_id=eq.user-1');

    act(() => {
      handleStateChange({
        eventType: 'UPDATE',
        new: {
          notificacion_id: notification.id,
          usuario_id: 'user-1',
          leida: true,
          oculta: false,
        },
      });
    });

    expect(result.current.notificaciones[0]?.leida).toBe(true);
    expect(result.current.conteoNoLeidas).toBe(0);
  });

  it('keeps rendering when Realtime cannot open a WebSocket', async () => {
    const { channels, removeChannel, supabase } = createSupabaseMock({
      subscribeError: new Error('WebSocket not available'),
    });

    const { result, unmount } = renderHook(() => useNotificaciones(supabase, user));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(channels).toHaveLength(1);

    unmount();

    expect(removeChannel).toHaveBeenCalledWith(channels[0]);
  });

  it('does not report a normal socket close after cleanup', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { channels, supabase } = createSupabaseMock();
    const { unmount } = renderHook(() => useNotificaciones(supabase, user));

    await waitFor(() => expect(channels).toHaveLength(1));
    unmount();

    channels[0].statusCallback?.(
      'CHANNEL_ERROR',
      new Error('socket closed: 1001', { cause: { code: 1001 } })
    );

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
