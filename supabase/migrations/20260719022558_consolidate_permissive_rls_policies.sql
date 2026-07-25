BEGIN;

DROP POLICY IF EXISTS detalles_solicitud_select_admin_operador ON public.detalles_solicitud;
DROP POLICY IF EXISTS detalles_solicitud_select_own ON public.detalles_solicitud;
DROP POLICY IF EXISTS detalles_solicitud_select_allowed ON public.detalles_solicitud;

CREATE POLICY detalles_solicitud_select_allowed
  ON public.detalles_solicitud
  FOR SELECT
  TO authenticated
  USING (
    (
      (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
      AND (SELECT private_auth.current_user_estado()) = 'activo'::text
    )
    OR (
      (SELECT private_auth.current_user_estado()) = 'activo'::text
      AND EXISTS (
        SELECT 1
        FROM public.solicitudes s
        WHERE s.id = detalles_solicitud.id_solicitud
          AND s.usuario_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS solicitudes_insert_admin_operador ON public.solicitudes;
DROP POLICY IF EXISTS solicitudes_insert_solicitante ON public.solicitudes;
DROP POLICY IF EXISTS solicitudes_insert_allowed ON public.solicitudes;

CREATE POLICY solicitudes_insert_allowed
  ON public.solicitudes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
      AND (SELECT private_auth.current_user_estado()) = 'activo'::text
    )
    OR (
      usuario_id = (SELECT auth.uid())
      AND (SELECT private_auth.current_user_role()) = 'SOLICITANTE'::text
      AND (SELECT private_auth.current_user_estado()) = 'activo'::text
    )
  );

DROP POLICY IF EXISTS solicitudes_select_admin_operador ON public.solicitudes;
DROP POLICY IF EXISTS solicitudes_select_own ON public.solicitudes;
DROP POLICY IF EXISTS solicitudes_select_allowed ON public.solicitudes;

CREATE POLICY solicitudes_select_allowed
  ON public.solicitudes
  FOR SELECT
  TO authenticated
  USING (
    (
      (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
      AND (SELECT private_auth.current_user_estado()) = 'activo'::text
    )
    OR (
      usuario_id = (SELECT auth.uid())
      AND (SELECT private_auth.current_user_role()) = 'SOLICITANTE'::text
      AND (SELECT private_auth.current_user_estado()) = 'activo'::text
    )
  );

DROP POLICY IF EXISTS solicitudes_update_admin_operador ON public.solicitudes;
DROP POLICY IF EXISTS solicitudes_update_own_pending ON public.solicitudes;
DROP POLICY IF EXISTS solicitudes_update_allowed ON public.solicitudes;

CREATE POLICY solicitudes_update_allowed
  ON public.solicitudes
  FOR UPDATE
  TO authenticated
  USING (
    (
      (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
      AND (SELECT private_auth.current_user_estado()) = 'activo'::text
    )
    OR (
      usuario_id = (SELECT auth.uid())
      AND estado = 'pendiente'::text
      AND (SELECT private_auth.current_user_role()) = 'SOLICITANTE'::text
      AND (SELECT private_auth.current_user_estado()) = 'activo'::text
    )
  )
  WITH CHECK (
    (
      (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
      AND (SELECT private_auth.current_user_estado()) = 'activo'::text
    )
    OR (
      usuario_id = (SELECT auth.uid())
      AND (SELECT private_auth.current_user_role()) = 'SOLICITANTE'::text
      AND (SELECT private_auth.current_user_estado()) = 'activo'::text
    )
  );

DROP POLICY IF EXISTS solicitudes_alta_select_admin ON public.solicitudes_alta_alimentos;
DROP POLICY IF EXISTS solicitudes_alta_select_own ON public.solicitudes_alta_alimentos;
DROP POLICY IF EXISTS solicitudes_alta_select_allowed ON public.solicitudes_alta_alimentos;

CREATE POLICY solicitudes_alta_select_allowed
  ON public.solicitudes_alta_alimentos
  FOR SELECT
  TO authenticated
  USING (
    (
      (SELECT private_auth.current_user_role()) = 'ADMINISTRADOR'::text
      AND (SELECT private_auth.current_user_estado()) = 'activo'::text
    )
    OR (
      solicitante_id = (SELECT auth.uid())
      AND (SELECT private_auth.current_user_role()) = 'DONANTE'::text
      AND (SELECT private_auth.current_user_estado()) = 'activo'::text
    )
  );

COMMIT;
