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

    if (table === 'notificaciones') {
      return {
        select: vi.fn(() => ({
          or: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(async () => ({
                  data: notifications,
                  error: null,
                })),
              })),
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

  const supabase = {
    from,
    channel,
    removeChannel,
  };

  return {
    channels,
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
