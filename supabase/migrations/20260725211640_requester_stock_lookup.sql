BEGIN;

-- Devuelve únicamente el stock operativo necesario para una solicitud.
-- No expone filas completas de productos_donados a SOLICITANTE.
CREATE OR REPLACE FUNCTION public.obtener_stock_por_producto(p_nombre_producto text)
RETURNS TABLE (
  id_entrada uuid,
  id_deposito uuid,
  cantidad_disponible numeric,
  fecha_ingreso timestamptz,
  unidad_id bigint,
  unidad_nombre text,
  unidad_simbolo text,
  deposito text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    e.id_entrada,
    e.id_deposito,
    e.cantidad_disponible,
    e.fecha_ingreso,
    COALESCE(e.unidad_id, pd.unidad_id) AS unidad_id,
    u.nombre AS unidad_nombre,
    u.simbolo AS unidad_simbolo,
    d.nombre AS deposito
  FROM public.entradas_inventario AS e
  JOIN public.productos_donados AS pd ON pd.id_producto = e.id_producto
  JOIN public.depositos AS d ON d.id_deposito = e.id_deposito
  JOIN public.unidades AS u ON u.id = COALESCE(e.unidad_id, pd.unidad_id)
  JOIN public.usuarios AS requester ON requester.id = (SELECT auth.uid())
  WHERE requester.estado = 'activo'
    AND e.estado = 'disponible'
    AND e.cantidad_disponible > 0
    AND NULLIF(btrim(COALESCE(p_nombre_producto, '')), '') IS NOT NULL
    AND pd.nombre_producto ILIKE '%' || replace(
      replace(replace(btrim(p_nombre_producto), '\', '\\'), '%', '\%'),
      '_', '\_'
    ) || '%' ESCAPE '\'
  ORDER BY e.cantidad_disponible DESC;
$$;

ALTER FUNCTION public.obtener_stock_por_producto(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.obtener_stock_por_producto(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_stock_por_producto(text) TO authenticated;

COMMIT;
