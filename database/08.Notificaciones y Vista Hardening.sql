BEGIN;

-- Rehacer la vista para que respete permisos y RLS del invocador.
DROP VIEW IF EXISTS public.v_bajas_productos_detalle;

CREATE VIEW public.v_bajas_productos_detalle
WITH (security_invoker = true) AS
SELECT
  bp.id_baja,
  bp.id_producto,
  bp.id_inventario,
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
  p.unidad_medida,
  p.fecha_caducidad,
  un.nombre AS unidad_nombre,
  un.simbolo AS unidad_simbolo
FROM public.bajas_productos bp
LEFT JOIN public.usuarios u ON u.id = bp.usuario_responsable_id
LEFT JOIN public.depositos d ON d.id_deposito = bp.id_deposito
LEFT JOIN public.productos_donados p ON p.id_producto = bp.id_producto
LEFT JOIN public.unidades un ON un.id = p.unidad_id
ORDER BY bp.fecha_baja DESC;

REVOKE ALL ON TABLE public.v_bajas_productos_detalle FROM PUBLIC;
REVOKE ALL ON TABLE public.v_bajas_productos_detalle FROM anon;
GRANT SELECT ON TABLE public.v_bajas_productos_detalle TO authenticated;
GRANT SELECT ON TABLE public.v_bajas_productos_detalle TO service_role;

-- Consolidar políticas de notificaciones y quitar exposición pública heredada.
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notificaciones;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notificaciones;
DROP POLICY IF EXISTS notificaciones_insert_authenticated ON public.notificaciones;

CREATE POLICY notificaciones_insert_staff
  ON public.notificaciones
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios
      WHERE usuarios.id = auth.uid()
        AND usuarios.rol = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
        AND usuarios.estado = 'activo'
    )
  );

REVOKE ALL ON TABLE public.notificaciones FROM anon;

COMMIT;
