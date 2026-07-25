BEGIN;

-- Revocar EXECUTE heredado desde PUBLIC en funciones SECURITY DEFINER.
REVOKE ALL ON FUNCTION public.cancelar_eliminacion_categoria(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crear_notificacion(character varying, text, character varying, uuid, character varying, character varying, character varying, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crear_producto_desde_donacion() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_estado() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin_or_operator() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.limpiar_notificaciones_antiguas() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.marcar_notificacion_leida(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.obtener_notificaciones_no_leidas(uuid, character varying) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.procesar_eliminaciones_categorias_pendientes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_movimiento_con_unidad(uuid, uuid, numeric, text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_notificacion_donacion() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_notificacion_solicitud() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_notificacion_usuario() FROM PUBLIC;

-- Mantener solo el mínimo necesario para el funcionamiento actual.
GRANT EXECUTE ON FUNCTION public.get_user_estado() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

REVOKE ALL ON FUNCTION public.cancelar_eliminacion_categoria(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.crear_notificacion(character varying, text, character varying, uuid, character varying, character varying, character varying, jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.crear_producto_desde_donacion() FROM authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE ALL ON FUNCTION public.is_admin_or_operator() FROM authenticated;
REVOKE ALL ON FUNCTION public.limpiar_notificaciones_antiguas() FROM authenticated;
REVOKE ALL ON FUNCTION public.marcar_notificacion_leida(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.obtener_notificaciones_no_leidas(uuid, character varying) FROM authenticated;
REVOKE ALL ON FUNCTION public.procesar_eliminaciones_categorias_pendientes() FROM authenticated;
REVOKE ALL ON FUNCTION public.registrar_movimiento_con_unidad(uuid, uuid, numeric, text, bigint, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.trigger_notificacion_donacion() FROM authenticated;
REVOKE ALL ON FUNCTION public.trigger_notificacion_solicitud() FROM authenticated;
REVOKE ALL ON FUNCTION public.trigger_notificacion_usuario() FROM authenticated;

COMMIT;
