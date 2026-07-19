BEGIN;

ALTER FUNCTION public.dar_baja_producto(uuid, numeric, text, uuid, text)
  SET search_path TO '';

ALTER FUNCTION public.obtener_estadisticas_bajas(timestamp with time zone, timestamp with time zone)
  SET search_path TO '';

ALTER FUNCTION public.obtener_productos_proximos_vencer(integer)
  SET search_path TO '';

ALTER FUNCTION public.trigger_notificacion_usuario()
  SET search_path TO '';

ALTER FUNCTION public.update_bajas_productos_updated_at()
  SET search_path TO '';

COMMIT;
