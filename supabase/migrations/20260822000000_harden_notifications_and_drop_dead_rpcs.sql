BEGIN;

-- ----------------------------------------------------------------------------
-- Limpieza de RPCs muertas heredadas.
--
-- marcar_notificacion_leida ya se reescribió en 20260724024710 con firma
-- (uuid), SECURITY INVOKER y validación interna contra auth.uid(); se omite.
--
-- 1. cancelar_eliminacion_categoria era un placeholder que devolvia true.
--    Sin uso y sin grants útiles: se elimina.
-- 2. is_admin_or_operator, get_user_role y get_user_estado eran SECURITY
--    DEFINER de public sin grants efectivos desde 20260718001200. Reemplazadas
--    por private_auth.current_user_role() / current_user_estado(). Se eliminan.
-- 3. crear_notificacion era SECURITY DEFINER pero todos sus llamadores reales
--    ya operan con privilegios elevados: los triggers de notificación se
--    ejecutan como postgres, y el endpoint /api/notificaciones invoca el
--    servicio con cliente admin (service_role). Cambiamos a INVOKER; las
--    policies RLS de notificaciones cubren el caso legitimo y cualquier
--    intento anonimo queda bloqueado por notificaciones_insert_staff.
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.cancelar_eliminacion_categoria(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_admin_or_operator();
DROP FUNCTION IF EXISTS public.get_user_role();
DROP FUNCTION IF EXISTS public.get_user_estado();

ALTER FUNCTION public.crear_notificacion(character varying, text, character varying, uuid, character varying, character varying, character varying, jsonb)
  SECURITY INVOKER;

COMMENT ON FUNCTION public.crear_notificacion(character varying, text, character varying, uuid, character varying, character varying, character varying, jsonb) IS
  'Inserta una notificacion como el llamador. Solo service_role y staff activo (via triggers '
  'SECURITY DEFINER) tienen camino legitimo; las RLS policies cubren cualquier otro intento.';

COMMIT;