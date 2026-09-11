-- Trigger bindings for the functions in 0004_functions.sql. Ported verbatim
-- except trigger_new_user_signup (see NOTE(auth-migration) on
-- public.handle_new_user in 0004_functions.sql) -- that one becomes an
-- Auth.js events.createUser callback, not a DB trigger, so it is
-- intentionally NOT bound here.

drop trigger if exists trigger_usuarios_updated_at on public.usuarios;
create trigger trigger_usuarios_updated_at
  before update on public.usuarios
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists trigger_usuario_notificacion on public.usuarios;
create trigger trigger_usuario_notificacion
  after update on public.usuarios
  for each row
  execute function public.trigger_notificacion_usuario();

drop trigger if exists trigger_update_bajas_productos_updated_at on public.bajas_productos;
create trigger trigger_update_bajas_productos_updated_at
  before update on public.bajas_productos
  for each row
  execute function public.update_bajas_productos_updated_at();

drop trigger if exists trigger_validar_producto_duplicado on public.productos_donados;
create trigger trigger_validar_producto_duplicado
  before insert or update on public.productos_donados
  for each row
  execute function public.validar_producto_duplicado();

drop trigger if exists trigger_validar_donacion_alimento_canonico on public.donaciones;
create trigger trigger_validar_donacion_alimento_canonico
  before insert on public.donaciones
  for each row
  execute function public.validar_donacion_alimento_canonico();

drop trigger if exists trigger_validar_cantidad_donacion on public.donaciones;
create trigger trigger_validar_cantidad_donacion
  before insert or update on public.donaciones
  for each row execute function public.validar_cantidad_por_unidad();

drop trigger if exists trigger_crear_producto on public.donaciones;
create trigger trigger_crear_producto
  after insert or update on public.donaciones
  for each row
  execute function public.crear_producto_desde_donacion();

drop trigger if exists trigger_donacion_notificacion on public.donaciones;
create trigger trigger_donacion_notificacion
  after insert or update on public.donaciones
  for each row
  execute function public.trigger_notificacion_donacion();

drop trigger if exists trigger_validar_cancelacion_donacion on public.donaciones;
create trigger trigger_validar_cancelacion_donacion
  before update on public.donaciones
  for each row
  execute function public.validar_cancelacion_donacion();

drop trigger if exists trigger_auditoria_cancelacion_donacion on public.donaciones;
create trigger trigger_auditoria_cancelacion_donacion
  after update of estado on public.donaciones
  for each row
  execute function public.registrar_auditoria_cancelacion_donacion();

drop trigger if exists trigger_inmutabilidad_auditoria_donaciones on public.auditoria_donaciones;
create trigger trigger_inmutabilidad_auditoria_donaciones
  before update or delete on public.auditoria_donaciones
  for each row
  execute function public.bloquear_mutacion_auditoria_donaciones();

drop trigger if exists trigger_validar_cantidad_solicitud on public.solicitudes;
create trigger trigger_validar_cantidad_solicitud
  before insert or update on public.solicitudes
  for each row execute function public.validar_cantidad_por_unidad();

drop trigger if exists trigger_solicitud_notificacion on public.solicitudes;
create trigger trigger_solicitud_notificacion
  after insert or update on public.solicitudes
  for each row
  execute function public.trigger_notificacion_solicitud();

drop trigger if exists trigger_validar_conversion on public.conversiones;
create trigger trigger_validar_conversion
  before insert or update on public.conversiones
  for each row execute function public.validar_conversion();

drop trigger if exists trigger_validar_unidad_movimiento on public.movimiento_inventario_detalle;
create trigger trigger_validar_unidad_movimiento
  before insert or update on public.movimiento_inventario_detalle
  for each row execute function public.validar_unidad_movimiento();

drop trigger if exists trigger_solicitudes_alta_alimentos_updated_at on public.solicitudes_alta_alimentos;
create trigger trigger_solicitudes_alta_alimentos_updated_at
  before update on public.solicitudes_alta_alimentos
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists trigger_notificaciones_usuario_updated_at on public.notificaciones_usuario;
create trigger trigger_notificaciones_usuario_updated_at
  before update on public.notificaciones_usuario
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists trigger_solicitudes_bodega_updated_at on public.solicitudes_bodega;
create trigger trigger_solicitudes_bodega_updated_at
  before update on public.solicitudes_bodega
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists trigger_solicitud_bodega_notificacion on public.solicitudes_bodega;
create trigger trigger_solicitud_bodega_notificacion
  after insert or update on public.solicitudes_bodega
  for each row
  execute function public.notificar_solicitud_bodega();
