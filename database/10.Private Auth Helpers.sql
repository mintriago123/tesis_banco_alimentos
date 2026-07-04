BEGIN;

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
  WHERE id = auth.uid();
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
  WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION private_auth.current_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION private_auth.current_user_estado() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_auth.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION private_auth.current_user_estado() TO authenticated;

DROP POLICY IF EXISTS usuarios_select_policy ON public.usuarios;
CREATE POLICY usuarios_select_policy
  ON public.usuarios
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
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
    id = auth.uid()
    OR (
      (SELECT private_auth.current_user_role()) = 'ADMINISTRADOR'::text
      AND (SELECT private_auth.current_user_estado()) = 'activo'::text
    )
  )
  WITH CHECK (
    id = auth.uid()
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

REVOKE ALL ON FUNCTION public.get_user_role() FROM authenticated;
REVOKE ALL ON FUNCTION public.get_user_estado() FROM authenticated;

COMMIT;
