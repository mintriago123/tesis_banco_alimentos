'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationEventPayload } from '@/modules/shared/services/notificationEvents';
import { sendNotification } from '@/modules/shared/services/notificationClient';
import {
  fetchNotificacionesAction,
  marcarNotificacionLeidaAction,
  marcarTodasNotificacionesLeidasAction,
  ocultarNotificacionAction,
  type NotificacionRow,
} from '@/modules/shared/services/notificacionesActions';
import {
  actualizarConfiguracionNotificacionAction,
  fetchConfiguracionNotificacionesAction,
  type ConfiguracionNotificacionRow,
} from '@/modules/shared/services/configuracionNotificacionesActions';

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

const normalize = (row: NotificacionRow): Notificacion => ({
  id: row.id,
  titulo: row.titulo,
  mensaje: row.mensaje,
  tipo: row.tipo,
  categoria: row.categoria,
  url_accion: row.url_accion ?? undefined,
  metadatos: row.metadatos ?? {},
  fecha_creacion: row.fecha_creacion,
  leida: row.leida,
});

interface EstadoEventData {
  notificacion_id?: string;
  usuario_id?: string;
  leida?: boolean;
  oculta?: boolean;
}

type StreamMessage =
  | { type: 'notificacion'; action: 'INSERT' | 'UPDATE' | 'DELETE'; data: NotificacionRow }
  | { type: 'estado'; action: 'INSERT' | 'UPDATE' | 'DELETE'; data: EstadoEventData };

/**
 * Live-updates via `/api/notifications/stream` (Postgres LISTEN/NOTIFY + SSE
 * — see src/lib/realtime/listener.ts), replacing Supabase Realtime's
 * `postgres_changes`. A slow background poll (2 min) stays as a safety net
 * in case the stream drops silently; `EventSource` itself auto-reconnects.
 */
export function useNotificaciones(userId: string | null) {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [configuracion, setConfiguracion] = useState<ConfiguracionNotificacionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conteoNoLeidas, setConteoNoLeidas] = useState(0);
  const notificacionesRef = useRef<Notificacion[]>([]);

  const cargarNotificaciones = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      const result = await fetchNotificacionesAction(50);
      if (!result.success) {
        throw new Error(result.error);
      }

      const loaded = result.data.map(normalize);
      setNotificaciones(loaded);
      setConteoNoLeidas(loaded.filter((n) => !n.leida).length);
    } catch (err) {
      console.error('Error al cargar notificaciones:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar notificaciones');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const cargarConfiguracion = useCallback(async () => {
    if (!userId) return;
    try {
      setConfiguracion(await fetchConfiguracionNotificacionesAction());
    } catch (err) {
      console.error('Error al cargar configuración:', err);
    }
  }, [userId]);

  const marcarComoLeida = async (notificacionId: string) => {
    const ok = await marcarNotificacionLeidaAction(notificacionId);
    if (!ok) return false;

    setNotificaciones((prev) => prev.map((n) => (n.id === notificacionId ? { ...n, leida: true } : n)));
    setConteoNoLeidas((prev) => Math.max(0, prev - 1));
    return true;
  };

  const marcarTodasComoLeidas = async () => {
    const ok = await marcarTodasNotificacionesLeidasAction();
    if (!ok) return false;

    setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })));
    setConteoNoLeidas(0);
    return true;
  };

  const eliminarNotificacion = async (notificacionId: string) => {
    const ok = await ocultarNotificacionAction(notificacionId);
    if (!ok) return false;

    const notificacion = notificaciones.find((n) => n.id === notificacionId);
    if (notificacion && !notificacion.leida) {
      setConteoNoLeidas((prev) => Math.max(0, prev - 1));
    }
    setNotificaciones((prev) => prev.filter((n) => n.id !== notificacionId));
    return true;
  };

  const actualizarConfiguracion = async (categoria: string, config: Partial<Pick<ConfiguracionNotificacionRow, 'email_activo' | 'push_activo' | 'sonido_activo'>>) => {
    const ok = await actualizarConfiguracionNotificacionAction(categoria, config);
    if (!ok) return false;

    setConfiguracion((prev) => {
      const existing = prev.find((c) => c.categoria === categoria);
      if (existing) {
        return prev.map((c) => (c.categoria === categoria ? { ...c, ...config } : c));
      }
      return [...prev, { categoria, email_activo: true, push_activo: true, sonido_activo: true, ...config }];
    });
    return true;
  };

  const crearNotificacion = async (payload: NotificationEventPayload) => {
    await sendNotification(payload);
  };

  useEffect(() => {
    notificacionesRef.current = notificaciones;
  }, [notificaciones]);

  useEffect(() => {
    if (!userId) return;
    void cargarNotificaciones();
    void cargarConfiguracion();

    // Safety net only — EventSource below auto-reconnects on its own.
    const fallbackPoll = setInterval(() => void cargarNotificaciones(), 120_000);
    return () => clearInterval(fallbackPoll);
  }, [userId, cargarNotificaciones, cargarConfiguracion]);

  useEffect(() => {
    if (!userId) return;

    const source = new EventSource('/api/notifications/stream');

    source.onmessage = (event) => {
      if (event.data.startsWith(':')) return; // heartbeat comment line

      let message: StreamMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message.type === 'notificacion') {
        const incoming = normalize(message.data);
        setNotificaciones((prev) => {
          if (prev.some((n) => n.id === incoming.id)) return prev;
          return [incoming, ...prev];
        });
        if (!incoming.leida) {
          setConteoNoLeidas((prev) => prev + 1);
        }
        return;
      }

      // type === 'estado' (notificaciones_usuario change)
      const { notificacion_id, leida, oculta } = message.data;
      if (!notificacion_id) return;

      const current = notificacionesRef.current.find((n) => n.id === notificacion_id);

      if (message.action === 'DELETE' || oculta) {
        if (current && !current.leida) {
          setConteoNoLeidas((prev) => Math.max(0, prev - 1));
        }
        setNotificaciones((prev) => prev.filter((n) => n.id !== notificacion_id));
        return;
      }

      if (current && !current.leida && leida) {
        setConteoNoLeidas((prev) => Math.max(0, prev - 1));
      }
      setNotificaciones((prev) => prev.map((n) => (n.id === notificacion_id ? { ...n, leida: leida ?? n.leida } : n)));
    };

    source.onerror = () => {
      // EventSource retries automatically; nothing to do here beyond letting
      // it reconnect. The fallback poll above covers any gap in between.
    };

    return () => source.close();
  }, [userId]);

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
