BEGIN;

-- Final hardening pass based on Supabase MCP advisors and catalog review.

CREATE SCHEMA IF NOT EXISTS private_auth;

REVOKE ALL ON SCHEMA private_auth FROM PUBLIC;
GRANT USAGE ON SCHEMA private_auth TO authenticated;

CREATE OR REPLACE FUNCTION private_auth.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT rol
  FROM public.usuarios
  WHERE id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION private_auth.current_user_estado()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT estado
  FROM public.usuarios
  WHERE id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION private_auth.current_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION private_auth.current_user_estado() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_auth.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION private_auth.current_user_estado() TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_requested_role text := upper(coalesce(NEW.raw_user_meta_data->>'rol', 'SOLICITANTE'));
  v_role text;
BEGIN
  v_role := CASE
    WHEN v_requested_role IN ('DONANTE', 'SOLICITANTE') THEN v_requested_role
    ELSE 'SOLICITANTE'
  END;

  INSERT INTO public.usuarios (
    id,
    email,
    rol,
    estado,
    created_at,
    updated_at,
    recibir_notificaciones
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_role,
    'activo',
    now(),
    now(),
    true
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_new_user_signup ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER trigger_new_user_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.aprobar_solicitud_alta_alimento(
  p_solicitud_id uuid,
  p_nombre text,
  p_categoria text,
  p_unidad_ids bigint[],
  p_unidad_principal_id bigint
) RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_alimento_id bigint;
  v_unidad_id bigint;
  v_unidad_ids bigint[];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.usuarios
    WHERE id = v_user_id
      AND rol = 'ADMINISTRADOR'
      AND estado = 'activo'
  ) THEN
    RAISE EXCEPTION 'Solo un administrador activo puede aprobar solicitudes de alta de alimento';
  END IF;

  IF p_nombre IS NULL OR length(trim(p_nombre)) = 0 THEN
    RAISE EXCEPTION 'El nombre del alimento es obligatorio';
  END IF;

  IF p_categoria IS NULL OR length(trim(p_categoria)) = 0 THEN
    RAISE EXCEPTION 'La categoria del alimento es obligatoria';
  END IF;

  SELECT array_agg(DISTINCT unidad_id)
  INTO v_unidad_ids
  FROM unnest(p_unidad_ids) AS unidad_ids(unidad_id)
  WHERE unidad_id IS NOT NULL;

  IF v_unidad_ids IS NULL OR array_length(v_unidad_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Debes seleccionar al menos una unidad de medida';
  END IF;

  IF p_unidad_principal_id IS NOT NULL AND NOT (p_unidad_principal_id = ANY(v_unidad_ids)) THEN
    RAISE EXCEPTION 'La unidad principal debe estar entre las unidades seleccionadas';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.solicitudes_alta_alimentos
    WHERE id = p_solicitud_id
      AND estado <> 'pendiente'
  ) THEN
    RAISE EXCEPTION 'La solicitud ya fue revisada';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.solicitudes_alta_alimentos
    WHERE id = p_solicitud_id
      AND estado = 'pendiente'
  ) THEN
    RAISE EXCEPTION 'Solicitud de alta no encontrada';
  END IF;

  INSERT INTO public.alimentos (nombre, categoria)
  VALUES (trim(p_nombre), trim(p_categoria))
  RETURNING id INTO v_alimento_id;

  FOREACH v_unidad_id IN ARRAY v_unidad_ids LOOP
    INSERT INTO public.alimentos_unidades (
      alimento_id,
      unidad_id,
      es_unidad_principal
    )
    VALUES (
      v_alimento_id,
      v_unidad_id,
      v_unidad_id = p_unidad_principal_id
    );
  END LOOP;

  UPDATE public.solicitudes_alta_alimentos
  SET estado = 'aprobada',
      alimento_creado_id = v_alimento_id,
      revisado_por = v_user_id,
      fecha_revision = now(),
      updated_at = now()
  WHERE id = p_solicitud_id;

  RETURN v_alimento_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.dar_baja_producto(
  p_id_inventario uuid,
  p_cantidad numeric,
  p_motivo text,
  p_usuario_id uuid,
  p_observaciones text DEFAULT NULL::text
) RETURNS TABLE(success boolean, message text, id_baja uuid, cantidad_restante numeric)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_id_producto uuid;
  v_id_deposito uuid;
  v_cantidad_actual numeric;
  v_nombre_producto text;
  v_nueva_cantidad numeric;
  v_id_baja uuid;
  v_id_movimiento uuid;
  v_rol_usuario text;
