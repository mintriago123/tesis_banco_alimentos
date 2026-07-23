BEGIN;

-- Una bodega del donante conserva su propia ubicación. La relación
-- donante_depositos sigue siendo la autoridad para saber quién la administra.
ALTER TABLE public.depositos
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS latitud double precision,
  ADD COLUMN IF NOT EXISTS longitud double precision,
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

UPDATE public.depositos d
SET direccion = u.direccion,
    latitud = u.latitud,
    longitud = u.longitud
FROM public.donante_depositos dd
JOIN public.usuarios u ON u.id = dd.donante_id
WHERE dd.id_deposito = d.id_deposito
  AND dd.es_principal IS TRUE
  AND d.direccion IS NULL;

CREATE TABLE IF NOT EXISTS public.entradas_inventario (
  id_entrada uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donacion_id integer REFERENCES public.donaciones(id) ON DELETE SET NULL,
  donante_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  id_deposito uuid NOT NULL REFERENCES public.depositos(id_deposito) ON DELETE RESTRICT,
  id_producto uuid NOT NULL REFERENCES public.productos_donados(id_producto) ON DELETE RESTRICT,
  unidad_id bigint REFERENCES public.unidades(id),
  cantidad_original numeric NOT NULL CHECK (cantidad_original > 0),
  cantidad_disponible numeric NOT NULL CHECK (cantidad_disponible >= 0),
  fecha_vencimiento date,
  fecha_ingreso timestamptz NOT NULL DEFAULT now(),
  estado text NOT NULL DEFAULT 'disponible'
    CHECK (estado IN ('disponible', 'agotado', 'cancelado')),
  es_legacy boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entradas_cantidad_disponible_maxima
    CHECK (cantidad_disponible <= cantidad_original),
  CONSTRAINT entradas_unidad_nueva_obligatoria
    CHECK (es_legacy OR unidad_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS entradas_inventario_donacion_unica
  ON public.entradas_inventario(donacion_id)
  WHERE donacion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS entradas_inventario_stock_idx
  ON public.entradas_inventario(id_deposito, id_producto, cantidad_disponible);

CREATE INDEX IF NOT EXISTS entradas_inventario_fefo_idx
  ON public.entradas_inventario(
    id_deposito,
    id_producto,
    fecha_vencimiento,
    fecha_ingreso
  )
  WHERE cantidad_disponible > 0 AND estado = 'disponible';

ALTER TABLE public.movimiento_inventario_detalle
  ADD COLUMN IF NOT EXISTS id_entrada uuid
    REFERENCES public.entradas_inventario(id_entrada) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS id_deposito uuid
    REFERENCES public.depositos(id_deposito) ON DELETE SET NULL;

ALTER TABLE public.bajas_productos
  ADD COLUMN IF NOT EXISTS id_entrada uuid
    REFERENCES public.entradas_inventario(id_entrada) ON DELETE SET NULL;

-- El inventario existente se conserva como saldo histórico. No se inventa una
-- donación de origen: cada saldo se convierte en una entrada legacy.
INSERT INTO public.entradas_inventario (
  donante_id,
  id_deposito,
  id_producto,
  unidad_id,
  cantidad_original,
  cantidad_disponible,
  fecha_ingreso,
  estado,
  es_legacy
)
SELECT
  p.id_usuario,
  i.id_deposito,
  i.id_producto,
  p.unidad_id,
  i.cantidad_disponible,
  i.cantidad_disponible,
  COALESCE(i.fecha_actualizacion::timestamptz, now()),
  'disponible',
  true
FROM public.inventario i
JOIN public.productos_donados p ON p.id_producto = i.id_producto
WHERE i.cantidad_disponible > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.entradas_inventario e
    WHERE e.id_deposito = i.id_deposito
      AND e.id_producto = i.id_producto
      AND e.es_legacy IS TRUE
  );

ALTER TABLE public.entradas_inventario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entradas_inventario_select_active ON public.entradas_inventario;
CREATE POLICY entradas_inventario_select_active
  ON public.entradas_inventario
  FOR SELECT
  TO authenticated
  USING ((SELECT private_auth.current_user_estado()) = 'activo');

DROP POLICY IF EXISTS entradas_inventario_insert_staff ON public.entradas_inventario;
CREATE POLICY entradas_inventario_insert_staff
  ON public.entradas_inventario
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
    AND (SELECT private_auth.current_user_estado()) = 'activo'
  );

