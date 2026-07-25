BEGIN;

-- Las columnas nuevas no alteran cantidades ni movimientos históricos.
ALTER TABLE public.unidades
  ADD COLUMN IF NOT EXISTS activa boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS es_discreta boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS es_presentacion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permite_fraccion boolean NOT NULL DEFAULT true;

ALTER TABLE public.conversiones
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

ALTER TABLE public.movimiento_inventario_detalle
  ADD COLUMN IF NOT EXISTS cantidad_original numeric,
  ADD COLUMN IF NOT EXISTS unidad_convertida_id bigint;

-- solicitudes.unidad_id seguirá siendo obligatorio para las nuevas operaciones.
-- El CHECK queda NOT VALID para conservar solicitudes históricas incompletas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'solicitudes_unidad_id_required'
      AND conrelid = 'public.solicitudes'::regclass
  ) THEN
    ALTER TABLE public.solicitudes
      ADD CONSTRAINT solicitudes_unidad_id_required CHECK (unidad_id IS NOT NULL) NOT VALID;
  END IF;
END;
$$;

-- Los factores inválidos dejan de participar en nuevas resoluciones sin
-- modificar cantidades históricas ni eliminar sus registros.
UPDATE public.conversiones
SET activo = false
WHERE factor_conversion IS NULL OR factor_conversion <= 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversiones_factor_positivo'
      AND conrelid = 'public.conversiones'::regclass
  ) THEN
    ALTER TABLE public.conversiones
      ADD CONSTRAINT conversiones_factor_positivo CHECK (factor_conversion > 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'movimiento_detalle_cantidad_no_negativa'
      AND conrelid = 'public.movimiento_inventario_detalle'::regclass
  ) THEN
    ALTER TABLE public.movimiento_inventario_detalle
      ADD CONSTRAINT movimiento_detalle_cantidad_no_negativa CHECK (cantidad > 0) NOT VALID;
  END IF;
END;
$$;

-- Normaliza atributos del catálogo existente. Las unidades comerciales nuevas
-- no reciben factores ficticios.
UPDATE public.unidades
SET
  es_discreta = (tipo_magnitud_id = 4),
  es_presentacion = false,
  permite_fraccion = (tipo_magnitud_id <> 4)
WHERE activa IS TRUE;

INSERT INTO public.unidades (
  nombre, simbolo, tipo_magnitud_id, es_base, activa,
  es_discreta, es_presentacion, permite_fraccion
)
SELECT catalogo.nombre, catalogo.simbolo, catalogo.tipo_magnitud_id,
  catalogo.es_base, catalogo.activa, catalogo.es_discreta,
  catalogo.es_presentacion, catalogo.permite_fraccion
FROM (
  VALUES
    ('Unidad', 'ud', 4::bigint, true, true, true, false, false),
    ('Docena', 'doc', 4::bigint, false, true, true, true, false),
    ('Lata', 'lata', 4::bigint, false, true, true, true, false),
    ('Caja', 'caja', 4::bigint, false, true, true, true, false),
    ('Kit', 'kit', 4::bigint, false, true, true, true, false)
) AS catalogo(nombre, simbolo, tipo_magnitud_id, es_base, activa, es_discreta, es_presentacion, permite_fraccion)
WHERE NOT EXISTS (
  SELECT 1 FROM public.unidades existente WHERE existente.simbolo = catalogo.simbolo
);

SELECT setval(
  pg_get_serial_sequence('public.unidades', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM public.unidades), 1),
  true
);

-- Convierte las relaciones existentes en la única fuente de equivalencias.
CREATE OR REPLACE FUNCTION public.validar_conversion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_tipo_origen bigint;
  v_tipo_destino bigint;
  v_origen_activo boolean;
  v_destino_activo boolean;
