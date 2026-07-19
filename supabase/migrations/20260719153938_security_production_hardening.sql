BEGIN;

-- Rate limit y auditoría para proxys server-side de cédula/RUC.
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  window_start timestamp with time zone NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT api_rate_limits_endpoint_check
    CHECK (endpoint = ANY (ARRAY['consulta_cedula'::text, 'consulta_ruc'::text])),
  CONSTRAINT api_rate_limits_request_count_check CHECK (request_count >= 0),
  CONSTRAINT api_rate_limits_unique_window UNIQUE (user_id, endpoint, window_start)
);

CREATE TABLE IF NOT EXISTS public.api_document_lookup_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  endpoint text NOT NULL,
  document_hash text NOT NULL,
  status text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT api_document_lookup_endpoint_check
    CHECK (endpoint = ANY (ARRAY['consulta_cedula'::text, 'consulta_ruc'::text])),
  CONSTRAINT api_document_lookup_status_check
    CHECK (status = ANY (ARRAY['allowed'::text, 'blocked_rate_limit'::text])),
  CONSTRAINT api_document_lookup_hash_check
    CHECK (document_hash ~ '^[a-f0-9]{64}$')
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_document_lookup_audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_user_endpoint_window
  ON public.api_rate_limits (user_id, endpoint, window_start DESC);

CREATE INDEX IF NOT EXISTS idx_api_document_lookup_audit_log_user_created
  ON public.api_document_lookup_audit_log (user_id, created_at DESC);

REVOKE ALL ON TABLE public.api_rate_limits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.api_document_lookup_audit_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.api_rate_limits TO service_role;
GRANT ALL ON TABLE public.api_document_lookup_audit_log TO service_role;

CREATE OR REPLACE FUNCTION public.consume_document_lookup_quota(
  p_user_id uuid,
  p_endpoint text,
  p_window_start timestamp with time zone,
  p_limit integer,
  p_window_seconds integer
) RETURNS TABLE(allowed boolean, requests_used integer, reset_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_reset_at timestamp with time zone;
BEGIN
  IF p_limit < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'Invalid rate limit configuration';
  END IF;

  v_reset_at := p_window_start + make_interval(secs => p_window_seconds);

  INSERT INTO public.api_rate_limits (user_id, endpoint, window_start, request_count)
  VALUES (p_user_id, p_endpoint, p_window_start, 1)
  ON CONFLICT (user_id, endpoint, window_start)
  DO UPDATE
    SET request_count = public.api_rate_limits.request_count + 1,
        updated_at = now()
    WHERE public.api_rate_limits.request_count < p_limit
  RETURNING request_count INTO v_count;

  IF v_count IS NULL THEN
    SELECT request_count
    INTO v_count
    FROM public.api_rate_limits
    WHERE user_id = p_user_id
      AND endpoint = p_endpoint
      AND window_start = p_window_start;

    RETURN QUERY SELECT false, COALESCE(v_count, p_limit), v_reset_at;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_count, v_reset_at;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_document_lookup_quota(uuid, text, timestamp with time zone, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_document_lookup_quota(uuid, text, timestamp with time zone, integer, integer)
  TO service_role;

-- Constraints de calidad de datos en usuarios. Valores vacíos se normalizan a NULL.
UPDATE public.usuarios SET cedula = NULL WHERE cedula IS NOT NULL AND btrim(cedula) = '';
UPDATE public.usuarios SET ruc = NULL WHERE ruc IS NOT NULL AND btrim(ruc) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_cedula_format_check'
  ) THEN
    ALTER TABLE public.usuarios
      ADD CONSTRAINT usuarios_cedula_format_check
      CHECK (cedula IS NULL OR cedula ~ '^[0-9]{10}$')
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_ruc_format_check'
  ) THEN
    ALTER TABLE public.usuarios
      ADD CONSTRAINT usuarios_ruc_format_check
      CHECK (ruc IS NULL OR ruc ~ '^[0-9]{13}$')
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_latitud_range_check'
  ) THEN
    ALTER TABLE public.usuarios
      ADD CONSTRAINT usuarios_latitud_range_check
      CHECK (latitud IS NULL OR (latitud >= '-90'::double precision AND latitud <= '90'::double precision))
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_longitud_range_check'
  ) THEN
    ALTER TABLE public.usuarios
      ADD CONSTRAINT usuarios_longitud_range_check
      CHECK (longitud IS NULL OR (longitud >= '-180'::double precision AND longitud <= '180'::double precision))
      NOT VALID;
  END IF;
