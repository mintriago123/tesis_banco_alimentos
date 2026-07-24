'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { type SupabaseClient, type User } from '@supabase/supabase-js';
import type { NotificationEventPayload } from '@/modules/shared/services/notificationEvents';

export interface Notificacion {
  id: string;
  titulo: string;
  mensaje: string;
  tipo: 'info' | 'success' | 'warning' | 'error';
  categoria: string;
  url_accion?: string;
  metadatos: Record<string, unknown>;
  fecha_creacion: string;
  leida: boolean;
}

interface RpcNotificacion extends Omit<Notificacion, 'url_accion' | 'metadatos'> {
  url_accion: string | null;
  metadatos: Record<string, unknown> | null;
}

interface RealtimeNotification extends Omit<Notificacion, 'url_accion' | 'metadatos' | 'leida'> {
  url_accion?: string | null;
  metadatos?: Record<string, unknown> | null;
  leida?: boolean;
  expira_en?: string | null;
}

interface RealtimeState {
  notificacion_id: string;
  usuario_id: string;
  leida: boolean;
  oculta: boolean;
}

interface ConfiguracionNotificacion {
  categoria: string;
  email_activo: boolean;
  push_activo: boolean;
  sonido_activo: boolean;
}

interface RealtimePayload {
  eventType: string;
  new: unknown;
  old?: unknown;
}

const getSocketCloseCode = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null || !('cause' in error)) {
    return undefined;
  }

  const cause = error.cause;
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) {
    return undefined;
  }

  return typeof cause.code === 'number' ? cause.code : undefined;
};

const normalizeRpcNotification = (notification: RpcNotificacion): Notificacion => ({
  ...notification,
  url_accion: notification.url_accion ?? undefined,
  metadatos: notification.metadatos ?? {},
});

const normalizeRealtimeNotification = (notification: RealtimeNotification): Notificacion => ({
  id: notification.id,
  titulo: notification.titulo,
  mensaje: notification.mensaje,
  tipo: notification.tipo,
  categoria: notification.categoria,
  url_accion: notification.url_accion ?? undefined,
  metadatos: notification.metadatos ?? {},
  fecha_creacion: notification.fecha_creacion,
  leida: notification.leida ?? false,
});