BEGIN
  IF NEW.factor_conversion IS NULL OR NEW.factor_conversion <= 0 THEN
    RAISE EXCEPTION 'El factor de conversión debe ser mayor que cero';
  END IF;

  IF NEW.unidad_origen_id = NEW.unidad_destino_id THEN
    RAISE EXCEPTION 'Una conversión debe usar dos unidades diferentes';
  END IF;

  SELECT tipo_magnitud_id, activa
  INTO v_tipo_origen, v_origen_activo
  FROM public.unidades
  WHERE id = NEW.unidad_origen_id;

  SELECT tipo_magnitud_id, activa
  INTO v_tipo_destino, v_destino_activo
  FROM public.unidades
  WHERE id = NEW.unidad_destino_id;

  IF v_tipo_origen IS NULL OR v_tipo_destino IS NULL THEN
    RAISE EXCEPTION 'Las unidades de la conversión deben existir';
  END IF;

  IF v_tipo_origen <> v_tipo_destino THEN
    RAISE EXCEPTION 'Las unidades de una conversión deben pertenecer a la misma magnitud';
  END IF;

  IF COALESCE(NEW.activo, true) AND (NOT v_origen_activo OR NOT v_destino_activo) THEN
    RAISE EXCEPTION 'No se puede activar una conversión con unidades inactivas';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validar_conversion ON public.conversiones;
CREATE TRIGGER trigger_validar_conversion
  BEFORE INSERT OR UPDATE ON public.conversiones
  FOR EACH ROW EXECUTE FUNCTION public.validar_conversion();

