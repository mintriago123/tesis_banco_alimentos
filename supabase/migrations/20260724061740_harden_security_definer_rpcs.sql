BEGIN;

-- Los RPC públicos no deben ser SECURITY DEFINER. La bodega necesita elevar
-- privilegios porque el donante no recibe INSERT directo sobre depósitos ni
-- sobre la relación donante_depositos; esa parte queda en un helper no
-- expuesto mediante la API Data.
CREATE SCHEMA IF NOT EXISTS private_auth;
REVOKE ALL ON SCHEMA private_auth FROM PUBLIC;
GRANT USAGE ON SCHEMA private_auth TO authenticated;

CREATE OR REPLACE FUNCTION private_auth.crear_bodega_principal_donante(
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
    v_nombre := COALESCE(
      NULLIF(trim(p_nombre), ''),
      'Bodega de ' || COALESCE(NULLIF(trim(v_nombre_usuario), ''), 'donante')
    );
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

ALTER FUNCTION private_auth.crear_bodega_principal_donante(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private_auth.crear_bodega_principal_donante(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private_auth.crear_bodega_principal_donante(text, text)
  TO authenticated;

-- El RPC conserva su contrato para el frontend, pero ahora se ejecuta como
-- invoker y delega únicamente la operación privilegiada al helper privado.
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
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT *
  FROM private_auth.crear_bodega_principal_donante($1, $2);
$$;

ALTER FUNCTION public.crear_bodega_principal_donante(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.crear_bodega_principal_donante(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_bodega_principal_donante(text, text)
  TO authenticated;

-- Estas dos operaciones ya validan dentro de la función que el usuario sea un
-- administrador u operador activo. Las políticas RLS de entradas_inventario e
-- inventario permiten exactamente ese mismo acceso, por lo que no necesitan
-- privilegios de SECURITY DEFINER.
ALTER FUNCTION public.descontar_stock_por_lote(uuid, uuid, numeric, bigint)
  SECURITY INVOKER;
ALTER FUNCTION public.restaurar_entrada_inventario(uuid, numeric)
  SECURITY INVOKER;

REVOKE ALL ON FUNCTION public.descontar_stock_por_lote(uuid, uuid, numeric, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.descontar_stock_por_lote(uuid, uuid, numeric, bigint)
  TO authenticated;

REVOKE ALL ON FUNCTION public.restaurar_entrada_inventario(uuid, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_entrada_inventario(uuid, numeric)
  TO authenticated;

COMMENT ON FUNCTION public.crear_bodega_principal_donante(text, text) IS
  'Wrapper SECURITY INVOKER; la escritura privilegiada se delega al helper private_auth.';
COMMENT ON FUNCTION public.descontar_stock_por_lote(uuid, uuid, numeric, bigint) IS
  'Descuento FEFO con validación de rol y RLS del usuario invocador.';
COMMENT ON FUNCTION public.restaurar_entrada_inventario(uuid, numeric) IS
  'Restauración de inventario con validación de rol y RLS del usuario invocador.';

COMMIT;
