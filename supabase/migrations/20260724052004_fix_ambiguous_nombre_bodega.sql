-- Califica las columnas de usuarios para evitar la ambigüedad con la
-- columna de salida `nombre` declarada en RETURNS TABLE.
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

  SELECT u.nombre, u.direccion, u.latitud, u.longitud
  INTO v_nombre_usuario, v_direccion, v_latitud, v_longitud
  FROM public.usuarios AS u
  WHERE u.id = v_user_id
    AND u.rol = 'DONANTE'
    AND u.estado = 'activo';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo un donante activo puede crear su bodega';
  END IF;

  SELECT dd.id_deposito
  INTO v_deposito_id
  FROM public.donante_depositos AS dd
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
  FROM public.depositos AS d
  WHERE d.id_deposito = v_deposito_id
    AND d.activo IS TRUE;
END;
$$;

ALTER FUNCTION public.crear_bodega_principal_donante(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.crear_bodega_principal_donante(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_bodega_principal_donante(text, text) TO authenticated;
