-- Migracion: asignacion de bodega por donante
-- Fecha: 2026-04-14

BEGIN;

CREATE TABLE IF NOT EXISTS public.donante_depositos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donante_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  id_deposito uuid NOT NULL REFERENCES public.depositos(id_deposito) ON DELETE RESTRICT,
  es_principal boolean NOT NULL DEFAULT true,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (donante_id, id_deposito)
);

CREATE INDEX IF NOT EXISTS idx_donante_depositos_donante
  ON public.donante_depositos(donante_id);

CREATE INDEX IF NOT EXISTS idx_donante_depositos_deposito
  ON public.donante_depositos(id_deposito);

CREATE UNIQUE INDEX IF NOT EXISTS idx_donante_deposito_principal_activo
  ON public.donante_depositos(donante_id)
  WHERE es_principal = true AND activo = true;

-- Crear una bodega dedicada para cada donante que aun no tenga mapeo activo.
DO $$
DECLARE
  v_donante_id uuid;
  v_deposito_id uuid;
BEGIN
  FOR v_donante_id IN
    SELECT DISTINCT d.user_id
    FROM public.donaciones d
    WHERE d.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.donante_depositos dd
        WHERE dd.donante_id = d.user_id
          AND dd.activo = true
      )
  LOOP
    INSERT INTO public.depositos (nombre, descripcion)
    VALUES (
      'Depósito Donante ' || left(v_donante_id::text, 8),
      'Depósito asignado automáticamente al donante ' || v_donante_id::text
    )
    RETURNING id_deposito INTO v_deposito_id;

    INSERT INTO public.donante_depositos (donante_id, id_deposito, es_principal, activo)
    VALUES (v_donante_id, v_deposito_id, true, true)
    ON CONFLICT (donante_id, id_deposito) DO NOTHING;
  END LOOP;
END $$;

-- A partir de este punto, la unicidad de productos donados pasa a ser por donante+nombre+unidad.
DROP INDEX IF EXISTS public.idx_productos_nombre_unidad;

CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_donante_nombre_unidad
  ON public.productos_donados (
    COALESCE(id_usuario, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(TRIM(BOTH FROM nombre_producto)),
    unidad_id
  );

-- Reubicar inventario existente trazable por donante (cuando el producto tiene id_usuario).
-- Nota: si un producto historico mezcla donaciones de varios donantes, esa mezcla no se puede separar automaticamente.
WITH inventario_a_mover AS (
  SELECT
    i.id_inventario,
    i.id_producto,
    i.id_deposito AS deposito_origen,
    i.cantidad_disponible,
    dd.id_deposito AS deposito_destino
  FROM public.inventario i
  JOIN public.productos_donados p ON p.id_producto = i.id_producto
  JOIN public.donante_depositos dd
    ON dd.donante_id = p.id_usuario
   AND dd.activo = true
  WHERE p.id_usuario IS NOT NULL
    AND i.id_deposito <> dd.id_deposito
),
upsert_destino AS (
  INSERT INTO public.inventario (id_deposito, id_producto, cantidad_disponible, fecha_actualizacion)
  SELECT
    m.deposito_destino,
    m.id_producto,
    m.cantidad_disponible,
    now()
  FROM inventario_a_mover m
  ON CONFLICT (id_deposito, id_producto)
  DO UPDATE SET
    cantidad_disponible = public.inventario.cantidad_disponible + EXCLUDED.cantidad_disponible,
    fecha_actualizacion = now()
  RETURNING id_inventario
)
DELETE FROM public.inventario i
USING inventario_a_mover m
WHERE i.id_inventario = m.id_inventario;

CREATE OR REPLACE FUNCTION public.crear_producto_desde_donacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_producto_id uuid;
  v_deposito_id uuid;
BEGIN
  -- Procesar solo cuando la donacion se marca como Aprobada por primera vez.
  IF (
    (TG_OP = 'INSERT' AND NEW.estado = 'Aprobada') OR
    (TG_OP = 'UPDATE' AND NEW.estado = 'Aprobada' AND COALESCE(OLD.estado, '') <> 'Aprobada')
  ) THEN
    -- Priorizar deposito configurado por donante.
    SELECT dd.id_deposito INTO v_deposito_id
    FROM public.donante_depositos dd
    WHERE dd.donante_id = NEW.user_id
      AND dd.activo = true
    ORDER BY dd.es_principal DESC, dd.created_at ASC
    LIMIT 1;

    -- Fallback para mantener compatibilidad si no existe mapeo.
    IF v_deposito_id IS NULL THEN
      SELECT id_deposito INTO v_deposito_id
      FROM public.depositos
      ORDER BY nombre ASC
      LIMIT 1;
    END IF;

    IF v_deposito_id IS NULL THEN
      RAISE EXCEPTION 'No hay depositos disponibles';
    END IF;

    SELECT id_producto INTO v_producto_id
    FROM public.productos_donados
    WHERE lower(TRIM(BOTH FROM nombre_producto)) = lower(TRIM(BOTH FROM NEW.tipo_producto))
      AND unidad_id = NEW.unidad_id
      AND id_usuario = NEW.user_id;

    IF v_producto_id IS NOT NULL THEN
      UPDATE public.productos_donados
      SET cantidad = cantidad + NEW.cantidad
      WHERE id_producto = v_producto_id;
    ELSE
      INSERT INTO public.productos_donados (
        id_usuario,
        nombre_producto,
        descripcion,
        cantidad,
        unidad_medida,
        fecha_caducidad,
        alimento_id,
        unidad_id
      )
      VALUES (
        NEW.user_id,
        NEW.tipo_producto,
        NEW.observaciones,
        NEW.cantidad,
        NEW.unidad_nombre,
        NEW.fecha_vencimiento,
        NEW.alimento_id,
        NEW.unidad_id
      )
      RETURNING id_producto INTO v_producto_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.inventario
      WHERE id_deposito = v_deposito_id
        AND id_producto = v_producto_id
    ) THEN
      UPDATE public.inventario
      SET
        cantidad_disponible = cantidad_disponible + NEW.cantidad,
        fecha_actualizacion = now()
      WHERE id_deposito = v_deposito_id
        AND id_producto = v_producto_id;
    ELSE
      INSERT INTO public.inventario (
        id_deposito,
        id_producto,
        cantidad_disponible
      )
      VALUES (
        v_deposito_id,
        v_producto_id,
        NEW.cantidad
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.crear_producto_desde_donacion() OWNER TO postgres;

CREATE OR REPLACE TRIGGER trigger_crear_producto
AFTER INSERT OR UPDATE ON public.donaciones
FOR EACH ROW
EXECUTE FUNCTION public.crear_producto_desde_donacion();

COMMIT;
