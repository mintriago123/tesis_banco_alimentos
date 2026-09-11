-- Reporting views ported verbatim from the final state of
-- 20260724220103_consolidate_entries_inventory_source.sql on `main`. Missed
-- by the initial functions/triggers/policies porting pass (0004-0007) since
-- views weren't in that pass's object list. All are `security_invoker`, so
-- they run under the querying role's RLS exactly like the ported functions.

DROP VIEW IF EXISTS public.v_inventario_con_conversiones;
DROP VIEW IF EXISTS public.v_inventario_con_unidades;
DROP VIEW IF EXISTS public.v_inventario_detallado;
DROP VIEW IF EXISTS public.v_movimientos_detallado;
DROP VIEW IF EXISTS public.v_bajas_productos_detalle;

CREATE VIEW public.v_bajas_productos_detalle
WITH (security_invoker = true)
AS
SELECT
  bp.id_baja,
  bp.id_producto,
  bp.id_entrada,
  bp.cantidad_baja,
  bp.motivo_baja,
  bp.fecha_baja,
  bp.observaciones,
  bp.estado_baja,
  bp.nombre_producto,
  bp.cantidad_disponible_antes,
  bp.created_at,
  bp.updated_at,
  u.id AS usuario_id,
  u.nombre AS usuario_nombre,
  u.email AS usuario_email,
  u.rol AS usuario_rol,
  d.id_deposito,
  d.nombre AS deposito_nombre,
  d.descripcion AS deposito_descripcion,
  p.descripcion AS producto_descripcion,
  e.fecha_vencimiento,
  un.nombre AS unidad_nombre,
  un.simbolo AS unidad_simbolo,
  e.donacion_id,
  e.donante_id
FROM public.bajas_productos bp
LEFT JOIN public.usuarios u ON u.id = bp.usuario_responsable_id
LEFT JOIN public.depositos d ON d.id_deposito = bp.id_deposito
LEFT JOIN public.productos_donados p ON p.id_producto = bp.id_producto
LEFT JOIN public.entradas_inventario e ON e.id_entrada = bp.id_entrada
LEFT JOIN public.unidades un ON un.id = COALESCE(e.unidad_id, p.unidad_id)
ORDER BY bp.fecha_baja DESC;

CREATE VIEW public.v_inventario_con_conversiones
WITH (security_invoker = true)
AS
SELECT
  e.id_entrada,
  e.id_deposito,
  d.nombre AS deposito,
  pd.id_producto,
  pd.nombre_producto,
  a.id AS alimento_id,
  a.nombre AS alimento,
  a.categoria,
  e.cantidad_disponible,
  u.id AS unidad_actual_id,
  u.nombre AS unidad_actual_nombre,
  u.simbolo AS unidad_actual_simbolo,
  u.tipo_magnitud_id,
  tm.nombre AS tipo_magnitud,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'unidad_id', au.unidad_id,
      'nombre', u2.nombre,
      'simbolo', u2.simbolo,
      'es_principal', au.es_unidad_principal
    ))
    FROM public.alimentos_unidades au
    JOIN public.unidades u2 ON au.unidad_id = u2.id
    WHERE au.alimento_id = a.id
  ) AS unidades_disponibles
FROM public.entradas_inventario e
JOIN public.depositos d ON e.id_deposito = d.id_deposito
JOIN public.productos_donados pd ON e.id_producto = pd.id_producto
LEFT JOIN public.alimentos a ON pd.alimento_id = a.id
LEFT JOIN public.unidades u ON u.id = COALESCE(e.unidad_id, pd.unidad_id)
LEFT JOIN public.tipos_magnitud tm ON u.tipo_magnitud_id = tm.id;

CREATE VIEW public.v_inventario_con_unidades
WITH (security_invoker = true)
AS
SELECT
  e.id_entrada,
  e.id_deposito,
  d.nombre AS deposito_nombre,
  e.id_producto,
  pd.nombre_producto,
  pd.alimento_id,
  a.nombre AS alimento_nombre,
  a.categoria AS alimento_categoria,
  e.cantidad_disponible,
  COALESCE(e.unidad_id, pd.unidad_id) AS unidad_id,
  u.nombre AS unidad_nombre,
  u.simbolo AS unidad_simbolo,
  e.fecha_vencimiento,
  e.fecha_ingreso,
  e.updated_at
