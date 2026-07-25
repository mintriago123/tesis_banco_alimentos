BEGIN;

-- La identidad de catálogo es global por nombre normalizado y unidad. El
-- donante queda trazado en entradas_inventario.donante_id, por lo que dos
-- donaciones iguales deben reutilizar el producto y crear dos entradas.
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

COMMIT;
