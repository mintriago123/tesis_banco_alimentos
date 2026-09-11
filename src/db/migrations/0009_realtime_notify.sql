-- Stage 3 (realtime): replaces Supabase Realtime's WAL-based postgres_changes
-- with plain Postgres LISTEN/NOTIFY. Triggers emit a small pointer payload
-- (NOTIFY has an 8000-byte cap) on the same two tables the old
-- `supabase_realtime` publication carried: notificaciones, notificaciones_usuario.
-- The app-side listener (src/lib/realtime/listener.ts) relays these to SSE
-- connections, each of which re-fetches full content through the normal
-- RLS-scoped path — see the migration plan's Stage 3 notes on why
-- authorization isn't automatic here the way it was with postgres_changes.

CREATE OR REPLACE FUNCTION public.notify_notificacion_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payload jsonb;
BEGIN
  IF TG_TABLE_NAME = 'notificaciones' THEN
    payload := jsonb_build_object(
      'table', 'notificaciones',
      'action', TG_OP,
      'id', NEW.id,
      'destinatario_id', NEW.destinatario_id,
      'rol_destinatario', NEW.rol_destinatario
    );
  ELSIF TG_TABLE_NAME = 'notificaciones_usuario' THEN
    payload := jsonb_build_object(
      'table', 'notificaciones_usuario',
      'action', TG_OP,
      'id', COALESCE(NEW.id, OLD.id),
      'notificacion_id', COALESCE(NEW.notificacion_id, OLD.notificacion_id),
      'usuario_id', COALESCE(NEW.usuario_id, OLD.usuario_id),
      'leida', COALESCE(NEW.leida, false),
      'oculta', COALESCE(NEW.oculta, false)
    );
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM pg_notify('notificaciones_channel', payload::text);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_notificaciones ON public.notificaciones;
CREATE TRIGGER trigger_notify_notificaciones
  AFTER INSERT ON public.notificaciones
  FOR EACH ROW EXECUTE FUNCTION public.notify_notificacion_change();

DROP TRIGGER IF EXISTS trigger_notify_notificaciones_usuario ON public.notificaciones_usuario;
CREATE TRIGGER trigger_notify_notificaciones_usuario
  AFTER INSERT OR UPDATE OR DELETE ON public.notificaciones_usuario
  FOR EACH ROW EXECUTE FUNCTION public.notify_notificacion_change();
