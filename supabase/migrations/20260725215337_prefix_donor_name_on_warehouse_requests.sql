BEGIN;

-- Las bodegas deben poder identificarse por propietario y referencia. El
-- nombre final queda como: "Nombre del usuario/empresa - Nombre ingresado".
CREATE OR REPLACE FUNCTION private_auth.formatear_nombre_bodega(
  p_donante_id uuid,
  p_nombre text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_propietario text;
  v_referencia text := btrim(COALESCE(p_nombre, ''));
  v_prefijo text;
  v_nombre_final text;
BEGIN
  SELECT NULLIF(btrim(u.nombre), '')
  INTO v_propietario
  FROM public.usuarios AS u
  WHERE u.id = p_donante_id;

  v_prefijo := COALESCE(v_propietario, 'Donante');

  -- Evita duplicar el prefijo al aprobar solicitudes antiguas o al volver a
  -- procesar una solicitud que ya fue normalizada.
  IF lower(left(v_referencia, length(v_prefijo) + 3)) = lower(v_prefijo || ' - ') THEN
    v_nombre_final := v_referencia;
  ELSE
    v_nombre_final := v_prefijo || ' - ' || v_referencia;
  END IF;

  IF length(v_nombre_final) > 150 THEN
    RAISE EXCEPTION 'El nombre final de la bodega no puede superar los 150 caracteres';
  END IF;

  RETURN v_nombre_final;
END;
$$;

ALTER FUNCTION private_auth.formatear_nombre_bodega(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private_auth.formatear_nombre_bodega(uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private_auth.crear_solicitud_bodega(
  p_tipo text,
  p_nombre text,
  p_direccion text,
  p_telefono text,
  p_descripcion text,
  p_id_deposito uuid,
  p_latitud double precision,
  p_longitud double precision
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario_id uuid := (SELECT auth.uid());
  v_tipo text := upper(btrim(COALESCE(p_tipo, '')));
  v_nombre text := btrim(COALESCE(p_nombre, ''));
  v_direccion text := btrim(COALESCE(p_direccion, ''));
  v_telefono text := btrim(COALESCE(p_telefono, ''));
  v_id uuid;
BEGIN
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = v_usuario_id AND rol = 'DONANTE' AND estado = 'activo'
  ) THEN
    RAISE EXCEPTION 'Solo un donante activo puede solicitar una bodega';
  END IF;

  IF v_tipo NOT IN ('ALTA', 'MODIFICACION') THEN
    RAISE EXCEPTION 'El tipo de solicitud no es válido';
  END IF;
  IF length(v_nombre) NOT BETWEEN 2 AND 150 THEN
    RAISE EXCEPTION 'El nombre de la bodega debe tener entre 2 y 150 caracteres';
  END IF;
  IF length(v_direccion) NOT BETWEEN 5 AND 250 THEN
    RAISE EXCEPTION 'La dirección debe tener entre 5 y 250 caracteres';
  END IF;
  IF length(v_telefono) NOT BETWEEN 7 AND 30 THEN
    RAISE EXCEPTION 'El teléfono debe tener entre 7 y 30 caracteres';
  END IF;
  IF p_latitud IS NOT NULL AND (p_latitud < -90 OR p_latitud > 90) THEN
    RAISE EXCEPTION 'La latitud está fuera de rango';
  END IF;
  IF p_longitud IS NOT NULL AND (p_longitud < -180 OR p_longitud > 180) THEN
    RAISE EXCEPTION 'La longitud está fuera de rango';
  END IF;

  IF v_tipo = 'ALTA' AND p_id_deposito IS NOT NULL THEN
    RAISE EXCEPTION 'Una solicitud de alta no puede incluir una bodega existente';
  END IF;

  IF v_tipo = 'MODIFICACION' THEN
    IF p_id_deposito IS NULL THEN
      RAISE EXCEPTION 'La bodega a modificar es obligatoria';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.donante_depositos AS dd
      JOIN public.depositos AS d ON d.id_deposito = dd.id_deposito
      WHERE dd.donante_id = v_usuario_id
        AND dd.id_deposito = p_id_deposito
        AND dd.activo IS TRUE
        AND d.activo IS TRUE
    ) THEN
      RAISE EXCEPTION 'La bodega no pertenece al donante o está inactiva';
    END IF;
  END IF;

  IF v_tipo = 'ALTA' THEN
    v_nombre := private_auth.formatear_nombre_bodega(v_usuario_id, v_nombre);

    IF EXISTS (
      SELECT 1
      FROM public.donante_depositos AS dd
      JOIN public.depositos AS d ON d.id_deposito = dd.id_deposito
      WHERE dd.donante_id = v_usuario_id
        AND dd.activo IS TRUE
        AND d.activo IS TRUE
        AND lower(btrim(d.nombre)) = lower(v_nombre)
    ) THEN
      RAISE EXCEPTION 'Ya existe una bodega activa con ese nombre';
    END IF;
  END IF;

  INSERT INTO public.solicitudes_bodega (
    donante_id, id_deposito, tipo, nombre, descripcion, direccion,
    telefono, latitud, longitud
  )
  VALUES (
    v_usuario_id, p_id_deposito, v_tipo, v_nombre,
    NULLIF(btrim(COALESCE(p_descripcion, '')), ''), v_direccion,
    v_telefono, p_latitud, p_longitud
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION private_auth.aprobar_solicitud_bodega(p_solicitud_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario_id uuid := (SELECT auth.uid());
  v_solicitud public.solicitudes_bodega%ROWTYPE;
  v_deposito_id uuid;
  v_nombre text;
BEGIN
  IF v_usuario_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = v_usuario_id
      AND rol = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
      AND estado = 'activo'
  ) THEN
    RAISE EXCEPTION 'Solo un administrador u operador activo puede aprobar solicitudes';
  END IF;

  SELECT * INTO v_solicitud
  FROM public.solicitudes_bodega
  WHERE id = p_solicitud_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La solicitud de bodega no existe';
  END IF;
  IF v_solicitud.estado <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo se pueden aprobar solicitudes pendientes';
  END IF;

  IF v_solicitud.tipo = 'MODIFICACION' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.donante_depositos AS dd
      JOIN public.depositos AS d ON d.id_deposito = dd.id_deposito
      WHERE dd.donante_id = v_solicitud.donante_id
        AND dd.id_deposito = v_solicitud.id_deposito
        AND dd.activo IS TRUE
        AND d.activo IS TRUE
    ) THEN
      RAISE EXCEPTION 'La bodega a modificar ya no está activa';
    END IF;

    UPDATE public.depositos
    SET nombre = v_solicitud.nombre,
        descripcion = v_solicitud.descripcion,
        direccion = v_solicitud.direccion,
        telefono = v_solicitud.telefono,
        latitud = v_solicitud.latitud,
        longitud = v_solicitud.longitud,
        activo = true
    WHERE id_deposito = v_solicitud.id_deposito;

    v_deposito_id := v_solicitud.id_deposito;
  ELSE
    v_nombre := private_auth.formatear_nombre_bodega(
      v_solicitud.donante_id,
      v_solicitud.nombre
    );

    IF EXISTS (
      SELECT 1
      FROM public.donante_depositos AS dd
      JOIN public.depositos AS d ON d.id_deposito = dd.id_deposito
      WHERE dd.donante_id = v_solicitud.donante_id
        AND dd.activo IS TRUE
        AND d.activo IS TRUE
        AND lower(btrim(d.nombre)) = lower(btrim(v_nombre))
    ) THEN
      RAISE EXCEPTION 'Ya existe una bodega activa con ese nombre';
    END IF;

    INSERT INTO public.depositos (
      nombre, descripcion, direccion, telefono, latitud, longitud, activo
    )
    VALUES (
      v_nombre, v_solicitud.descripcion, v_solicitud.direccion,
      v_solicitud.telefono, v_solicitud.latitud, v_solicitud.longitud, true
    )
    RETURNING id_deposito INTO v_deposito_id;

    INSERT INTO public.donante_depositos (
      donante_id, id_deposito, es_principal, activo
    )
    VALUES (v_solicitud.donante_id, v_deposito_id, false, true);
  END IF;

  UPDATE public.solicitudes_bodega
  SET estado = 'APROBADA', revisado_por = v_usuario_id, revisado_at = now()
  WHERE id = v_solicitud.id;

  RETURN v_deposito_id;
END;
$$;

ALTER FUNCTION private_auth.crear_solicitud_bodega(text, text, text, text, text, uuid, double precision, double precision) OWNER TO postgres;
ALTER FUNCTION private_auth.aprobar_solicitud_bodega(uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION private_auth.crear_solicitud_bodega(text, text, text, text, text, uuid, double precision, double precision)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private_auth.aprobar_solicitud_bodega(uuid)
  FROM PUBLIC, anon, authenticated;

COMMIT;