export function useNotificaciones(supabase: SupabaseClient, user: User | null) {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [configuracion, setConfiguracion] = useState<ConfiguracionNotificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conteoNoLeidas, setConteoNoLeidas] = useState(0);
  const [userRole, setUserRole] = useState<{ userId: string; role: string } | null>(null);
  const notificationIdsRef = useRef<Set<string>>(new Set());
  const notificationsRef = useRef<Notificacion[]>([]);

  const cargarNotificaciones = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const { data: userData, error: userError } = await supabase
        .from('usuarios')
        .select('rol')
        .eq('id', user.id)
        .single();

      if (userError) throw userError;

      const rol = userData?.rol;
      if (typeof rol !== 'string') {
        throw new Error('Rol de usuario no disponible');
      }

      const { data, error: notificationsError } = await supabase.rpc(
        'obtener_notificaciones_usuario',
        { p_limite: 50 },
      );

      if (notificationsError) throw notificationsError;

      const loadedNotifications = ((data ?? []) as RpcNotificacion[]).map(
        normalizeRpcNotification,
      );

      notificationIdsRef.current = new Set(loadedNotifications.map(({ id }) => id));
      setNotificaciones(loadedNotifications);
      setConteoNoLeidas(loadedNotifications.filter(({ leida }) => !leida).length);
      setUserRole({ userId: user.id, role: rol });
    } catch (err) {
      console.error('Error al cargar notificaciones:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar notificaciones');
    } finally {
      setLoading(false);
    }
  }, [supabase, user]);

  const cargarConfiguracion = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error: configurationError } = await supabase
        .from('configuracion_notificaciones')
        .select('categoria, email_activo, push_activo, sonido_activo')
        .eq('usuario_id', user.id);

      if (configurationError) throw configurationError;
      setConfiguracion(data || []);
    } catch (err) {
      console.error('Error al cargar configuración:', err);
    }
  }, [supabase, user]);

  const marcarComoLeida = async (notificacionId: string) => {
    try {
      const { data, error: rpcError } = await supabase.rpc('marcar_notificacion_leida', {
        p_notificacion_id: notificacionId,
      });

      if (rpcError) throw rpcError;
      if (data === false) return false;

      const notificacion = notificaciones.find(({ id }) => id === notificacionId);
      if (notificacion && !notificacion.leida) {
        setConteoNoLeidas((previous) => Math.max(0, previous - 1));
      }

      setNotificaciones((previous) =>
        previous.map((item) =>
          item.id === notificacionId ? { ...item, leida: true } : item,
        ),
      );

      return true;
    } catch (err) {
      console.error('Error al marcar como leída:', err);
      return false;
    }
  };

  const marcarTodasComoLeidas = async () => {
    if (!user) return false;

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'marcar_todas_notificaciones_leidas',
      );

      if (rpcError) throw rpcError;
      if (data === false) return false;

      setNotificaciones((previous) => previous.map((item) => ({ ...item, leida: true })));
      setConteoNoLeidas(0);
      return true;
    } catch (err) {
      console.error('Error al marcar todas como leídas:', err);
      return false;
    }
  };

  const actualizarConfiguracion = async (
    categoria: string,
    config: Partial<ConfiguracionNotificacion>,
  ) => {
    if (!user) return false;

    try {
      const { error: configurationError } = await supabase
        .from('configuracion_notificaciones')
        .upsert({
          usuario_id: user.id,
          categoria,
          ...config,
          fecha_actualizacion: new Date().toISOString(),
        });

      if (configurationError) throw configurationError;

      setConfiguracion((previous) => {
        const existing = previous.find((item) => item.categoria === categoria);
        if (existing) {
          return previous.map((item) =>
            item.categoria === categoria ? { ...item, ...config } : item,
          );
        }

        return [
          ...previous,
          {
            categoria,
            email_activo: true,
            push_activo: true,
            sonido_activo: true,
            ...config,
          },
        ];
      });

      return true;
    } catch (err) {
      console.error('Error al actualizar configuración:', err);
      return false;
    }
  };

  const crearNotificacion = async (payload: NotificationEventPayload) => {
    try {
      const response = await fetch('/api/notificaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error ?? 'No se pudo crear la notificación');
      }

      const data = await response.json();
      return data?.notificacion ?? null;
    } catch (err) {
      console.error('Error al crear notificación:', err);
      throw err;
    }
  };

  const eliminarNotificacion = async (notificacionId: string) => {
    try {
      const { data, error: rpcError } = await supabase.rpc('ocultar_notificacion', {
        p_notificacion_id: notificacionId,
      });

      if (rpcError) throw rpcError;
      if (data === false) return false;

      const notificacion = notificaciones.find(({ id }) => id === notificacionId);
      if (notificacion && !notificacion.leida) {
        setConteoNoLeidas((previous) => Math.max(0, previous - 1));
      }

      notificationIdsRef.current.delete(notificacionId);
      setNotificaciones((previous) => previous.filter(({ id }) => id !== notificacionId));
      return true;
    } catch (err) {
      console.error('Error al ocultar notificación:', err);
      return false;
    }
  };

  useEffect(() => {
    notificationsRef.current = notificaciones;
  }, [notificaciones]);

  useEffect(() => {
    if (!user || !userRole || userRole.userId !== user.id) return;

    const handleRealtimePayload = (payload: RealtimePayload, table: string) => {
      if (table === 'notificaciones_usuario') {
        const state = (payload.eventType === 'DELETE' ? payload.old : payload.new) as RealtimeState;
        if (!state || state.usuario_id !== user.id) return;

        const currentNotification = notificationsRef.current.find(
          ({ id }) => id === state.notificacion_id,
        );

        if (!currentNotification) {
          void cargarNotificaciones();
          return;
        }

        if (payload.eventType === 'DELETE' || state.oculta) {
          if (!currentNotification.leida) {
            setConteoNoLeidas((previous) => Math.max(0, previous - 1));
          }
          notificationIdsRef.current.delete(state.notificacion_id);
          setNotificaciones((previous) =>
            previous.filter(({ id }) => id !== state.notificacion_id),
          );
          return;
        }

        if (!currentNotification.leida && state.leida) {
          setConteoNoLeidas((previous) => Math.max(0, previous - 1));
        }

        setNotificaciones((previous) =>
          previous.map((item) =>
            item.id === state.notificacion_id ? { ...item, leida: state.leida } : item,
          ),
        );
        return;
      }

      if (payload.eventType === 'INSERT') {
        const incomingNotification = normalizeRealtimeNotification(
          payload.new as RealtimeNotification,
        );

        if (notificationIdsRef.current.has(incomingNotification.id)) return;

        notificationIdsRef.current.add(incomingNotification.id);
        setNotificaciones((previous) => [incomingNotification, ...previous]);
        if (!incomingNotification.leida) {
          setConteoNoLeidas((previous) => previous + 1);
        }
      } else if (payload.eventType === 'DELETE') {
        const deletedNotification = payload.old as { id?: string };
        if (!deletedNotification.id) return;

        const currentNotification = notificationsRef.current.find(
          ({ id }) => id === deletedNotification.id,
        );
        if (currentNotification && !currentNotification.leida) {
          setConteoNoLeidas((previous) => Math.max(0, previous - 1));
        }
        notificationIdsRef.current.delete(deletedNotification.id);
        setNotificaciones((previous) =>
          previous.filter(({ id }) => id !== deletedNotification.id),
        );
      }
    };

    const subscriptions = [
      { table: 'notificaciones', filter: `destinatario_id=eq.${user.id}` },
      { table: 'notificaciones', filter: `rol_destinatario=eq.${userRole.role}` },
      { table: 'notificaciones', filter: 'rol_destinatario=eq.TODOS' },
      { table: 'notificaciones_usuario', filter: `usuario_id=eq.${user.id}` },
    ];

    let isEffectActive = true;
    const channel = supabase.channel(`notificaciones_realtime:${user.id}`);

    try {
      subscriptions.forEach(({ table, filter }) => {
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter },
          (payload) => handleRealtimePayload(payload as RealtimePayload, table),
        );
      });

      channel.subscribe((status, subscriptionError) => {
        if (!isEffectActive || (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT')) {
          return;
        }

        const closeCode = getSocketCloseCode(subscriptionError);
        if (closeCode === 1000 || closeCode === 1001) return;

        console.warn(
          `Realtime de notificaciones no disponible (${status})`,
          subscriptionError,
        );
      });
    } catch (subscriptionError) {
      if (isEffectActive) {
        console.warn('Realtime de notificaciones no disponible', subscriptionError);
      }
    }

    return () => {
      isEffectActive = false;
      void supabase.removeChannel(channel);
    };
  }, [cargarNotificaciones, supabase, user, userRole]);

  useEffect(() => {
    if (!user) return;

    void cargarNotificaciones();
    void cargarConfiguracion();
  }, [cargarConfiguracion, cargarNotificaciones, user]);

  return {
    notificaciones,
    configuracion,
    loading,
    error,
    conteoNoLeidas,
    marcarComoLeida,
    marcarTodasComoLeidas,
    actualizarConfiguracion,
    crearNotificacion,
    eliminarNotificacion,
    recargar: cargarNotificaciones,
  };
}
