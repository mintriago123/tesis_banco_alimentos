BEGIN;

-- La función solo se ejecuta desde el trigger de auditoría. Aunque no usa
-- relaciones externas, fijamos el search_path para eliminar la superficie de
-- resolución mutable reportada por el advisor.
ALTER FUNCTION public.bloquear_mutacion_auditoria_donaciones()
  SET search_path = '';

-- El endpoint valida al usuario con su sesión y llama esta RPC mediante el
-- cliente service_role. No debe estar expuesta al rol authenticated.
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
  -- La autorización de la sesión ocurre en el endpoint. La RPC refuerza que
  -- el actor enviado sea un usuario activo con rol operativo.
  IF p_usuario_id IS NULL THEN
    RETURN QUERY SELECT false, 'Usuario responsable inválido', NULL::uuid, NULL::numeric;
    RETURN;
  END IF;

  SELECT rol
  INTO v_rol
  FROM public.usuarios
  WHERE id = p_usuario_id
    AND estado = 'activo';

  IF v_rol NOT IN ('ADMINISTRADOR', 'OPERADOR') THEN
    RETURN QUERY SELECT false, 'Solo administradores u operadores activos pueden registrar bajas', NULL::uuid, NULL::numeric;
    RETURN;
  END IF;

  IF p_motivo NOT IN ('vencido', 'dañado', 'contaminado', 'rechazado', 'otro')
     OR p_cantidad IS NULL
     OR p_cantidad <= 0 THEN
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

  SELECT p.nombre_producto
  INTO v_nombre_producto
  FROM public.productos_donados p
  WHERE p.id_producto = v_id_producto;

  IF p_id_entrada IS NULL THEN
    SELECT id_entrada
    INTO v_id_entrada
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
    SELECT cantidad_disponible
    INTO v_cantidad_entrada
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
        estado = CASE
          WHEN cantidad_disponible - p_cantidad = 0 THEN 'agotado'
          ELSE 'disponible'
        END,
        updated_at = now()
    WHERE id_entrada = v_id_entrada;
  ELSIF v_cantidad_actual < p_cantidad THEN
    RETURN QUERY SELECT false, 'Cantidad insuficiente en inventario', NULL::uuid, v_cantidad_actual;
    RETURN;
  END IF;

  v_nueva_cantidad := v_cantidad_actual - p_cantidad;

  INSERT INTO public.bajas_productos (
    id_producto,
    id_inventario,
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
    v_id_producto,
    p_id_inventario,
    v_id_entrada,
    p_cantidad,
    p_motivo,
    p_usuario_id,
    p_observaciones,
    v_nombre_producto,
    v_cantidad_actual,
    v_id_deposito,
    'confirmada'
  )
  RETURNING public.bajas_productos.id_baja INTO v_id_baja;

  UPDATE public.inventario
  SET cantidad_disponible = v_nueva_cantidad,
      fecha_actualizacion = now()
  WHERE id_inventario = p_id_inventario;

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
  SELECT
    v_id_movimiento,
    v_id_producto,
    p_cantidad,
    'baja',
    'distribuidor',
    p_observaciones,
    p.unidad_id,
    p.unidad_id,
    v_id_entrada,
    v_id_deposito
  FROM public.productos_donados p
  WHERE p.id_producto = v_id_producto;

  RETURN QUERY SELECT true, 'Producto dado de baja exitosamente', v_id_baja, v_nueva_cantidad;
END;
$$;

ALTER FUNCTION public.dar_baja_producto(uuid, numeric, text, uuid, text, uuid)
  OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION public.dar_baja_producto(uuid, numeric, text, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dar_baja_producto(uuid, numeric, text, uuid, text, uuid)
  TO service_role;

COMMIT;
