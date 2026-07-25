BEGIN;

-- La tabla de entradas es la fuente única. Si los saldos históricos no
-- coinciden, detener la migración evita perder información al retirar legacy.
DO $$
DECLARE
  v_mismatches bigint;
BEGIN
  SELECT count(*)
  INTO v_mismatches
  FROM (
    SELECT i.id_deposito, i.id_producto, i.cantidad_disponible,
           COALESCE(sum(e.cantidad_disponible) FILTER (WHERE e.estado = 'disponible'), 0) AS entradas_disponibles
    FROM public.inventario i
    LEFT JOIN public.entradas_inventario e
      ON e.id_deposito = i.id_deposito
     AND e.id_producto = i.id_producto
    GROUP BY i.id_deposito, i.id_producto, i.cantidad_disponible
    HAVING i.cantidad_disponible <> COALESCE(
      sum(e.cantidad_disponible) FILTER (WHERE e.estado = 'disponible'), 0
    )
  ) diferencias;

  IF v_mismatches > 0 THEN
    RAISE EXCEPTION 'No se puede retirar inventario legacy: % diferencias de saldo', v_mismatches;
  END IF;
END;
$$;

-- Completar la unidad de entradas históricas cuando el catálogo todavía la
-- conserva. Las entradas sin unidad siguen identificadas como legacy y no se
-- pueden mezclar con operaciones nuevas hasta ser regularizadas.
UPDATE public.entradas_inventario e
SET unidad_id = p.unidad_id,
    updated_at = now()
FROM public.productos_donados p
WHERE p.id_producto = e.id_producto
  AND e.unidad_id IS NULL
  AND p.unidad_id IS NOT NULL;

-- El trigger conserva cada donación como una entrada independiente. El
-- catálogo solo aporta identidad y nunca vuelve a acumular cantidades.
CREATE OR REPLACE FUNCTION public.crear_producto_desde_donacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_producto_id uuid;
  v_deposito_id uuid;
BEGIN
  IF NOT (
    (TG_OP = 'INSERT' AND NEW.estado = 'Aprobada') OR
    (TG_OP = 'UPDATE' AND NEW.estado = 'Aprobada' AND COALESCE(OLD.estado, '') <> 'Aprobada')
  ) THEN
    RETURN NEW;
  END IF;

  SELECT dd.id_deposito
  INTO v_deposito_id
  FROM public.donante_depositos dd
  JOIN public.depositos d ON d.id_deposito = dd.id_deposito
  WHERE dd.donante_id = NEW.user_id
    AND dd.activo IS TRUE
    AND dd.es_principal IS TRUE
    AND d.activo IS TRUE
  ORDER BY dd.created_at ASC
  LIMIT 1;

  IF v_deposito_id IS NULL THEN
    RAISE EXCEPTION 'El donante no tiene una bodega principal activa';
  END IF;

  SELECT p.id_producto
  INTO v_producto_id
  FROM public.productos_donados p
  WHERE lower(trim(p.nombre_producto)) = lower(trim(NEW.tipo_producto))
    AND p.unidad_id = NEW.unidad_id
    AND p.id_usuario = NEW.user_id
  ORDER BY p.id_producto
  LIMIT 1;

  IF v_producto_id IS NULL THEN
    INSERT INTO public.productos_donados (
      id_usuario,
      nombre_producto,
      descripcion,
      fecha_donacion,
      alimento_id,
      unidad_id
    )
    VALUES (
      NEW.user_id,
      NEW.tipo_producto,
      NEW.observaciones,
      COALESCE(NEW.creado_en, now()),
      NEW.alimento_id,
      NEW.unidad_id
    )
    RETURNING id_producto INTO v_producto_id;
  END IF;

  INSERT INTO public.entradas_inventario (
    donacion_id,
    donante_id,
    id_deposito,
    id_producto,
    unidad_id,
    cantidad_original,
    cantidad_disponible,
    fecha_vencimiento,
    estado,
    es_legacy
  )
  VALUES (
    NEW.id,
    NEW.user_id,
    v_deposito_id,
    v_producto_id,
    NEW.unidad_id,
    NEW.cantidad,
    NEW.cantidad,
    NEW.fecha_vencimiento,
    'disponible',
    false
  )
  ON CONFLICT (donacion_id) WHERE donacion_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