END;
$$;

-- Lectura directa de inventario y bajas solo para staff operativo activo.
DROP POLICY IF EXISTS inventario_select_usuarios_activos ON public.inventario;
DROP POLICY IF EXISTS inventario_select_staff ON public.inventario;
CREATE POLICY inventario_select_staff
  ON public.inventario
  FOR SELECT
  TO authenticated
  USING (
    (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
    AND (SELECT private_auth.current_user_estado()) = 'activo'::text
  );

DROP POLICY IF EXISTS bajas_productos_select_authenticated ON public.bajas_productos;
DROP POLICY IF EXISTS bajas_productos_select_staff ON public.bajas_productos;
CREATE POLICY bajas_productos_select_staff
  ON public.bajas_productos
  FOR SELECT
  TO authenticated
  USING (
    (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
    AND (SELECT private_auth.current_user_estado()) = 'activo'::text
  );

DROP POLICY IF EXISTS productos_donados_select_usuarios_activos ON public.productos_donados;
DROP POLICY IF EXISTS productos_donados_select_staff_or_owner ON public.productos_donados;
CREATE POLICY productos_donados_select_staff_or_owner
  ON public.productos_donados
  FOR SELECT
  TO authenticated
  USING (
    (
      (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
      AND (SELECT private_auth.current_user_estado()) = 'activo'::text
    )
    OR (
      id_usuario = (SELECT auth.uid())
      AND (SELECT private_auth.current_user_role()) = 'DONANTE'::text
      AND (SELECT private_auth.current_user_estado()) = 'activo'::text
    )
  );

-- Las vistas operativas siguen siendo security_invoker; estas grants solo permiten que RLS decida filas.
ALTER VIEW public.v_bajas_productos_detalle SET (security_invoker = true);
ALTER VIEW public.v_inventario_con_conversiones SET (security_invoker = true);
ALTER VIEW public.v_inventario_con_unidades SET (security_invoker = true);
ALTER VIEW public.v_inventario_detallado SET (security_invoker = true);
ALTER VIEW public.v_movimientos_detallado SET (security_invoker = true);
ALTER VIEW public.v_productos_duplicados SET (security_invoker = true);

-- RPC operativas sensibles: solo service_role; el acceso del usuario pasa por API routes.
CREATE OR REPLACE FUNCTION public.aprobar_solicitud_alta_alimento_server(
  p_admin_id uuid,
  p_solicitud_id uuid,
  p_nombre text,
  p_categoria text,
  p_unidad_ids bigint[],
  p_unidad_principal_id bigint
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_alimento_id bigint;
  v_unidad_id bigint;
  v_unidad_ids bigint[];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.usuarios
    WHERE id = p_admin_id
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
      revisado_por = p_admin_id,
      fecha_revision = now(),
      updated_at = now()
  WHERE id = p_solicitud_id;

  RETURN v_alimento_id;
END;
$$;

ALTER FUNCTION public.aprobar_solicitud_alta_alimento(uuid, text, text, bigint[], bigint)
  SECURITY INVOKER;

REVOKE ALL ON FUNCTION public.aprobar_solicitud_alta_alimento(uuid, text, text, bigint[], bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aprobar_solicitud_alta_alimento_server(uuid, uuid, text, text, bigint[], bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_solicitud_alta_alimento_server(uuid, uuid, text, text, bigint[], bigint)
  TO service_role;

REVOKE ALL ON FUNCTION public.dar_baja_producto(uuid, numeric, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obtener_estadisticas_bajas(timestamp with time zone, timestamp with time zone)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obtener_productos_proximos_vencer(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obtener_info_producto_inventario(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.dar_baja_producto(uuid, numeric, text, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.obtener_estadisticas_bajas(timestamp with time zone, timestamp with time zone)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.obtener_productos_proximos_vencer(integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.obtener_info_producto_inventario(uuid)
  TO service_role;

COMMIT;
