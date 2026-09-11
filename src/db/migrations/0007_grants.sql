-- Grant model: ported from the final state of the source migrations' many
-- REVOKE/GRANT passes, with `authenticated` -> `app_user` and
-- `service_role` -> `app_admin`. All `anon`-targeted grants/revokes are
-- dropped entirely: there is no anonymous Postgres role in this deployment,
-- every connection is either app_user or app_admin.
--
-- Baseline is deny-by-default (mirrors the source's 20260718001200 "security
-- cleanup" reset): nothing is implicitly granted to PUBLIC, and future
-- objects don't inherit grants either.

revoke all on all tables in schema public from public;
revoke all on all sequences in schema public from public;
revoke all on all functions in schema public from public;

alter default privileges in schema public revoke all on tables from public;
alter default privileges in schema public revoke all on sequences from public;
alter default privileges in schema public revoke all on functions from public;

-- ============================================================================
-- app_admin: full access, matching the source's `GRANT ALL ... TO service_role`
-- ============================================================================
grant all on all tables in schema public to app_admin;
grant all on all sequences in schema public to app_admin;
grant all on all functions in schema public to app_admin;
grant all on schema private_auth to app_admin;
grant all on all functions in schema private_auth to app_admin;

alter default privileges in schema public grant all on tables to app_admin;
alter default privileges in schema public grant all on sequences to app_admin;
alter default privileges in schema public grant all on functions to app_admin;

-- ============================================================================
-- app_user: table-level grants
-- ============================================================================

-- Full CRUD (RLS policies in 0006 still gate which rows/operations actually
-- succeed for a given caller -- this is the outer table-privilege boundary).
grant select, insert, update, delete on table
  public.alimentos,
  public.alimentos_unidades,
  public.bajas_productos,
  public.configuracion_notificaciones,
  public.conversiones,
  public.detalles_solicitud,
  public.entradas_inventario,
  public.historial_donaciones,
  public.movimiento_inventario_cabecera,
  public.movimiento_inventario_detalle,
  public.notificaciones_usuario,
  public.productos_donados,
  public.solicitudes,
  public.solicitudes_alta_alimentos,
  public.solicitudes_alta_alimentos_unidades,
  public.tipos_magnitud,
  public.unidades
to app_user;

-- donaciones: no DELETE -- donations are only ever soft-cancelled
-- (trigger_validar_cancelacion_donacion enforces the state machine).
grant select, insert, update on table public.donaciones to app_user;

-- depositos / donante_depositos: SELECT only. All writes happen through the
-- private_auth.* SECURITY DEFINER RPCs in 0004_functions.sql, never a
-- direct client write.
grant select on table public.depositos to app_user;
grant select on table public.donante_depositos to app_user;

-- solicitudes_bodega: SELECT only, same reasoning (private_auth.* RPCs own
-- every write).
grant select on table public.solicitudes_bodega to app_user;

-- auditoria_donaciones: SELECT only -- immutable audit log, written solely
-- by the SECURITY DEFINER trigger in 0004/0005.
grant select on table public.auditoria_donaciones to app_user;

-- usuarios: SELECT plus a column-restricted UPDATE. Notably excludes id,
-- rol, estado, email -- a user can edit their own profile fields but can
-- never self-promote a role or reactivate/unblock their own account.
grant select on table public.usuarios to app_user;
grant update (
  tipo_persona,
  cedula,
  ruc,
  direccion,
  telefono,
  nombre,
  representante,
  latitud,
  longitud,
  recibir_notificaciones,
  updated_at
) on table public.usuarios to app_user;

-- notificaciones: SELECT only. INSERT happens exclusively via
-- public.crear_notificacion (SECURITY INVOKER, but its only legitimate
-- callers are SECURITY DEFINER triggers running as owner, or app_admin).
grant select on table public.notificaciones to app_user;

-- api_rate_limits / api_document_lookup_audit_log: no grants to app_user at
-- all -- reachable only via app_admin or the SECURITY DEFINER
-- consume_document_lookup_quota function.

grant usage, select on all sequences in schema public to app_user;
alter default privileges in schema public grant usage, select on sequences to app_user;

-- ============================================================================
-- app_user / app_admin: schema usage for the helper schemas
-- ============================================================================
grant usage on schema private_auth to app_user;

-- ============================================================================
-- Function EXECUTE grants
-- ============================================================================

-- RLS helper functions -- called from inside policy expressions, which run
-- as the querying role, so app_user needs EXECUTE even though these are
-- SECURITY DEFINER.
grant execute on function private_auth.current_user_role() to app_user;
grant execute on function private_auth.current_user_estado() to app_user;

-- private_auth.formatear_nombre_bodega is intentionally NOT granted to
-- app_user: its only callers are private_auth.crear_solicitud_bodega and
-- private_auth.aprobar_solicitud_bodega, both SECURITY DEFINER, so the call
-- happens in the function owner's privilege context, not the caller's.

-- Warehouse (bodega) workflow: the private_auth.* delegates need EXECUTE
-- because the public.* wrappers are SECURITY INVOKER and call them directly
-- in the caller's own privilege context.
grant execute on function private_auth.crear_solicitud_bodega(text, text, text, text, text, uuid, double precision, double precision) to app_user;
grant execute on function private_auth.aprobar_solicitud_bodega(uuid) to app_user;
grant execute on function private_auth.rechazar_solicitud_bodega(uuid, text) to app_user;
grant execute on function private_auth.cancelar_solicitud_bodega(uuid) to app_user;
grant execute on function private_auth.crear_bodega_principal_donante(text, text) to app_user;

grant execute on function public.crear_solicitud_bodega(text, text, text, text, text, uuid, double precision, double precision) to app_user;
grant execute on function public.aprobar_solicitud_bodega(uuid) to app_user;
grant execute on function public.rechazar_solicitud_bodega(uuid, text) to app_user;
grant execute on function public.cancelar_solicitud_bodega(uuid) to app_user;
grant execute on function public.crear_bodega_principal_donante(text, text) to app_user;

-- Inventory RPCs.
grant execute on function public.descontar_stock_por_lote(uuid, uuid, numeric, bigint) to app_user;
grant execute on function public.restaurar_entrada_inventario(uuid, numeric) to app_user;
grant execute on function public.resolver_conversion(bigint, bigint) to app_user, app_admin;
grant execute on function public.obtener_unidades_alimento(bigint) to app_user, app_admin;
grant execute on function public.obtener_alimentos_con_stock() to app_user;
grant execute on function public.obtener_stock_por_producto(text) to app_user;

-- Notification RPCs.
grant execute on function public.obtener_notificaciones_usuario(integer) to app_user;
grant execute on function public.marcar_notificacion_leida(uuid) to app_user;
grant execute on function public.marcar_todas_notificaciones_leidas() to app_user;
grant execute on function public.ocultar_notificacion(uuid) to app_user;

-- public.crear_notificacion and public.limpiar_notificaciones_antiguas are
-- intentionally NOT granted to app_user: notification content must always
-- be server-derived (see the source's NotificationService design), never
-- something a client-privileged role can invoke directly.

-- Service-role-only RPCs: app_admin exclusively. Never grant these to
-- app_user -- the app's server-side code (Route Handlers / Server Actions
-- acting as an admin operation) must go through the dbAdmin client.
grant execute on function public.dar_baja_producto(uuid, numeric, text, uuid, text) to app_admin;
grant execute on function public.obtener_estadisticas_bajas(timestamp with time zone, timestamp with time zone) to app_admin;
grant execute on function public.obtener_productos_proximos_vencer(integer) to app_admin;
grant execute on function public.obtener_info_producto_inventario(uuid) to app_admin;
grant execute on function public.aprobar_solicitud_alta_alimento_server(uuid, uuid, text, text, bigint[], bigint) to app_admin;
grant execute on function public.consume_document_lookup_quota(uuid, text, timestamp with time zone, integer, integer) to app_admin;

-- Trigger functions never need an explicit EXECUTE grant (Postgres invokes
-- them internally, not via a client call), so none are granted here.