-- Resolver único: identidad, relación directa o relación inversa. Compartir
-- tipo_magnitud no crea una equivalencia.
CREATE OR REPLACE FUNCTION public.resolver_conversion(
  unidad_origen_id bigint,
  unidad_destino_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tipo_origen bigint;
  v_tipo_destino bigint;
  v_origen_activo boolean;
  v_destino_activo boolean;
  v_factor numeric;
BEGIN
  IF unidad_origen_id IS NULL OR unidad_destino_id IS NULL THEN
    RETURN jsonb_build_object('convertible', false, 'reason', 'no_conversion');
  END IF;

  SELECT tipo_magnitud_id, activa
  INTO v_tipo_origen, v_origen_activo
  FROM public.unidades
  WHERE id = unidad_origen_id;

  SELECT tipo_magnitud_id, activa
  INTO v_tipo_destino, v_destino_activo
  FROM public.unidades
  WHERE id = unidad_destino_id;

  IF v_tipo_origen IS NULL OR v_tipo_destino IS NULL
     OR NOT COALESCE(v_origen_activo, false)
     OR NOT COALESCE(v_destino_activo, false) THEN
    RETURN jsonb_build_object('convertible', false, 'reason', 'inactive_unit');
  END IF;

  IF unidad_origen_id = unidad_destino_id THEN
    RETURN jsonb_build_object(
      'convertible', true,
      'factor', 1,
      'origenId', unidad_origen_id,
      'destinoId', unidad_destino_id,
      'source', 'same_unit'
    );
  END IF;

  IF v_tipo_origen <> v_tipo_destino THEN
    RETURN jsonb_build_object('convertible', false, 'reason', 'incompatible_magnitude');
  END IF;

  SELECT c.factor_conversion
  INTO v_factor
  FROM public.conversiones c
  WHERE c.unidad_origen_id = $1
    AND c.unidad_destino_id = $2
    AND c.activo IS TRUE
    AND c.factor_conversion > 0;

  IF v_factor IS NOT NULL THEN
    RETURN jsonb_build_object(
      'convertible', true,
      'factor', v_factor,
      'origenId', unidad_origen_id,
      'destinoId', unidad_destino_id,
      'source', 'database'
    );
  END IF;

  SELECT c.factor_conversion
  INTO v_factor
  FROM public.conversiones c
  WHERE c.unidad_origen_id = $2
    AND c.unidad_destino_id = $1
    AND c.activo IS TRUE
    AND c.factor_conversion > 0;

  IF v_factor IS NOT NULL THEN
    RETURN jsonb_build_object(
      'convertible', true,
      'factor', 1 / v_factor,
      'origenId', unidad_origen_id,
      'destinoId', unidad_destino_id,
      'source', 'database'
    );
  END IF;

  RETURN jsonb_build_object('convertible', false, 'reason', 'no_conversion');
END;
$$;

-- Wrapper legacy: ahora solo devuelve una cantidad cuando el resolver confirma
-- una equivalencia. Nunca retorna la cantidad original como fallback.
CREATE OR REPLACE FUNCTION public.convertir_cantidad(
  p_cantidad numeric,
  p_unidad_origen_id bigint,
  p_unidad_destino_id bigint
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_resolucion jsonb;
  v_factor numeric;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad < 0 THEN
    RETURN NULL;
  END IF;

  v_resolucion := public.resolver_conversion(p_unidad_origen_id, p_unidad_destino_id);
  IF v_resolucion ->> 'convertible' <> 'true' THEN
    RETURN NULL;
  END IF;

  v_factor := (v_resolucion ->> 'factor')::numeric;
  IF v_factor IS NULL OR v_factor <= 0 THEN
    RETURN NULL;
  END IF;

  RETURN p_cantidad * v_factor;
END;
$$;

-- Contrato alineado con UnidadAlimento en TypeScript.
DROP FUNCTION IF EXISTS public.obtener_unidades_alimento(bigint);
CREATE FUNCTION public.obtener_unidades_alimento(p_alimento_id bigint)
RETURNS TABLE (
  unidad_id bigint,
  nombre text,
  simbolo text,
  tipo_magnitud_id bigint,
  tipo_magnitud_nombre text,
  es_base boolean,
  es_principal boolean
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    u.id,
    u.nombre,
    u.simbolo,
    u.tipo_magnitud_id,
    tm.nombre,
    u.es_base,
    au.es_unidad_principal
  FROM public.alimentos_unidades au
  JOIN public.unidades u ON u.id = au.unidad_id
  JOIN public.tipos_magnitud tm ON tm.id = u.tipo_magnitud_id
  WHERE au.alimento_id = p_alimento_id
    AND u.activa IS TRUE
  ORDER BY au.es_unidad_principal DESC, u.nombre;
$$;

-- Rechaza movimientos sin unidad o sin equivalencia explícita.
CREATE OR REPLACE FUNCTION public.validar_unidad_movimiento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_unidad_producto bigint;
  v_nombre_origen text;
  v_nombre_destino text;
  v_resolucion jsonb;
  v_unidad_convertida bigint;
  v_cantidad_original numeric;
  v_permite_fraccion boolean;
BEGIN
  -- Conserva actualizaciones administrativas de movimientos históricos que
  -- nacieron antes de que la unidad fuera obligatoria.
  IF NEW.unidad_id IS NULL AND TG_OP = 'UPDATE' AND OLD.unidad_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Las bajas históricas no enviaban unidad; se completa desde el producto
  -- para conservar el registro sin permitir que se almacene NULL.
  IF NEW.unidad_id IS NULL AND NEW.tipo_transaccion = 'baja' THEN
    SELECT unidad_id
    INTO v_unidad_producto
    FROM public.productos_donados
    WHERE id_producto = NEW.id_producto;
    NEW.unidad_id := v_unidad_producto;
  END IF;

  IF NEW.unidad_id IS NULL THEN
    RAISE EXCEPTION 'La unidad del movimiento es obligatoria';
  END IF;

  IF NEW.cantidad IS NULL OR NEW.cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad del movimiento debe ser mayor que cero';
  END IF;

  SELECT pd.unidad_id, u.nombre
  INTO v_unidad_producto, v_nombre_destino
  FROM public.productos_donados pd
  LEFT JOIN public.unidades u ON u.id = pd.unidad_id
  WHERE pd.id_producto = NEW.id_producto;

  IF v_unidad_producto IS NULL THEN
    RAISE EXCEPTION 'El producto del movimiento no tiene una unidad válida';
  END IF;

  SELECT nombre INTO v_nombre_origen FROM public.unidades WHERE id = NEW.unidad_id;
  IF v_nombre_origen IS NULL THEN
    RAISE EXCEPTION 'La unidad del movimiento no existe';
  END IF;

  v_resolucion := public.resolver_conversion(NEW.unidad_id, v_unidad_producto);
  IF v_resolucion ->> 'convertible' <> 'true' THEN
    RAISE EXCEPTION 'No existe conversión entre % y % para esta operación',
      v_nombre_origen, v_nombre_destino;
  END IF;

  v_unidad_convertida := COALESCE(NEW.unidad_convertida_id, v_unidad_producto);
  IF v_unidad_convertida <> v_unidad_producto THEN
    RAISE EXCEPTION 'La unidad convertida debe coincidir con la unidad del producto';
  END IF;
  NEW.unidad_convertida_id := v_unidad_producto;

  v_cantidad_original := COALESCE(
    NEW.cantidad_original,
    NEW.cantidad / (v_resolucion ->> 'factor')::numeric
  );
  NEW.cantidad_original := v_cantidad_original;
  NEW.cantidad := v_cantidad_original * (v_resolucion ->> 'factor')::numeric;

  SELECT permite_fraccion
  INTO v_permite_fraccion
  FROM public.unidades
  WHERE id = NEW.unidad_id;

  IF NOT COALESCE(v_permite_fraccion, true)
     AND v_cantidad_original <> trunc(v_cantidad_original) THEN
    RAISE EXCEPTION 'La unidad % no permite cantidades decimales', v_nombre_origen;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validar_unidad_movimiento ON public.movimiento_inventario_detalle;
CREATE TRIGGER trigger_validar_unidad_movimiento
  BEFORE INSERT OR UPDATE ON public.movimiento_inventario_detalle
  FOR EACH ROW EXECUTE FUNCTION public.validar_unidad_movimiento();

CREATE OR REPLACE FUNCTION public.validar_cantidad_por_unidad()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_nombre text;
  v_permite_fraccion boolean;
BEGIN
  -- El histórico puede contener solicitudes antiguas sin unidad. Las nuevas
  -- inserciones y cualquier solicitud ya normalizada sí quedan validadas.
  IF NEW.unidad_id IS NULL AND TG_OP = 'UPDATE' AND OLD.unidad_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.unidad_id IS NULL THEN
    RAISE EXCEPTION 'La unidad es obligatoria';
  END IF;

  IF NEW.cantidad IS NULL OR NEW.cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor que cero';
  END IF;

  SELECT nombre, permite_fraccion
  INTO v_nombre, v_permite_fraccion
  FROM public.unidades
  WHERE id = NEW.unidad_id
    AND activa IS TRUE;

  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'La unidad no existe o está inactiva';
  END IF;

  IF NOT COALESCE(v_permite_fraccion, true) AND NEW.cantidad <> trunc(NEW.cantidad) THEN
    RAISE EXCEPTION 'La unidad % no permite cantidades decimales', v_nombre;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validar_cantidad_solicitud ON public.solicitudes;
CREATE TRIGGER trigger_validar_cantidad_solicitud
  BEFORE INSERT OR UPDATE ON public.solicitudes
  FOR EACH ROW EXECUTE FUNCTION public.validar_cantidad_por_unidad();

DROP TRIGGER IF EXISTS trigger_validar_cantidad_donacion ON public.donaciones;
CREATE TRIGGER trigger_validar_cantidad_donacion
  BEFORE INSERT OR UPDATE ON public.donaciones
  FOR EACH ROW EXECUTE FUNCTION public.validar_cantidad_por_unidad();

-- La RPC mantiene la firma legacy, pero registra cantidades y unidades de
-- origen/destino de manera consistente.
CREATE OR REPLACE FUNCTION public.registrar_movimiento_con_unidad(
  p_id_movimiento uuid,
  p_id_producto uuid,
  p_cantidad numeric,
  p_tipo_transaccion text,
  p_unidad_id bigint,
  p_observacion text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_detalle_id uuid;
  v_unidad_producto bigint;
  v_resolucion jsonb;
  v_cantidad_convertida numeric;
  v_rol text;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad del movimiento debe ser mayor que cero';
  END IF;
  IF p_unidad_id IS NULL THEN
    RAISE EXCEPTION 'La unidad del movimiento es obligatoria';
  END IF;

  SELECT unidad_id INTO v_unidad_producto
  FROM public.productos_donados
  WHERE id_producto = p_id_producto;
  IF v_unidad_producto IS NULL THEN
    RAISE EXCEPTION 'El producto no tiene unidad configurada';
  END IF;

  v_resolucion := public.resolver_conversion(p_unidad_id, v_unidad_producto);
  IF v_resolucion ->> 'convertible' <> 'true' THEN
    RAISE EXCEPTION 'No existe conversión entre las unidades del movimiento y del producto';
  END IF;

  v_cantidad_convertida := p_cantidad * (v_resolucion ->> 'factor')::numeric;
  IF v_cantidad_convertida IS NULL OR v_cantidad_convertida <= 0 THEN
    RAISE EXCEPTION 'La cantidad convertida del movimiento no es válida';
  END IF;

  SELECT rol INTO v_rol
  FROM public.usuarios
  WHERE id = (SELECT auth.uid())
    AND estado = 'activo';
  IF v_rol IS NULL OR v_rol NOT IN ('ADMINISTRADOR', 'OPERADOR') THEN
    RAISE EXCEPTION 'Solo un administrador u operador activo puede registrar el movimiento';
  END IF;

  -- El detalle histórico usa roles de movimiento, no los roles de usuarios.
  v_rol := 'distribuidor';

  INSERT INTO public.movimiento_inventario_detalle (
    id_movimiento, id_producto, cantidad, cantidad_original, tipo_transaccion,
    rol_usuario, observacion_detalle, unidad_id, unidad_convertida_id
  )
  VALUES (
    p_id_movimiento, p_id_producto, v_cantidad_convertida, p_cantidad,
    p_tipo_transaccion, v_rol, p_observacion, p_unidad_id, v_unidad_producto
  )
  RETURNING id_detalle INTO v_detalle_id;

  RETURN v_detalle_id;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'movimiento_detalle_unidad_convertida_id_fkey'
      AND conrelid = 'public.movimiento_inventario_detalle'::regclass
  ) THEN
    ALTER TABLE public.movimiento_inventario_detalle
      ADD CONSTRAINT movimiento_detalle_unidad_convertida_id_fkey
      FOREIGN KEY (unidad_convertida_id) REFERENCES public.unidades(id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resolver_conversion(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_conversion(bigint, bigint) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.obtener_unidades_alimento(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_unidades_alimento(bigint) TO authenticated, service_role;

COMMENT ON FUNCTION public.resolver_conversion(bigint, bigint)
  IS 'Resuelve únicamente identidad o equivalencias explícitas activas; no infiere por tipo de magnitud.';
COMMENT ON COLUMN public.movimiento_inventario_detalle.unidad_id
  IS 'Unidad original informada en la operación; la unidad canónica está en unidad_convertida_id.';
COMMENT ON COLUMN public.movimiento_inventario_detalle.cantidad_original
  IS 'Cantidad informada antes de aplicar la conversión.';
COMMENT ON COLUMN public.movimiento_inventario_detalle.unidad_convertida_id
  IS 'Unidad del producto/inventario después de la conversión.';

COMMIT;
