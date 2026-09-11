import { eq } from 'drizzle-orm';
import { withRlsContext } from '@/db/client';
import { notificaciones } from '@/db/schema';
import { requireAuth } from '@/lib/server-auth';
import { notificationListener, type NotificacionesChangeEvent } from '@/lib/realtime/listener';

// Node.js runtime is the default in this Next.js version (Edge is deprecated
// repo-wide) — no `export const runtime` needed, and this route couldn't run
// on Edge anyway (it holds a long-lived subscription + SSE stream).

const HEARTBEAT_MS = 20_000;

function matchesNotificacion(event: NotificacionesChangeEvent, userId: string, rol: string): boolean {
  return event.destinatario_id === userId || event.rol_destinatario === rol || event.rol_destinatario === 'TODOS';
}

function matchesEstado(event: NotificacionesChangeEvent, userId: string): boolean {
  return event.usuario_id === userId;
}

export async function GET() {
  const auth = await requireAuth();
  if (auth.response) {
    return auth.response;
  }

  const { id: userId, rol } = auth.profile;
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start: async (controller) => {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // Controller already closed (client disconnected mid-write) — ignore.
        }
      };

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          // Ignore — cleanup happens on abort.
        }
      }, HEARTBEAT_MS);

      unsubscribe = await notificationListener.subscribe(async (event) => {
        if (event.table === 'notificaciones' && matchesNotificacion(event, userId, rol)) {
          const row = await withRlsContext(userId, async (tx) => {
            const [notif] = await tx.select().from(notificaciones).where(eq(notificaciones.id, event.id)).limit(1);
            return notif ?? null;
          });

          if (row) {
            send({
              type: 'notificacion',
              action: event.action,
              data: {
                id: row.id,
                titulo: row.titulo,
                mensaje: row.mensaje,
                tipo: row.tipo,
                categoria: row.categoria,
                url_accion: row.urlAccion,
                metadatos: row.metadatos,
                fecha_creacion: row.fechaCreacion,
                leida: false,
              },
            });
          }
          return;
        }

        if (event.table === 'notificaciones_usuario' && matchesEstado(event, userId)) {
          send({
            type: 'estado',
            action: event.action,
            data: { notificacion_id: event.notificacion_id, usuario_id: event.usuario_id, leida: event.leida, oculta: event.oculta },
          });
        }
      });
    },
    cancel: () => {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