-- Descuento FEFO atómico directamente sobre las entradas seleccionadas.
CREATE OR REPLACE FUNCTION public.descontar_stock_por_lote(
  p_id_deposito uuid,
  p_id_producto uuid,
  p_cantidad numeric,
  p_unidad_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_rol text;
  v_unidad_producto bigint;
  v_nombre_origen text;
  v_nombre_destino text;
  v_resolucion jsonb;
  v_factor numeric;
  v_requerida numeric;
  v_disponible numeric;
  v_restante numeric;
  v_consumo numeric;
  v_detalle jsonb := '[]'::jsonb;
  v_unidad_fraccionable boolean;
  entrada record;
BEGIN
  SELECT rol INTO v_rol
  FROM public.usuarios
  WHERE id = (SELECT auth.uid())
    AND estado = 'activo';

  IF v_rol IS NULL OR v_rol NOT IN ('ADMINISTRADOR', 'OPERADOR') THEN
    RAISE EXCEPTION 'Solo un administrador u operador activo puede descontar inventario';
  END IF;

  IF p_id_deposito IS NULL OR p_id_producto IS NULL OR p_unidad_id IS NULL
     OR p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Los datos del descuento son obligatorios y deben ser positivos';
  END IF;

  SELECT unidad_id INTO v_unidad_producto
  FROM public.productos_donados
  WHERE id_producto = p_id_producto;

  IF v_unidad_producto IS NULL THEN
    RAISE EXCEPTION 'El producto no tiene unidad configurada';
  END IF;

  SELECT nombre INTO v_nombre_origen FROM public.unidades WHERE id = p_unidad_id;
  SELECT nombre INTO v_nombre_destino FROM public.unidades WHERE id = v_unidad_producto;
  SELECT permite_fraccion INTO v_unidad_fraccionable
  FROM public.unidades
  WHERE id = p_unidad_id AND activa IS TRUE;

  IF v_nombre_origen IS NULL OR v_nombre_destino IS NULL OR v_unidad_fraccionable IS NULL THEN
    RAISE EXCEPTION 'La unidad del descuento no existe o está inactiva';
  END IF;

  IF NOT v_unidad_fraccionable AND p_cantidad <> trunc(p_cantidad) THEN
    RAISE EXCEPTION 'La unidad % no permite cantidades decimales', v_nombre_origen;
  END IF;

  v_resolucion := public.resolver_conversion(p_unidad_id, v_unidad_producto);
  IF v_resolucion ->> 'convertible' <> 'true' THEN
    RAISE EXCEPTION 'No existe conversión entre % y % para esta operación', v_nombre_origen, v_nombre_destino;
  END IF;

  v_factor := (v_resolucion ->> 'factor')::numeric;
  v_requerida := p_cantidad * v_factor;

  SELECT COALESCE(sum(e.cantidad_disponible), 0)
  INTO v_disponible
  FROM public.entradas_inventario e
  WHERE e.id_deposito = p_id_deposito
    AND e.id_producto = p_id_producto
    AND e.unidad_id = v_unidad_producto
    AND e.estado = 'disponible'
    AND e.cantidad_disponible > 0;

  IF v_disponible < v_requerida THEN
    RAISE EXCEPTION 'Stock insuficiente para la operación';
  END IF;

  v_restante := v_requerida;
  FOR entrada IN
    SELECT e.id_entrada, e.cantidad_disponible
    FROM public.entradas_inventario e
    WHERE e.id_deposito = p_id_deposito
      AND e.id_producto = p_id_producto
      AND e.unidad_id = v_unidad_producto
      AND e.estado = 'disponible'
      AND e.cantidad_disponible > 0
    ORDER BY e.fecha_vencimiento ASC NULLS LAST, e.fecha_ingreso ASC, e.id_entrada ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_restante <= 0;
    v_consumo := LEAST(v_restante, entrada.cantidad_disponible);

    UPDATE public.entradas_inventario
    SET cantidad_disponible = cantidad_disponible - v_consumo,
        estado = CASE WHEN cantidad_disponible - v_consumo = 0 THEN 'agotado' ELSE 'disponible' END,
        updated_at = now()
    WHERE id_entrada = entrada.id_entrada;

    v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
      'idEntrada', entrada.id_entrada,
      'idDeposito', p_id_deposito,
      'cantidad', v_consumo,
      'cantidadOriginal', v_consumo / v_factor,
      'unidadOriginalId', p_unidad_id,
      'unidadConvertidaId', v_unidad_producto
    ));
    v_restante := v_restante - v_consumo;
  END LOOP;

  RETURN jsonb_build_object(
    'cantidadRestante', 0,
    'cantidadConsumida', p_cantidad,
    'cantidadConvertida', v_requerida,
    'detalles', v_detalle
  );