DROP POLICY IF EXISTS entradas_inventario_update_staff ON public.entradas_inventario;
CREATE POLICY entradas_inventario_update_staff
  ON public.entradas_inventario
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
    AND (SELECT private_auth.current_user_estado()) = 'activo'
  )
  WITH CHECK (
    (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
    AND (SELECT private_auth.current_user_estado()) = 'activo'
  );

DROP POLICY IF EXISTS entradas_inventario_delete_admin ON public.entradas_inventario;
CREATE POLICY entradas_inventario_delete_admin
  ON public.entradas_inventario
  FOR DELETE
  TO authenticated
  USING (
    (SELECT private_auth.current_user_role()) = 'ADMINISTRADOR'
    AND (SELECT private_auth.current_user_estado()) = 'activo'
  );

-- La creación desde el primer perfil no expone INSERT directo sobre depósitos.
-- La función es idempotente para evitar duplicados por doble envío del formulario.
CREATE OR REPLACE FUNCTION public.crear_bodega_principal_donante(
  p_nombre text DEFAULT NULL,
  p_descripcion text DEFAULT NULL
)
RETURNS TABLE (
  id_deposito uuid,
  nombre text,
  descripcion text,
  direccion text,
  latitud double precision,
  longitud double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_nombre_usuario text;
  v_direccion text;
  v_latitud double precision;
  v_longitud double precision;
  v_deposito_id uuid;
  v_nombre text;
  v_descripcion text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  SELECT nombre, direccion, latitud, longitud
  INTO v_nombre_usuario, v_direccion, v_latitud, v_longitud
  FROM public.usuarios
  WHERE id = v_user_id
    AND rol = 'DONANTE'
    AND estado = 'activo';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo un donante activo puede crear su bodega';
  END IF;

  SELECT dd.id_deposito
  INTO v_deposito_id
  FROM public.donante_depositos dd
  WHERE dd.donante_id = v_user_id
    AND dd.activo IS TRUE
    AND dd.es_principal IS TRUE
  ORDER BY dd.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_deposito_id IS NULL THEN
    v_nombre := COALESCE(NULLIF(trim(p_nombre), ''), 'Bodega de ' || COALESCE(NULLIF(trim(v_nombre_usuario), ''), 'donante'));
    v_descripcion := COALESCE(NULLIF(trim(p_descripcion), ''), 'Bodega principal del donante');

    INSERT INTO public.depositos (nombre, descripcion, direccion, latitud, longitud, activo)
    VALUES (v_nombre, v_descripcion, v_direccion, v_latitud, v_longitud, true)
    RETURNING public.depositos.id_deposito INTO v_deposito_id;

    INSERT INTO public.donante_depositos (donante_id, id_deposito, es_principal, activo)
    VALUES (v_user_id, v_deposito_id, true, true);
  END IF;

  RETURN QUERY
  SELECT d.id_deposito, d.nombre, d.descripcion, d.direccion, d.latitud, d.longitud
  FROM public.depositos d
  WHERE d.id_deposito = v_deposito_id
    AND d.activo IS TRUE;
END;
$$;

ALTER FUNCTION public.crear_bodega_principal_donante(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.crear_bodega_principal_donante(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_bodega_principal_donante(text, text) TO authenticated;

-- El trigger deja de enviar donaciones a un depósito arbitrario. La entrada es
-- creada una sola vez por donación y luego se actualiza el saldo agregado legacy.
CREATE OR REPLACE FUNCTION public.crear_producto_desde_donacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_producto_id uuid;
  v_deposito_id uuid;
  v_entrada_id uuid;
  v_producto_existia boolean := false;
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

  SELECT id_producto
  INTO v_producto_id
  FROM public.productos_donados
  WHERE lower(trim(nombre_producto)) = lower(trim(NEW.tipo_producto))
    AND unidad_id = NEW.unidad_id
    AND id_usuario = NEW.user_id
  LIMIT 1;

  IF v_producto_id IS NULL THEN
    INSERT INTO public.productos_donados (
      id_usuario, nombre_producto, descripcion, cantidad, unidad_medida,
      fecha_caducidad, alimento_id, unidad_id
    )
    VALUES (
      NEW.user_id, NEW.tipo_producto, NEW.observaciones, NEW.cantidad,
      NEW.unidad_nombre, NEW.fecha_vencimiento, NEW.alimento_id, NEW.unidad_id
    )
    RETURNING id_producto INTO v_producto_id;
  ELSE
    v_producto_existia := true;
  END IF;

  INSERT INTO public.entradas_inventario (
    donacion_id, donante_id, id_deposito, id_producto, unidad_id,
    cantidad_original, cantidad_disponible, fecha_vencimiento, estado, es_legacy
  )
  VALUES (
    NEW.id, NEW.user_id, v_deposito_id, v_producto_id, NEW.unidad_id,
    NEW.cantidad, NEW.cantidad, NEW.fecha_vencimiento, 'disponible', false
  )
  ON CONFLICT DO NOTHING
  RETURNING id_entrada INTO v_entrada_id;

  -- Si el trigger recibe nuevamente la misma donación, no duplica el saldo.
  IF v_entrada_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_producto_existia THEN
    UPDATE public.productos_donados
    SET cantidad = COALESCE(cantidad, 0) + NEW.cantidad
    WHERE id_producto = v_producto_id;
  END IF;

  INSERT INTO public.inventario (id_deposito, id_producto, cantidad_disponible)
  VALUES (v_deposito_id, v_producto_id, NEW.cantidad)
  ON CONFLICT (id_deposito, id_producto)
  DO UPDATE SET
    cantidad_disponible = public.inventario.cantidad_disponible + EXCLUDED.cantidad_disponible,
    fecha_actualizacion = now();

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.crear_producto_desde_donacion() OWNER TO postgres;
DROP TRIGGER IF EXISTS trigger_crear_producto ON public.donaciones;
CREATE TRIGGER trigger_crear_producto
AFTER INSERT OR UPDATE ON public.donaciones
FOR EACH ROW EXECUTE FUNCTION public.crear_producto_desde_donacion();

-- Descuento FEFO atómico. La función valida autorización, conversión,
-- disponibilidad total y actualiza entrada + saldo agregado en una transacción.
CREATE OR REPLACE FUNCTION public.descontar_stock_por_lote(
  p_id_deposito uuid,
  p_id_producto uuid,
  p_cantidad numeric,
  p_unidad_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

  IF p_id_deposito IS NULL OR p_id_producto IS NULL OR p_unidad_id IS NULL OR p_cantidad IS NULL OR p_cantidad <= 0 THEN
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
  SELECT permite_fraccion INTO v_unidad_fraccionable FROM public.unidades WHERE id = p_unidad_id AND activa IS TRUE;

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

  SELECT COALESCE(sum(cantidad_disponible), 0)
  INTO v_disponible
  FROM public.entradas_inventario
  WHERE id_deposito = p_id_deposito
    AND id_producto = p_id_producto
    AND unidad_id = v_unidad_producto
    AND estado = 'disponible'
    AND cantidad_disponible > 0;

  IF v_disponible < v_requerida THEN
    RAISE EXCEPTION 'Stock insuficiente para la operación';
  END IF;

  v_restante := v_requerida;

  FOR entrada IN
    SELECT id_entrada, cantidad_disponible, fecha_vencimiento, fecha_ingreso
    FROM public.entradas_inventario
    WHERE id_deposito = p_id_deposito
      AND id_producto = p_id_producto
      AND unidad_id = v_unidad_producto
      AND estado = 'disponible'
      AND cantidad_disponible > 0
    ORDER BY fecha_vencimiento ASC NULLS LAST, fecha_ingreso ASC, id_entrada ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_restante <= 0;
    v_consumo := LEAST(v_restante, entrada.cantidad_disponible);

    UPDATE public.entradas_inventario
    SET cantidad_disponible = cantidad_disponible - v_consumo,
        estado = CASE WHEN cantidad_disponible - v_consumo = 0 THEN 'agotado' ELSE 'disponible' END,
        updated_at = now()
    WHERE id_entrada = entrada.id_entrada;

    UPDATE public.inventario
    SET cantidad_disponible = GREATEST(cantidad_disponible - v_consumo, 0),
        fecha_actualizacion = now()
    WHERE id_deposito = p_id_deposito
      AND id_producto = p_id_producto;

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

ALTER FUNCTION public.descontar_stock_por_lote(uuid, uuid, numeric, bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.descontar_stock_por_lote(uuid, uuid, numeric, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.descontar_stock_por_lote(uuid, uuid, numeric, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.restaurar_entrada_inventario(
  p_id_entrada uuid,
  p_cantidad numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
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

  v_cantidad_restaurada := LEAST(v_entrada.cantidad_original, v_entrada.cantidad_disponible + p_cantidad)
    - v_entrada.cantidad_disponible;

  IF v_cantidad_restaurada <= 0 THEN
    RETURN true;
  END IF;

  UPDATE public.entradas_inventario
  SET cantidad_disponible = cantidad_disponible + v_cantidad_restaurada,
      estado = 'disponible',
      updated_at = now()
  WHERE id_entrada = p_id_entrada;

  UPDATE public.inventario
  SET cantidad_disponible = cantidad_disponible + v_cantidad_restaurada,
      fecha_actualizacion = now()
  WHERE id_deposito = v_entrada.id_deposito
    AND id_producto = v_entrada.id_producto;

  RETURN true;
END;
$$;

ALTER FUNCTION public.restaurar_entrada_inventario(uuid, numeric) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.restaurar_entrada_inventario(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_entrada_inventario(uuid, numeric) TO authenticated;

-- La baja selecciona FEFO cuando no se recibe un lote explícito. Se conserva
-- la firma funcional anterior mediante un sexto parámetro opcional.
DROP FUNCTION IF EXISTS public.dar_baja_producto(uuid, numeric, text, uuid, text);
CREATE OR REPLACE FUNCTION public.dar_baja_producto(
  p_id_inventario uuid,
  p_cantidad numeric,
  p_motivo text,
  p_usuario_id uuid,
  p_observaciones text DEFAULT NULL,
  p_id_entrada uuid DEFAULT NULL
)
RETURNS TABLE(success boolean, message text, id_baja uuid, cantidad_restante numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rol text;
  v_id_producto uuid;
  v_id_deposito uuid;
  v_cantidad_actual numeric;
  v_nombre_producto text;
  v_nueva_cantidad numeric;
  v_id_baja uuid;
  v_id_movimiento uuid;
  v_id_entrada uuid;
  v_cantidad_entrada numeric;
BEGIN
  IF p_usuario_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RETURN QUERY SELECT false, 'Usuario no autorizado para registrar la baja', NULL::uuid, NULL::numeric;
    RETURN;
  END IF;

  SELECT rol INTO v_rol FROM public.usuarios WHERE id = p_usuario_id AND estado = 'activo';
  IF v_rol NOT IN ('ADMINISTRADOR', 'OPERADOR') THEN
    RETURN QUERY SELECT false, 'Solo administradores u operadores activos pueden registrar bajas', NULL::uuid, NULL::numeric;
    RETURN;
  END IF;

  IF p_motivo NOT IN ('vencido', 'dañado', 'contaminado', 'rechazado', 'otro') OR p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RETURN QUERY SELECT false, 'Datos de baja inválidos', NULL::uuid, NULL::numeric;
    RETURN;
  END IF;

  SELECT id_producto, id_deposito, cantidad_disponible
  INTO v_id_producto, v_id_deposito, v_cantidad_actual
  FROM public.inventario
  WHERE id_inventario = p_id_inventario
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Inventario no encontrado', NULL::uuid, NULL::numeric;
    RETURN;
  END IF;

  SELECT p.nombre_producto INTO v_nombre_producto
  FROM public.productos_donados p WHERE p.id_producto = v_id_producto;

  IF p_id_entrada IS NULL THEN
    SELECT id_entrada INTO v_id_entrada
    FROM public.entradas_inventario
    WHERE id_deposito = v_id_deposito
      AND id_producto = v_id_producto
      AND cantidad_disponible > 0
      AND estado = 'disponible'
    ORDER BY fecha_vencimiento ASC NULLS LAST, fecha_ingreso ASC, id_entrada ASC
    LIMIT 1
    FOR UPDATE;
  ELSE
    v_id_entrada := p_id_entrada;
  END IF;

  IF v_id_entrada IS NOT NULL THEN
    SELECT cantidad_disponible INTO v_cantidad_entrada
    FROM public.entradas_inventario
    WHERE id_entrada = v_id_entrada
      AND id_deposito = v_id_deposito
      AND id_producto = v_id_producto
    FOR UPDATE;

    IF v_cantidad_entrada IS NULL OR v_cantidad_entrada < p_cantidad THEN
      RETURN QUERY SELECT false, 'Cantidad insuficiente en el lote seleccionado', NULL::uuid, v_cantidad_actual;
      RETURN;
    END IF;

    UPDATE public.entradas_inventario
    SET cantidad_disponible = cantidad_disponible - p_cantidad,
        estado = CASE WHEN cantidad_disponible - p_cantidad = 0 THEN 'agotado' ELSE 'disponible' END,
        updated_at = now()
    WHERE id_entrada = v_id_entrada;
  ELSIF v_cantidad_actual < p_cantidad THEN
    RETURN QUERY SELECT false, 'Cantidad insuficiente en inventario', NULL::uuid, v_cantidad_actual;
    RETURN;
  END IF;

  v_nueva_cantidad := v_cantidad_actual - p_cantidad;

  INSERT INTO public.bajas_productos (
    id_producto, id_inventario, id_entrada, cantidad_baja, motivo_baja,
    usuario_responsable_id, observaciones, nombre_producto,
    cantidad_disponible_antes, id_deposito, estado_baja
  ) VALUES (
    v_id_producto, p_id_inventario, v_id_entrada, p_cantidad, p_motivo,
    p_usuario_id, p_observaciones, v_nombre_producto,
    v_cantidad_actual, v_id_deposito, 'confirmada'
  ) RETURNING public.bajas_productos.id_baja INTO v_id_baja;

  UPDATE public.inventario
  SET cantidad_disponible = v_nueva_cantidad, fecha_actualizacion = now()
  WHERE id_inventario = p_id_inventario;

  INSERT INTO public.movimiento_inventario_cabecera (
    id_donante, id_solicitante, estado_movimiento, observaciones
  ) VALUES (
    p_usuario_id, p_usuario_id, 'completado', 'Baja de producto - Motivo: ' || p_motivo
  ) RETURNING id_movimiento INTO v_id_movimiento;

  INSERT INTO public.movimiento_inventario_detalle (
    id_movimiento, id_producto, cantidad, tipo_transaccion, rol_usuario,
    observacion_detalle, unidad_id, unidad_convertida_id, id_entrada, id_deposito
  )
  SELECT
    v_id_movimiento, v_id_producto, p_cantidad, 'baja', 'distribuidor',
    p_observaciones, p.unidad_id, p.unidad_id, v_id_entrada, v_id_deposito
  FROM public.productos_donados p
  WHERE p.id_producto = v_id_producto;

  RETURN QUERY SELECT true, 'Producto dado de baja exitosamente', v_id_baja, v_nueva_cantidad;
END;
$$;

ALTER FUNCTION public.dar_baja_producto(uuid, numeric, text, uuid, text, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dar_baja_producto(uuid, numeric, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dar_baja_producto(uuid, numeric, text, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dar_baja_producto(uuid, numeric, text, uuid, text, uuid) TO service_role;

CREATE OR REPLACE VIEW public.v_bajas_productos_detalle
WITH (security_invoker = true)
AS
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
  un.simbolo AS unidad_simbolo,
  bp.id_entrada,
  e.donacion_id,
  e.donante_id
FROM public.bajas_productos bp
LEFT JOIN public.usuarios u ON u.id = bp.usuario_responsable_id
LEFT JOIN public.depositos d ON d.id_deposito = bp.id_deposito
LEFT JOIN public.productos_donados p ON p.id_producto = bp.id_producto
LEFT JOIN public.unidades un ON un.id = p.unidad_id
LEFT JOIN public.entradas_inventario e ON e.id_entrada = bp.id_entrada
ORDER BY bp.fecha_baja DESC;

CREATE OR REPLACE VIEW public.v_entradas_inventario_detalle
WITH (security_invoker = true)
AS
SELECT
  e.id_entrada,
  e.donacion_id,
  e.donante_id,
  e.id_deposito,
  d.nombre AS deposito_nombre,
  e.id_producto,
  p.nombre_producto,
  e.unidad_id,
  u.nombre AS unidad_nombre,
  u.simbolo AS unidad_simbolo,
  e.cantidad_original,
  e.cantidad_disponible,
  e.fecha_vencimiento,
  e.fecha_ingreso,
  e.estado,
  e.es_legacy
FROM public.entradas_inventario e
JOIN public.depositos d ON d.id_deposito = e.id_deposito
JOIN public.productos_donados p ON p.id_producto = e.id_producto
LEFT JOIN public.unidades u ON u.id = e.unidad_id;

GRANT SELECT ON public.v_entradas_inventario_detalle TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entradas_inventario TO authenticated;

COMMIT;
