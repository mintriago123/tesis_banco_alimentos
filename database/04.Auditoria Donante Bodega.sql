-- Auditoria donante-bodega
-- Ejecutar consultas una por una para revisar resultados.

-- 1) Productos potencialmente mezclados entre donantes
-- Misma combinacion (nombre normalizado + unidad) usada por varios donantes.
SELECT
  lower(trim(p.nombre_producto)) AS nombre_normalizado,
  p.unidad_id,
  COUNT(DISTINCT p.id_usuario) AS donantes_distintos,
  ARRAY_AGG(DISTINCT p.id_usuario) AS donantes,
  COUNT(*) AS filas_producto
FROM public.productos_donados p
WHERE p.id_usuario IS NOT NULL
GROUP BY lower(trim(p.nombre_producto)), p.unidad_id
HAVING COUNT(DISTINCT p.id_usuario) > 1
ORDER BY donantes_distintos DESC, nombre_normalizado;


-- 2) Inventario en bodega distinta a la principal del donante (solo productos trazables)
SELECT
  i.id_inventario,
  p.id_producto,
  p.id_usuario AS donante_id,
  p.nombre_producto,
  p.unidad_id,
  i.id_deposito AS deposito_actual,
  dd.id_deposito AS deposito_principal_donante,
  i.cantidad_disponible
FROM public.inventario i
JOIN public.productos_donados p ON p.id_producto = i.id_producto
JOIN public.donante_depositos dd
  ON dd.donante_id = p.id_usuario
 AND dd.activo = true
 AND dd.es_principal = true
WHERE p.id_usuario IS NOT NULL
  AND i.id_deposito <> dd.id_deposito
ORDER BY p.id_usuario, p.nombre_producto;


-- 3) Donantes con donaciones y sin mapeo activo en donante_depositos
SELECT DISTINCT
  d.user_id AS donante_id
FROM public.donaciones d
LEFT JOIN public.donante_depositos dd
  ON dd.donante_id = d.user_id
 AND dd.activo = true
WHERE d.user_id IS NOT NULL
  AND dd.id IS NULL
ORDER BY d.user_id;


-- 4) Donantes con mas de una bodega principal activa (no deberia pasar)
SELECT
  dd.donante_id,
  COUNT(*) AS principales_activas,
  ARRAY_AGG(dd.id_deposito) AS depositos
FROM public.donante_depositos dd
WHERE dd.activo = true
  AND dd.es_principal = true
GROUP BY dd.donante_id
HAVING COUNT(*) > 1
ORDER BY principales_activas DESC;


-- 5) Productos no trazables a donante (id_usuario NULL)
SELECT
  p.id_producto,
  p.nombre_producto,
  p.unidad_id,
  p.cantidad,
  p.fecha_donacion
FROM public.productos_donados p
WHERE p.id_usuario IS NULL
ORDER BY p.fecha_donacion DESC NULLS LAST;


-- 6) Inventario de productos no trazables (alto riesgo de mezcla historica)
SELECT
  i.id_inventario,
  i.id_deposito,
  i.id_producto,
  p.nombre_producto,
  p.unidad_id,
  i.cantidad_disponible,
  i.fecha_actualizacion
FROM public.inventario i
JOIN public.productos_donados p ON p.id_producto = i.id_producto
WHERE p.id_usuario IS NULL
ORDER BY i.fecha_actualizacion DESC NULLS LAST;


-- 7) Resumen por donante: bodega principal y cantidad total de inventario trazable
SELECT
  dd.donante_id,
  dd.id_deposito AS deposito_principal,
  COUNT(DISTINCT i.id_producto) AS productos_distintos,
  COALESCE(SUM(i.cantidad_disponible), 0) AS cantidad_total
FROM public.donante_depositos dd
LEFT JOIN public.productos_donados p
  ON p.id_usuario = dd.donante_id
LEFT JOIN public.inventario i
  ON i.id_producto = p.id_producto
 AND i.id_deposito = dd.id_deposito
WHERE dd.activo = true
  AND dd.es_principal = true
GROUP BY dd.donante_id, dd.id_deposito
ORDER BY cantidad_total DESC;
