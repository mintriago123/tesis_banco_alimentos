'use server';

import { sql } from 'drizzle-orm';
import { withRlsContext } from '@/db/client';
import { requireAuth } from '@/lib/server-auth';

export interface NotificacionRow {
  id: string;
  titulo: string;
  mensaje: string;
  tipo: 'info' | 'success' | 'warning' | 'error';
  categoria: string;
  url_accion: string | null;
  metadatos: Record<string, unknown> | null;
  fecha_creacion: string;
  leida: boolean;
}

type ObtenerNotificacionesRow = {
  id: string;
  titulo: string;
  mensaje: string;
  tipo: string;
  categoria: string;
  url_accion: string | null;
  metadatos: Record<string, unknown> | null;
  fecha_creacion: string;
  leida: boolean;
} & Record<string, unknown>;

export async function fetchNotificacionesAction(limite = 50): Promise<{ success: true; data: NotificacionRow[] } | { success: false; error: string }> {
  const auth = await requireAuth();
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const rows = await tx.execute<ObtenerNotificacionesRow>(sql`select * from obtener_notificaciones_usuario(${limite})`);
      return {
        success: true as const,
        data: rows.map((row) => ({
          id: row.id,
          titulo: row.titulo,
          mensaje: row.mensaje,
          tipo: (row.tipo as NotificacionRow['tipo']) ?? 'info',
          categoria: row.categoria,
          url_accion: row.url_accion,
          metadatos: row.metadatos,
          fecha_creacion: row.fecha_creacion,
          leida: row.leida,
        })),
      };
    } catch (error) {
      console.error('Error al obtener notificaciones:', error);
      return { success: false as const, error: 'No fue posible obtener las notificaciones' };
    }
  });
}

export async function marcarNotificacionLeidaAction(notificacionId: string): Promise<boolean> {
  const auth = await requireAuth();
  if (auth.response) return false;

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const [row] = await tx.execute<{ marcar_notificacion_leida: boolean } & Record<string, unknown>>(
        sql`select marcar_notificacion_leida(${notificacionId}::uuid) as marcar_notificacion_leida`,
      );
      return row?.marcar_notificacion_leida ?? false;
    } catch (error) {
      console.error('Error al marcar notificación leída:', error);
      return false;
    }
  });
}

export async function marcarTodasNotificacionesLeidasAction(): Promise<boolean> {
  const auth = await requireAuth();
  if (auth.response) return false;

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const [row] = await tx.execute<{ marcar_todas_notificaciones_leidas: boolean } & Record<string, unknown>>(
        sql`select marcar_todas_notificaciones_leidas() as marcar_todas_notificaciones_leidas`,
      );
      return row?.marcar_todas_notificaciones_leidas ?? false;
    } catch (error) {
      console.error('Error al marcar todas las notificaciones leídas:', error);
      return false;
    }
  });
}

export async function ocultarNotificacionAction(notificacionId: string): Promise<boolean> {
  const auth = await requireAuth();
  if (auth.response) return false;

  return withRlsContext(auth.profile.id, async (tx) => {
    try {
      const [row] = await tx.execute<{ ocultar_notificacion: boolean } & Record<string, unknown>>(
        sql`select ocultar_notificacion(${notificacionId}::uuid) as ocultar_notificacion`,
      );
      return row?.ocultar_notificacion ?? false;
    } catch (error) {
      console.error('Error al ocultar notificación:', error);
      return false;
    }
  });
}