FROM public.entradas_inventario e
JOIN public.depositos d ON e.id_deposito = d.id_deposito
JOIN public.productos_donados pd ON e.id_producto = pd.id_producto
LEFT JOIN public.alimentos a ON pd.alimento_id = a.id
LEFT JOIN public.unidades u ON u.id = COALESCE(e.unidad_id, pd.unidad_id);

CREATE VIEW public.v_inventario_detallado
WITH (security_invoker = true)
AS
SELECT
  e.id_entrada,
  e.id_deposito,
  d.nombre AS nombre_deposito,
  e.id_producto,
  pd.nombre_producto,
  pd.alimento_id,
  a.nombre AS nombre_alimento,
  a.categoria AS categoria_alimento,
  e.cantidad_disponible,
  COALESCE(e.unidad_id, pd.unidad_id) AS unidad_id,
  u.nombre AS unidad_nombre,
  u.simbolo AS unidad_simbolo,
  e.fecha_vencimiento,
  e.fecha_ingreso,
  e.updated_at
FROM public.entradas_inventario e
JOIN public.depositos d ON e.id_deposito = d.id_deposito
JOIN public.productos_donados pd ON e.id_producto = pd.id_producto
LEFT JOIN public.alimentos a ON pd.alimento_id = a.id
LEFT JOIN public.unidades u ON u.id = COALESCE(e.unidad_id, pd.unidad_id)
ORDER BY e.updated_at DESC;

CREATE VIEW public.v_movimientos_detallado
WITH (security_invoker = true)
AS
SELECT
  mic.id_movimiento,
  mic.fecha_movimiento,
  mic.estado_movimiento,
  mic.observaciones AS observaciones_cabecera,
  mid.id_detalle,
  mid.cantidad,
  mid.tipo_transaccion,
  mid.rol_usuario,
  mid.observacion_detalle,
  mid.id_producto,
  pd.nombre_producto,
  pd.alimento_id,
  a.nombre AS nombre_alimento,
  a.categoria AS categoria_alimento,
  COALESCE(mid.unidad_id, pd.unidad_id) AS unidad_id_utilizada,
  COALESCE(u_detalle.nombre, u_producto.nombre) AS unidad_nombre,
  COALESCE(u_detalle.simbolo, u_producto.simbolo) AS unidad_simbolo,
  udon.nombre AS nombre_donante,
  udon.rol AS rol_donante,
  usol.nombre AS nombre_solicitante,
  usol.rol AS rol_solicitante
FROM public.movimiento_inventario_cabecera mic
JOIN public.movimiento_inventario_detalle mid ON mic.id_movimiento = mid.id_movimiento
JOIN public.productos_donados pd ON mid.id_producto = pd.id_producto
LEFT JOIN public.alimentos a ON pd.alimento_id = a.id
LEFT JOIN public.unidades u_detalle ON mid.unidad_id = u_detalle.id
LEFT JOIN public.unidades u_producto ON pd.unidad_id = u_producto.id
LEFT JOIN public.usuarios udon ON mic.id_donante = udon.id
LEFT JOIN public.usuarios usol ON mic.id_solicitante = usol.id
ORDER BY mic.fecha_movimiento DESC;

GRANT SELECT ON public.v_bajas_productos_detalle TO app_user;
GRANT SELECT ON public.v_inventario_con_conversiones TO app_user;
GRANT SELECT ON public.v_inventario_con_unidades TO app_user;
GRANT SELECT ON public.v_inventario_detallado TO app_user;
GRANT SELECT ON public.v_movimientos_detallado TO app_user;
GRANT SELECT ON public.v_bajas_productos_detalle, public.v_inventario_con_conversiones, public.v_inventario_con_unidades, public.v_inventario_detallado, public.v_movimientos_detallado TO app_admin;
