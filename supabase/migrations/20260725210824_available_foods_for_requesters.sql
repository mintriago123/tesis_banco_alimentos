BEGIN;

-- Expone solo el catálogo de alimentos que tiene stock. La consulta se ejecuta
-- con privilegios del propietario para no abrir productos_donados completo a
-- SOLICITANTE, pero exige un usuario autenticado y activo.
CREATE OR REPLACE FUNCTION public.obtener_alimentos_con_stock()
RETURNS TABLE (
  id bigint,
  nombre text,
  categoria text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT
    a.id,
    a.nombre,
    COALESCE(a.categoria, '') AS categoria
  FROM public.entradas_inventario AS e
  JOIN public.productos_donados AS pd ON pd.id_producto = e.id_producto
  JOIN public.alimentos AS a ON a.id = pd.alimento_id
  JOIN public.usuarios AS u ON u.id = (SELECT auth.uid())
  WHERE u.estado = 'activo'
    AND e.estado = 'disponible'
    AND e.cantidad_disponible > 0
  ORDER BY a.nombre;
$$;

ALTER FUNCTION public.obtener_alimentos_con_stock() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.obtener_alimentos_con_stock() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_alimentos_con_stock() TO authenticated;

COMMIT;