BEGIN
  IF p_usuario_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RETURN QUERY SELECT false, 'Usuario no autorizado para registrar la baja', NULL::uuid, NULL::numeric;
    RETURN;
  END IF;

  IF p_motivo NOT IN ('vencido', 'dañado', 'contaminado', 'rechazado', 'otro') THEN
    RETURN QUERY SELECT false, 'Motivo de baja invalido', NULL::uuid, NULL::numeric;
    RETURN;
  END IF;

  SELECT rol INTO v_rol_usuario
  FROM public.usuarios
  WHERE id = p_usuario_id
    AND estado = 'activo';

  IF v_rol_usuario NOT IN ('ADMINISTRADOR', 'OPERADOR') THEN
    RETURN QUERY SELECT false, 'Solo administradores u operadores activos pueden registrar bajas', NULL::uuid, NULL::numeric;
    RETURN;
  END IF;

  SELECT
    i.id_producto,
    i.id_deposito,
    i.cantidad_disponible,
    p.nombre_producto
  INTO
    v_id_producto,
    v_id_deposito,
    v_cantidad_actual,
    v_nombre_producto
  FROM public.inventario i
  LEFT JOIN public.productos_donados p ON p.id_producto = i.id_producto
  WHERE i.id_inventario = p_id_inventario;

  IF v_id_producto IS NULL THEN
    RETURN QUERY SELECT false, 'Registro de inventario no encontrado', NULL::uuid, NULL::numeric;
    RETURN;
  END IF;

  IF v_cantidad_actual < p_cantidad THEN
    RETURN QUERY SELECT false, 'Cantidad insuficiente en inventario. Disponible: ' || v_cantidad_actual, NULL::uuid, v_cantidad_actual;
    RETURN;
  END IF;

  v_nueva_cantidad := v_cantidad_actual - p_cantidad;

  INSERT INTO public.bajas_productos (
    id_producto,
    id_inventario,
    cantidad_baja,
    motivo_baja,
    usuario_responsable_id,
    observaciones,
    nombre_producto,
    cantidad_disponible_antes,
    id_deposito,
    estado_baja
  ) VALUES (
    v_id_producto,
    p_id_inventario,
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
  ) VALUES (
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
    observacion_detalle
  ) VALUES (
    v_id_movimiento,
    v_id_producto,
    p_cantidad,
    'baja',
    'distribuidor',
    p_observaciones
  );

  RETURN QUERY SELECT true, 'Producto dado de baja exitosamente', v_id_baja, v_nueva_cantidad;
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_estadisticas_bajas(
  p_fecha_inicio timestamp with time zone DEFAULT (now() - '30 days'::interval),
  p_fecha_fin timestamp with time zone DEFAULT now()
) RETURNS TABLE(
  total_bajas bigint,
  total_cantidad numeric,
  bajas_por_vencido bigint,
  bajas_por_danado bigint,
  bajas_por_contaminado bigint,
  bajas_por_rechazado bigint,
  bajas_por_otro bigint,
  cantidad_vencido numeric,
  cantidad_danado numeric,
  cantidad_contaminado numeric,
  cantidad_rechazado numeric,
  cantidad_otro numeric
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    count(*)::bigint,
    coalesce(sum(cantidad_baja), 0),
    count(*) FILTER (WHERE motivo_baja = 'vencido')::bigint,
    count(*) FILTER (WHERE motivo_baja = 'dañado')::bigint,
    count(*) FILTER (WHERE motivo_baja = 'contaminado')::bigint,
    count(*) FILTER (WHERE motivo_baja = 'rechazado')::bigint,
    count(*) FILTER (WHERE motivo_baja = 'otro')::bigint,
    coalesce(sum(cantidad_baja) FILTER (WHERE motivo_baja = 'vencido'), 0),
    coalesce(sum(cantidad_baja) FILTER (WHERE motivo_baja = 'dañado'), 0),
    coalesce(sum(cantidad_baja) FILTER (WHERE motivo_baja = 'contaminado'), 0),
    coalesce(sum(cantidad_baja) FILTER (WHERE motivo_baja = 'rechazado'), 0),
    coalesce(sum(cantidad_baja) FILTER (WHERE motivo_baja = 'otro'), 0)
  FROM public.bajas_productos
  WHERE fecha_baja BETWEEN p_fecha_inicio AND p_fecha_fin;
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_productos_proximos_vencer(
  p_dias_umbral integer DEFAULT 7
) RETURNS TABLE(
  id_inventario uuid,
  id_producto uuid,
  nombre_producto text,
  cantidad_disponible numeric,
  fecha_caducidad timestamp with time zone,
  dias_para_vencer integer,
  id_deposito uuid,
  nombre_deposito text,
  unidad_simbolo text,
  prioridad text
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id_inventario,
    i.id_producto,
    p.nombre_producto,
    i.cantidad_disponible,
    p.fecha_caducidad,
    extract(day from (p.fecha_caducidad - now()))::integer,
    i.id_deposito,
    d.nombre,
    u.simbolo,
    CASE
      WHEN p.fecha_caducidad < now() THEN 'vencido'
      WHEN extract(day from (p.fecha_caducidad - now())) <= 3 THEN 'alta'
      WHEN extract(day from (p.fecha_caducidad - now())) <= p_dias_umbral THEN 'media'
      ELSE 'baja'
    END
  FROM public.inventario i
  INNER JOIN public.productos_donados p ON p.id_producto = i.id_producto
  LEFT JOIN public.depositos d ON d.id_deposito = i.id_deposito
  LEFT JOIN public.unidades u ON u.id = p.unidad_id
  WHERE p.fecha_caducidad IS NOT NULL
    AND i.cantidad_disponible > 0
    AND (
      p.fecha_caducidad < now()
      OR extract(day from (p.fecha_caducidad - now())) <= p_dias_umbral
    )
  ORDER BY p.fecha_caducidad ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_notificacion_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.estado IS DISTINCT FROM NEW.estado) THEN
    IF NEW.estado = 'bloqueado' THEN
      PERFORM public.crear_notificacion(
        'Cuenta Bloqueada'::character varying,
        'Tu cuenta ha sido bloqueada por un administrador. Si crees que esto es un error, contacta al soporte.'::text,
        'alerta'::character varying,
        NEW.id::uuid,
        NULL::character varying,
        'sistema'::character varying,
        NULL::character varying,
        '{}'::jsonb
      );
    ELSIF NEW.estado = 'desactivado' THEN
      PERFORM public.crear_notificacion(
        'Cuenta Desactivada'::character varying,
        'Tu cuenta ha sido desactivada por un administrador. Contacta al soporte para mas informacion.'::text,
        'advertencia'::character varying,
        NEW.id::uuid,
        NULL::character varying,
        'sistema'::character varying,
        NULL::character varying,
        '{}'::jsonb
      );
    ELSIF NEW.estado = 'activo' AND (OLD.estado = 'bloqueado' OR OLD.estado = 'desactivado') THEN
      PERFORM public.crear_notificacion(
        'Cuenta Reactivada'::character varying,
        'Tu cuenta ha sido reactivada. Ya puedes acceder al sistema normalmente.'::text,
        'exito'::character varying,
        NEW.id::uuid,
        NULL::character varying,
        'sistema'::character varying,
        NULL::character varying,
        '{}'::jsonb
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER VIEW public.v_bajas_productos_detalle SET (security_invoker = true);
ALTER VIEW public.v_inventario_con_conversiones SET (security_invoker = true);
ALTER VIEW public.v_inventario_con_unidades SET (security_invoker = true);
ALTER VIEW public.v_inventario_detallado SET (security_invoker = true);
ALTER VIEW public.v_movimientos_detallado SET (security_invoker = true);
ALTER VIEW public.v_productos_duplicados SET (security_invoker = true);

-- Remove legacy permissive and duplicate policies.
DROP POLICY IF EXISTS "Enable all operations for alimentos" ON public.alimentos;
DROP POLICY IF EXISTS "Enable all operations for conversiones" ON public.conversiones;
DROP POLICY IF EXISTS "Enable all operations for tipos_magnitud" ON public.tipos_magnitud;
DROP POLICY IF EXISTS "Enable all operations for unidades" ON public.unidades;
DROP POLICY IF EXISTS "Permitir lectura publica de alimentos" ON public.alimentos;
DROP POLICY IF EXISTS "Permitir lectura pública de alimentos" ON public.alimentos;
DROP POLICY IF EXISTS "Permitir lectura publica de unidades" ON public.unidades;
DROP POLICY IF EXISTS "Permitir lectura pública de unidades" ON public.unidades;
DROP POLICY IF EXISTS "Permitir lectura de inventario a usuarios autenticados" ON public.inventario;
DROP POLICY IF EXISTS "Permitir lectura de productos_donados a usuarios autenticados" ON public.productos_donados;
DROP POLICY IF EXISTS "Usuarios autenticados pueden ver depósitos" ON public.depositos;
DROP POLICY IF EXISTS operadores_can_read_alimentos ON public.alimentos;
DROP POLICY IF EXISTS operadores_can_read_depositos ON public.depositos;
DROP POLICY IF EXISTS operadores_can_read_unidades ON public.unidades;
DROP POLICY IF EXISTS users_can_read_conversiones ON public.conversiones;
DROP POLICY IF EXISTS users_can_read_tipos_magnitud ON public.tipos_magnitud;
DROP POLICY IF EXISTS users_can_read_unidades ON public.unidades;

DROP POLICY IF EXISTS "Users can manage their notification settings" ON public.configuracion_notificaciones;
DROP POLICY IF EXISTS configuracion_notificaciones_manage_own ON public.configuracion_notificaciones;
CREATE POLICY configuracion_notificaciones_manage_own
  ON public.configuracion_notificaciones
  FOR ALL
  TO authenticated
  USING (usuario_id = (SELECT auth.uid()))
  WITH CHECK (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS usuarios_insert_policy ON public.usuarios;
DROP POLICY IF EXISTS usuarios_select_policy ON public.usuarios;
CREATE POLICY usuarios_select_policy
  ON public.usuarios
  FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (
      (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
      AND (SELECT private_auth.current_user_estado()) = 'activo'::text
    )
  );

DROP POLICY IF EXISTS usuarios_update_policy ON public.usuarios;
CREATE POLICY usuarios_update_policy
  ON public.usuarios
  FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (
      (SELECT private_auth.current_user_role()) = 'ADMINISTRADOR'::text
      AND (SELECT private_auth.current_user_estado()) = 'activo'::text
    )
  )
  WITH CHECK (
    id = (SELECT auth.uid())
    OR (
      (SELECT private_auth.current_user_role()) = 'ADMINISTRADOR'::text
      AND (SELECT private_auth.current_user_estado()) = 'activo'::text
    )
  );

DROP POLICY IF EXISTS usuarios_delete_policy ON public.usuarios;
CREATE POLICY usuarios_delete_policy
  ON public.usuarios
  FOR DELETE
  TO authenticated
  USING (
    (SELECT private_auth.current_user_role()) = 'ADMINISTRADOR'::text
    AND (SELECT private_auth.current_user_estado()) = 'activo'::text
  );

DROP POLICY IF EXISTS donante_select_own_donaciones ON public.donaciones;
DROP POLICY IF EXISTS admin_select_donaciones ON public.donaciones;
DROP POLICY IF EXISTS operador_select_donaciones ON public.donaciones;
DROP POLICY IF EXISTS donaciones_select_visible ON public.donaciones;
CREATE POLICY donaciones_select_visible
  ON public.donaciones
  FOR SELECT
  TO authenticated
  USING (
    (
      user_id = (SELECT auth.uid())
      AND (SELECT private_auth.current_user_role()) = 'DONANTE'
      AND (SELECT private_auth.current_user_estado()) = 'activo'
    )
    OR (
      (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
      AND (SELECT private_auth.current_user_estado()) = 'activo'
    )
  );

DROP POLICY IF EXISTS donante_insert_donaciones ON public.donaciones;
CREATE POLICY donante_insert_donaciones
  ON public.donaciones
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND alimento_id IS NOT NULL
    AND (SELECT private_auth.current_user_role()) = 'DONANTE'
    AND (SELECT private_auth.current_user_estado()) = 'activo'
  );

DROP POLICY IF EXISTS "Donantes pueden actualizar sus propias donaciones pendientes" ON public.donaciones;
DROP POLICY IF EXISTS admin_update_donaciones ON public.donaciones;
DROP POLICY IF EXISTS operador_update_donaciones ON public.donaciones;
DROP POLICY IF EXISTS donaciones_update_allowed ON public.donaciones;
CREATE POLICY donaciones_update_allowed
  ON public.donaciones
  FOR UPDATE
  TO authenticated
  USING (
    (
      user_id = (SELECT auth.uid())
      AND estado = 'Pendiente'
      AND (SELECT private_auth.current_user_role()) = 'DONANTE'
      AND (SELECT private_auth.current_user_estado()) = 'activo'
    )
    OR (
      (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
      AND (SELECT private_auth.current_user_estado()) = 'activo'
    )
  )
  WITH CHECK (
    (
      user_id = (SELECT auth.uid())
      AND estado = 'Pendiente'
      AND (SELECT private_auth.current_user_role()) = 'DONANTE'
      AND (SELECT private_auth.current_user_estado()) = 'activo'
    )
    OR (
      (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
      AND (SELECT private_auth.current_user_estado()) = 'activo'
    )
  );

DROP POLICY IF EXISTS "Donantes pueden eliminar sus propias donaciones pendientes" ON public.donaciones;
DROP POLICY IF EXISTS admin_delete_donaciones ON public.donaciones;
DROP POLICY IF EXISTS donaciones_delete_allowed ON public.donaciones;
CREATE POLICY donaciones_delete_allowed
  ON public.donaciones
  FOR DELETE
  TO authenticated
  USING (
    (
      user_id = (SELECT auth.uid())
      AND estado = 'Pendiente'
      AND (SELECT private_auth.current_user_role()) = 'DONANTE'
      AND (SELECT private_auth.current_user_estado()) = 'activo'
    )
    OR (
      (SELECT private_auth.current_user_role()) = 'ADMINISTRADOR'
      AND (SELECT private_auth.current_user_estado()) = 'activo'
    )
  );

DROP POLICY IF EXISTS "Operadores y admins pueden registrar donaciones" ON public.historial_donaciones;
DROP POLICY IF EXISTS historial_donaciones_insert_staff ON public.historial_donaciones;
CREATE POLICY historial_donaciones_insert_staff
  ON public.historial_donaciones
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
    AND (SELECT private_auth.current_user_estado()) = 'activo'
  );

DROP POLICY IF EXISTS "Operadores y admins pueden ver todo el historial" ON public.historial_donaciones;
DROP POLICY IF EXISTS "Usuarios pueden ver historial de sus solicitudes" ON public.historial_donaciones;
DROP POLICY IF EXISTS historial_donaciones_select_visible ON public.historial_donaciones;
CREATE POLICY historial_donaciones_select_visible
  ON public.historial_donaciones
  FOR SELECT
  TO authenticated
  USING (
    (
      (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
      AND (SELECT private_auth.current_user_estado()) = 'activo'
    )
    OR EXISTS (
      SELECT 1
      FROM public.solicitudes
      WHERE solicitudes.id = historial_donaciones.solicitud_id
        AND solicitudes.usuario_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS depositos_select_authenticated_active ON public.depositos;
CREATE POLICY depositos_select_authenticated_active
  ON public.depositos
  FOR SELECT
  TO authenticated
  USING ((SELECT private_auth.current_user_estado()) = 'activo');

DROP POLICY IF EXISTS bajas_productos_update_admin ON public.bajas_productos;
CREATE POLICY bajas_productos_update_admin
  ON public.bajas_productos
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT private_auth.current_user_role()) = 'ADMINISTRADOR'
    AND (SELECT private_auth.current_user_estado()) = 'activo'
  )
  WITH CHECK (
    (SELECT private_auth.current_user_role()) = 'ADMINISTRADOR'
    AND (SELECT private_auth.current_user_estado()) = 'activo'
  );

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notificaciones;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notificaciones;
DROP POLICY IF EXISTS notificaciones_select_own_or_role ON public.notificaciones;
CREATE POLICY notificaciones_select_own_or_role
  ON public.notificaciones
  FOR SELECT
  TO authenticated
  USING (
    activa = true
    AND (SELECT private_auth.current_user_estado()) = 'activo'
    AND (
      destinatario_id = (SELECT auth.uid())
      OR rol_destinatario = (SELECT private_auth.current_user_role())
      OR rol_destinatario = 'TODOS'
    )
  );

DROP POLICY IF EXISTS notificaciones_update_own ON public.notificaciones;
CREATE POLICY notificaciones_update_own
  ON public.notificaciones
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT private_auth.current_user_estado()) = 'activo'
    AND (
      destinatario_id = (SELECT auth.uid())
      OR rol_destinatario = (SELECT private_auth.current_user_role())
      OR rol_destinatario = 'TODOS'
    )
  )
  WITH CHECK (
    (SELECT private_auth.current_user_estado()) = 'activo'
    AND (
      destinatario_id = (SELECT auth.uid())
      OR rol_destinatario = (SELECT private_auth.current_user_role())
      OR rol_destinatario = 'TODOS'
    )
  );

DROP POLICY IF EXISTS notificaciones_insert_authenticated ON public.notificaciones;
DROP POLICY IF EXISTS notificaciones_insert_staff ON public.notificaciones;
CREATE POLICY notificaciones_insert_staff
  ON public.notificaciones
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
    AND (SELECT private_auth.current_user_estado()) = 'activo'
  );

DROP POLICY IF EXISTS notificaciones_delete_admin ON public.notificaciones;
CREATE POLICY notificaciones_delete_admin
  ON public.notificaciones
  FOR DELETE
  TO authenticated
  USING (
    (SELECT private_auth.current_user_role()) = 'ADMINISTRADOR'
    AND (SELECT private_auth.current_user_estado()) = 'activo'
  );

CREATE INDEX IF NOT EXISTS idx_bajas_productos_deposito
  ON public.bajas_productos (id_deposito);

CREATE INDEX IF NOT EXISTS idx_bajas_productos_inventario
  ON public.bajas_productos (id_inventario);

CREATE INDEX IF NOT EXISTS idx_donaciones_usuario_cancelacion
  ON public.donaciones (usuario_cancelacion_id);

CREATE INDEX IF NOT EXISTS idx_solicitudes_alta_alimentos_alimento_creado
  ON public.solicitudes_alta_alimentos (alimento_creado_id);

CREATE INDEX IF NOT EXISTS idx_solicitudes_alta_alimentos_revisado_por
  ON public.solicitudes_alta_alimentos (revisado_por);

CREATE INDEX IF NOT EXISTS idx_solicitudes_alta_alimentos_unidades_unidad
  ON public.solicitudes_alta_alimentos_unidades (unidad_id);

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.alimentos,
  public.alimentos_unidades,
  public.bajas_productos,
  public.configuracion_notificaciones,
  public.conversiones,
  public.depositos,
  public.donante_depositos,
  public.detalles_solicitud,
  public.donaciones,
  public.historial_donaciones,
  public.inventario,
  public.movimiento_inventario_cabecera,
  public.movimiento_inventario_detalle,
  public.notificaciones,
  public.productos_donados,
  public.solicitudes,
  public.solicitudes_alta_alimentos,
  public.solicitudes_alta_alimentos_unidades,
  public.tipos_magnitud,
  public.unidades
TO authenticated;

GRANT SELECT ON TABLE public.usuarios TO authenticated;
GRANT UPDATE (
  tipo_persona,
  cedula,
  ruc,
  direccion,
  telefono,
  nombre,
  representante,
  latitud,
  longitud,
  recibir_notificaciones,
  updated_at
) ON TABLE public.usuarios TO authenticated;

REVOKE UPDATE ON TABLE public.notificaciones FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.notificaciones TO authenticated;
GRANT UPDATE (leida, fecha_leida, activa) ON TABLE public.notificaciones TO authenticated;

GRANT SELECT ON TABLE
  public.v_bajas_productos_detalle,
  public.v_inventario_con_conversiones,
  public.v_inventario_con_unidades,
  public.v_inventario_detallado,
  public.v_movimientos_detallado,
  public.v_productos_duplicados
TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

GRANT EXECUTE ON FUNCTION public.aprobar_solicitud_alta_alimento(uuid, text, text, bigint[], bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convertir_cantidad(numeric, bigint, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dar_baja_producto(uuid, numeric, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_estadisticas_bajas(timestamp with time zone, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_info_producto_inventario(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_productos_proximos_vencer(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_unidades_alimento(bigint) TO authenticated;

REVOKE ALL ON FUNCTION public.cancelar_eliminacion_categoria(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_notificacion(character varying, text, character varying, uuid, character varying, character varying, character varying, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_producto_desde_donacion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_user_estado() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_admin_or_operator() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.limpiar_notificaciones_antiguas() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marcar_notificacion_leida(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obtener_notificaciones_no_leidas(uuid, character varying) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.procesar_eliminaciones_categorias_pendientes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_movimiento_con_unidad(uuid, uuid, numeric, text, bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_notificacion_donacion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_notificacion_solicitud() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_notificacion_usuario() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_bajas_productos_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_donacion_alimento_canonico() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_producto_duplicado() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_tipo_magnitud_alimento() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_unidad_movimiento() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.aprobar_solicitud_alta_alimento(uuid, text, text, bigint[], bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convertir_cantidad(numeric, bigint, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dar_baja_producto(uuid, numeric, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_estadisticas_bajas(timestamp with time zone, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_info_producto_inventario(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_productos_proximos_vencer(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_unidades_alimento(bigint) TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated;

COMMIT;