END;
$$;

-- Las reversiones reciben la entrada exacta que fue descontada.
CREATE OR REPLACE FUNCTION public.restaurar_entrada_inventario(
  p_id_entrada uuid,
  p_cantidad numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_rol text;
  v_entrada public.entradas_inventario%ROWTYPE;
  v_cantidad_restaurada numeric;
BEGIN
  SELECT rol INTO v_rol
  FROM public.usuarios
  WHERE id = (SELECT auth.uid())
    AND estado = 'activo';

  IF v_rol IS NULL OR v_rol NOT IN ('ADMINISTRADOR', 'OPERADOR') THEN
    RAISE EXCEPTION 'Solo un administrador u operador activo puede restaurar inventario';
  END IF;

  IF p_id_entrada IS NULL OR p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'Los datos de restauración son inválidos';
  END IF;

  SELECT * INTO v_entrada
  FROM public.entradas_inventario
  WHERE id_entrada = p_id_entrada
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La entrada de inventario no existe';
  END IF;

  v_cantidad_restaurada := LEAST(
    v_entrada.cantidad_original,
    v_entrada.cantidad_disponible + p_cantidad
  ) - v_entrada.cantidad_disponible;

  IF v_cantidad_restaurada <= 0 THEN
    RETURN true;
  END IF;

  UPDATE public.entradas_inventario
  SET cantidad_disponible = cantidad_disponible + v_cantidad_restaurada,
      estado = 'disponible',
      updated_at = now()
  WHERE id_entrada = p_id_entrada;

  RETURN true;
END;
$$;

-- Reemplazar la firma que recibía id_inventario por la entrada explícita.
DROP FUNCTION IF EXISTS public.dar_baja_producto(uuid, numeric, text, uuid, text);
DROP FUNCTION IF EXISTS public.dar_baja_producto(uuid, numeric, text, uuid, text, uuid);

-- La vista anterior todavía exponía id_inventario; retirarla antes de quitar
-- la columna para que PostgreSQL no conserve una dependencia legacy.
DROP VIEW IF EXISTS public.v_bajas_productos_detalle;

ALTER TABLE public.bajas_productos
  DROP COLUMN IF EXISTS id_inventario;

CREATE OR REPLACE FUNCTION public.dar_baja_producto(
  p_id_entrada uuid,
  p_cantidad numeric,
  p_motivo text,
  p_usuario_id uuid,
  p_observaciones text DEFAULT NULL
)
RETURNS TABLE(success boolean, message text, id_baja uuid, cantidad_restante numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rol text;
  v_entrada public.entradas_inventario%ROWTYPE;
  v_nombre_producto text;
  v_nueva_cantidad numeric;
  v_id_baja uuid;
  v_id_movimiento uuid;
  v_unidad_id bigint;
BEGIN
  IF p_usuario_id IS NULL THEN
    RETURN QUERY SELECT false, 'Usuario responsable inválido', NULL::uuid, NULL::numeric;
    RETURN;
  END IF;

  SELECT rol INTO v_rol
  FROM public.usuarios
  WHERE id = p_usuario_id AND estado = 'activo';

  IF v_rol NOT IN ('ADMINISTRADOR', 'OPERADOR') THEN
    RETURN QUERY SELECT false, 'Solo administradores u operadores activos pueden registrar bajas', NULL::uuid, NULL::numeric;
    RETURN;
  END IF;

  IF p_motivo NOT IN ('vencido', 'dañado', 'contaminado', 'rechazado', 'otro')
     OR p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RETURN QUERY SELECT false, 'Datos de baja inválidos', NULL::uuid, NULL::numeric;
    RETURN;
  END IF;

  SELECT * INTO v_entrada
  FROM public.entradas_inventario
  WHERE id_entrada = p_id_entrada
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Entrada de inventario no encontrada', NULL::uuid, NULL::numeric;
    RETURN;
  END IF;

  IF v_entrada.estado <> 'disponible' OR v_entrada.cantidad_disponible < p_cantidad THEN
    RETURN QUERY SELECT false, 'Cantidad insuficiente en la entrada seleccionada', NULL::uuid, v_entrada.cantidad_disponible;
    RETURN;
  END IF;

  SELECT nombre_producto, unidad_id
  INTO v_nombre_producto, v_unidad_id
  FROM public.productos_donados
  WHERE id_producto = v_entrada.id_producto;

  v_nueva_cantidad := v_entrada.cantidad_disponible - p_cantidad;

  UPDATE public.entradas_inventario
  SET cantidad_disponible = v_nueva_cantidad,
      estado = CASE WHEN v_nueva_cantidad = 0 THEN 'agotado' ELSE 'disponible' END,
      updated_at = now()
  WHERE id_entrada = p_id_entrada;

  INSERT INTO public.bajas_productos (
    id_producto,
    id_entrada,
    cantidad_baja,
    motivo_baja,
    usuario_responsable_id,
    observaciones,
    nombre_producto,
    cantidad_disponible_antes,
    id_deposito,
    estado_baja
  )
  VALUES (
    v_entrada.id_producto,
    v_entrada.id_entrada,
    p_cantidad,
    p_motivo,
    p_usuario_id,
    p_observaciones,
    v_nombre_producto,
    v_entrada.cantidad_disponible,
    v_entrada.id_deposito,
    'confirmada'
  )
  RETURNING public.bajas_productos.id_baja INTO v_id_baja;

  INSERT INTO public.movimiento_inventario_cabecera (
    id_donante,
    id_solicitante,
    estado_movimiento,
    observaciones
  )
  VALUES (
    p_usuario_id,
    p_usuario_id,
    'completado',
    'Baja de producto - Motivo: ' || p_motivo
  )
  RETURNING id_movimiento INTO v_id_movimiento;

  INSERT INTO public.movimiento_inventario_detalle (
    id_movimiento,
    id_producto,
    cantidad,
    tipo_transaccion,
    rol_usuario,
    observacion_detalle,
    unidad_id,
    unidad_convertida_id,
    id_entrada,
    id_deposito
  )
  VALUES (
    v_id_movimiento,
    v_entrada.id_producto,
    p_cantidad,
    'baja',
    'distribuidor',
    p_observaciones,
    COALESCE(v_entrada.unidad_id, v_unidad_id),
    COALESCE(v_entrada.unidad_id, v_unidad_id),
    v_entrada.id_entrada,
    v_entrada.id_deposito
  );

  RETURN QUERY SELECT true, 'Producto dado de baja exitosamente', v_id_baja, v_nueva_cantidad;
END;
$$;

ALTER FUNCTION public.dar_baja_producto(uuid, numeric, text, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dar_baja_producto(uuid, numeric, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dar_baja_producto(uuid, numeric, text, uuid, text)
  TO service_role;

-- Las alertas consultan vencimiento y saldo de cada entrada, no del catálogo.
DROP FUNCTION IF EXISTS public.obtener_productos_proximos_vencer(integer);
CREATE FUNCTION public.obtener_productos_proximos_vencer(p_dias_umbral integer)
RETURNS TABLE(
  id_entrada uuid,
  id_producto uuid,
  nombre_producto text,
  cantidad_disponible numeric,
  fecha_caducidad date,
  dias_para_vencer integer,
  id_deposito uuid,
  nombre_deposito text,
  unidad_simbolo text,
  prioridad text
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    e.id_entrada,
    e.id_producto,
    p.nombre_producto,
    e.cantidad_disponible,
    e.fecha_vencimiento,
    (e.fecha_vencimiento - CURRENT_DATE)::integer,
    e.id_deposito,
    d.nombre,
    u.simbolo,
    CASE
      WHEN e.fecha_vencimiento < CURRENT_DATE THEN 'vencido'
      WHEN e.fecha_vencimiento - CURRENT_DATE <= 3 THEN 'alta'
      WHEN e.fecha_vencimiento - CURRENT_DATE <= p_dias_umbral THEN 'media'
      ELSE 'baja'
    END
  FROM public.entradas_inventario e
  JOIN public.productos_donados p ON p.id_producto = e.id_producto
  JOIN public.depositos d ON d.id_deposito = e.id_deposito
  LEFT JOIN public.unidades u ON u.id = COALESCE(e.unidad_id, p.unidad_id)
  WHERE e.fecha_vencimiento IS NOT NULL
    AND e.estado = 'disponible'
    AND e.cantidad_disponible > 0
    AND e.fecha_vencimiento <= CURRENT_DATE + p_dias_umbral
  ORDER BY e.fecha_vencimiento ASC, e.fecha_ingreso ASC, e.id_entrada ASC;
$$;

-- Mantener el contrato informativo, calculando el total desde las entradas.
CREATE OR REPLACE FUNCTION public.obtener_info_producto_inventario(p_id_producto uuid)
RETURNS TABLE(
  nombre_producto text,
  alimento_nombre text,
  categoria text,
  unidad_nombre text,
  unidad_simbolo text,
  cantidad_total numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pd.nombre_producto,
    a.nombre,
    a.categoria,
    u.nombre,
    u.simbolo,
    COALESCE(SUM(e.cantidad_disponible) FILTER (WHERE e.estado = 'disponible'), 0)
  FROM public.productos_donados pd
  LEFT JOIN public.alimentos a ON pd.alimento_id = a.id
  LEFT JOIN public.unidades u ON u.id = pd.unidad_id
  LEFT JOIN public.entradas_inventario e ON pd.id_producto = e.id_producto
  WHERE pd.id_producto = p_id_producto
  GROUP BY pd.nombre_producto, a.nombre, a.categoria, u.nombre, u.simbolo;
END;
$$;

-- Los wrappers no tienen consumidores internos ni externos conocidos; la RPC
-- resolver_conversion queda como única autoridad de equivalencias.
DROP FUNCTION IF EXISTS public.convertir_cantidad(numeric, bigint, bigint);
DROP FUNCTION IF EXISTS public.registrar_movimiento_con_unidad(uuid, uuid, numeric, text, bigint, text);

-- Recrear vistas legacy con la misma intención, pero con id_entrada y sin
-- columnas del catálogo que ya no representan stock.
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

GRANT SELECT ON public.v_bajas_productos_detalle TO authenticated;
GRANT SELECT ON public.v_inventario_con_conversiones TO authenticated;
GRANT SELECT ON public.v_inventario_con_unidades TO authenticated;
GRANT SELECT ON public.v_inventario_detallado TO authenticated;
GRANT SELECT ON public.v_movimientos_detallado TO authenticated;

-- Una vez que funciones, vistas y consumidores apuntan a entradas, retirar
-- físicamente los saldos agregados y los campos de catálogo legacy.
ALTER TABLE public.productos_donados
  DROP COLUMN IF EXISTS cantidad,
  DROP COLUMN IF EXISTS unidad_medida;

DROP TABLE IF EXISTS public.inventario;

COMMIT;
