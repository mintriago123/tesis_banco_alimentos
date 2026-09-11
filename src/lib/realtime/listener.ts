import 'server-only';
import postgres from 'postgres';

export interface NotificacionesChangeEvent {
  table: 'notificaciones' | 'notificaciones_usuario';
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  id: string;
  destinatario_id?: string | null;
  rol_destinatario?: string | null;
  notificacion_id?: string;
  usuario_id?: string;
  leida?: boolean;
  oculta?: boolean;
}

type Subscriber = (event: NotificacionesChangeEvent) => void;

/**
 * One dedicated LISTEN connection per Node process (not the pooled `db`/
 * `dbAdmin` clients — LISTEN needs a single persistent session, incompatible
 * with transaction-pooled connections). Fans out to in-memory subscribers;
 * each SSE connection (src/app/api/notifications/stream/route.ts) is one
 * subscriber and does its own RLS-scoped re-fetch for events it cares about.
 *
 * Guarded on `globalThis` so Next.js dev-mode HMR doesn't open a new LISTEN
 * connection on every module reload.
 */
class NotificationListener {
  private subscribers = new Set<Subscriber>();
  private sql: ReturnType<typeof postgres> | null = null;
  private connecting: Promise<void> | null = null;

  private async ensureConnected() {
    if (this.sql) return;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
      await sql.listen('notificaciones_channel', (raw) => {
        try {
          const event = JSON.parse(raw) as NotificacionesChangeEvent;
          for (const subscriber of this.subscribers) {
            subscriber(event);
          }
        } catch (error) {
          console.error('[realtime] Payload de NOTIFY inválido:', error);
        }
      });
      this.sql = sql;
    })();

    return this.connecting;
  }

  async subscribe(subscriber: Subscriber): Promise<() => void> {
    await this.ensureConnected();
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }
}

const globalForListener = globalThis as unknown as { __notificationListener?: NotificationListener };

export const notificationListener = globalForListener.__notificationListener ?? new NotificationListener();

if (process.env.NODE_ENV !== 'production') {
  globalForListener.__notificationListener = notificationListener;
}
