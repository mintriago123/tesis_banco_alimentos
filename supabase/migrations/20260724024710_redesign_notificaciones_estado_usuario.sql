BEGIN;

-- Las notificaciones son contenido global e inmutable. La lectura y el
-- ocultamiento pertenecen al usuario que recibe cada notificación.

-- Reescribir las funciones heredadas antes de quitar las columnas antiguas.
CREATE OR REPLACE FUNCTION public.crear_notificacion(
  p_titulo character varying,
  p_mensaje text,
  p_tipo character varying,
  p_destinatario_id uuid,
  p_rol_destinatario character varying,
  p_categoria character varying,
  p_url_accion character varying DEFAULT NULL::character varying,
  p_metadatos jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_notificacion_id uuid;
BEGIN
  INSERT INTO public.notificaciones (
    titulo,
    mensaje,
    tipo,
    destinatario_id,
    rol_destinatario,
    categoria,
    url_accion,
    metadatos,
    fecha_creacion
  )
  VALUES (
    p_titulo,
    p_mensaje,
    COALESCE(p_tipo, 'info'),
    p_destinatario_id,
    p_rol_destinatario,
    p_categoria,
    p_url_accion,
    COALESCE(p_metadatos, '{}'::jsonb),
    now()
  )
  RETURNING id INTO v_notificacion_id;

  RETURN v_notificacion_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.limpiar_notificaciones_antiguas() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.notificaciones
  WHERE expira_en IS NOT NULL
    AND expira_en <= now();
END;
$$;

DROP FUNCTION IF EXISTS public.marcar_notificacion_leida(uuid, uuid);
DROP FUNCTION IF EXISTS public.obtener_notificaciones_no_leidas(uuid, character varying);

-- Tabla de estado por usuario.
CREATE TABLE IF NOT EXISTS public.notificaciones_usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacion_id uuid NOT NULL
    REFERENCES public.notificaciones(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL
    REFERENCES public.usuarios(id) ON DELETE CASCADE,
  leida boolean NOT NULL DEFAULT false,
  oculta boolean NOT NULL DEFAULT false,
  fecha_lectura timestamp with time zone,
  fecha_ocultacion timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notificaciones_usuario_notificacion_usuario_key
    UNIQUE (notificacion_id, usuario_id)
);

COMMENT ON TABLE public.notificaciones_usuario IS
  'Estado de lectura y ocultamiento de cada notificacion por usuario';

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_usuario_notificacion
  ON public.notificaciones_usuario (usuario_id, notificacion_id);

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_usuario_visible
  ON public.notificaciones_usuario (usuario_id, oculta, notificacion_id);

DROP TRIGGER IF EXISTS trigger_notificaciones_usuario_updated_at
  ON public.notificaciones_usuario;
CREATE TRIGGER trigger_notificaciones_usuario_updated_at
  BEFORE UPDATE ON public.notificaciones_usuario
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Migrar el estado existente únicamente para usuarios que eran elegibles y
-- estaban activos en el momento de la migración.
INSERT INTO public.notificaciones_usuario (
  notificacion_id,
  usuario_id,
  leida,
  oculta,
  fecha_lectura,
  created_at,
  updated_at
)
SELECT
  n.id,
  u.id,
  COALESCE(n.leida, false),
  false,
  n.fecha_leida,
  now(),
  now()
FROM public.notificaciones AS n
JOIN public.usuarios AS u
  ON u.estado = 'activo'
 AND (
   n.destinatario_id = u.id
   OR n.rol_destinatario = u.rol
   OR n.rol_destinatario = 'TODOS'
 )
WHERE n.activa IS TRUE
ON CONFLICT (notificacion_id, usuario_id) DO NOTHING;

-- Los registros que antes estaban inactivos dejan de ser visibles mediante
-- la única regla global de visibilidad: expira_en.
UPDATE public.notificaciones
SET expira_en = now()
WHERE activa IS FALSE
  AND (expira_en IS NULL OR expira_en > now());

-- Eliminar todas las políticas heredadas que permitían modificar la tabla
-- global o que todavía dependían de las columnas antiguas.
DROP POLICY IF EXISTS "Users can view their own notifications"
  ON public.notificaciones;
DROP POLICY IF EXISTS "Users can update their own notifications"
  ON public.notificaciones;
DROP POLICY IF EXISTS notificaciones_select_own_or_role
  ON public.notificaciones;
DROP POLICY IF EXISTS notificaciones_update_own
  ON public.notificaciones;
DROP POLICY IF EXISTS notificaciones_insert_authenticated
  ON public.notificaciones;
DROP POLICY IF EXISTS notificaciones_insert_staff
  ON public.notificaciones;
DROP POLICY IF EXISTS notificaciones_delete_admin
  ON public.notificaciones;

DROP INDEX IF EXISTS public.idx_notificaciones_leida;
DROP INDEX IF EXISTS public.idx_notificaciones_activa;

REVOKE UPDATE (leida, fecha_leida, activa)
  ON TABLE public.notificaciones FROM authenticated;
REVOKE UPDATE ON TABLE public.notificaciones
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE INSERT ON TABLE public.notificaciones
  FROM anon, authenticated;
REVOKE ALL ON TABLE public.notificaciones FROM anon;

ALTER TABLE public.notificaciones
  DROP COLUMN IF EXISTS leida,
  DROP COLUMN IF EXISTS fecha_leida,
  DROP COLUMN IF EXISTS activa;

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones_usuario ENABLE ROW LEVEL SECURITY;

-- Las notificaciones se pueden leer solo si pertenecen al usuario, a su rol
-- o a TODOS, y si todavía no expiraron. No existe una política UPDATE.
CREATE POLICY notificaciones_select_visible
  ON public.notificaciones
  FOR SELECT
  TO authenticated
  USING (
    (SELECT private_auth.current_user_estado()) = 'activo'
    AND (expira_en IS NULL OR expira_en > now())
    AND (
      destinatario_id = (SELECT auth.uid())
      OR rol_destinatario = (SELECT private_auth.current_user_role())
      OR rol_destinatario = 'TODOS'
    )
  );

-- La eliminación de contenido global queda reservada para administración.
-- La limpieza programada usa la función SECURITY DEFINER anterior.
CREATE POLICY notificaciones_delete_admin
  ON public.notificaciones
  FOR DELETE
  TO authenticated
  USING (
    (SELECT private_auth.current_user_role()) = 'ADMINISTRADOR'
    AND (SELECT private_auth.current_user_estado()) = 'activo'
  );

-- El estado individual sí puede ser consultado y modificado, pero solo por
-- el usuario dueño de la fila. UPDATE conserva el ownership con WITH CHECK.
DROP POLICY IF EXISTS notificaciones_usuario_select_own
  ON public.notificaciones_usuario;
CREATE POLICY notificaciones_usuario_select_own
  ON public.notificaciones_usuario
  FOR SELECT
  TO authenticated
  USING (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notificaciones_usuario_insert_own
  ON public.notificaciones_usuario;
CREATE POLICY notificaciones_usuario_insert_own
  ON public.notificaciones_usuario
  FOR INSERT
  TO authenticated
  WITH CHECK (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notificaciones_usuario_update_own
  ON public.notificaciones_usuario;
CREATE POLICY notificaciones_usuario_update_own
  ON public.notificaciones_usuario
  FOR UPDATE
  TO authenticated
  USING (usuario_id = (SELECT auth.uid()))
  WITH CHECK (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notificaciones_usuario_delete_own
  ON public.notificaciones_usuario;
CREATE POLICY notificaciones_usuario_delete_own
  ON public.notificaciones_usuario
  FOR DELETE
  TO authenticated
  USING (usuario_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.notificaciones_usuario FROM anon;
GRANT SELECT ON TABLE public.notificaciones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.notificaciones_usuario TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.notificaciones TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.notificaciones_usuario TO service_role;

-- RPC de lectura y estado. Todas son SECURITY INVOKER: RLS y los grants del
-- usuario autenticado se aplican durante su ejecución.
CREATE OR REPLACE FUNCTION public.obtener_notificaciones_usuario(
  p_limite integer DEFAULT 50
) RETURNS TABLE (
  id uuid,
  titulo character varying,
  mensaje text,
  tipo character varying,
  categoria character varying,
  url_accion character varying,
  metadatos jsonb,
  fecha_creacion timestamp with time zone,
  leida boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    n.id,
    n.titulo,
    n.mensaje,
    n.tipo,
    n.categoria,
    n.url_accion,
    n.metadatos,
    n.fecha_creacion,
    COALESCE(nu.leida, false) AS leida
  FROM public.notificaciones AS n
  LEFT JOIN public.notificaciones_usuario AS nu
    ON nu.notificacion_id = n.id
   AND nu.usuario_id = (SELECT auth.uid())
  WHERE (SELECT private_auth.current_user_estado()) = 'activo'
    AND (
      n.destinatario_id = (SELECT auth.uid())
      OR n.rol_destinatario = (SELECT private_auth.current_user_role())
      OR n.rol_destinatario = 'TODOS'
    )
    AND (n.expira_en IS NULL OR n.expira_en > now())
    AND COALESCE(nu.oculta, false) IS FALSE
  ORDER BY n.fecha_creacion DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limite, 50), 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.marcar_notificacion_leida(
  p_notificacion_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_usuario_id uuid := (SELECT auth.uid());
  v_resultado boolean := false;
BEGIN
  IF v_usuario_id IS NULL
     OR (SELECT private_auth.current_user_estado()) <> 'activo' THEN
    RETURN false;
  END IF;

  INSERT INTO public.notificaciones_usuario AS nu (
    notificacion_id,
    usuario_id,
    leida,
    fecha_lectura,
    oculta,
    created_at,
    updated_at
  )
  SELECT
    n.id,
    v_usuario_id,
    true,
    now(),
    false,
    now(),
    now()
  FROM public.notificaciones AS n
  WHERE n.id = p_notificacion_id
    AND (
      n.destinatario_id = v_usuario_id
      OR n.rol_destinatario = (SELECT private_auth.current_user_role())
      OR n.rol_destinatario = 'TODOS'
    )
    AND (n.expira_en IS NULL OR n.expira_en > now())
  ON CONFLICT (notificacion_id, usuario_id) DO UPDATE
    SET leida = true,
        fecha_lectura = COALESCE(nu.fecha_lectura, EXCLUDED.fecha_lectura),
        updated_at = now()
    WHERE nu.oculta IS FALSE
  RETURNING true INTO v_resultado;

  RETURN COALESCE(v_resultado, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.marcar_todas_notificaciones_leidas()
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_usuario_id uuid := (SELECT auth.uid());
BEGIN
  IF v_usuario_id IS NULL
     OR (SELECT private_auth.current_user_estado()) <> 'activo' THEN
    RETURN false;
  END IF;

  INSERT INTO public.notificaciones_usuario AS nu (
    notificacion_id,
    usuario_id,
    leida,
    fecha_lectura,
    oculta,
    created_at,
    updated_at
  )
  SELECT
    n.id,
    v_usuario_id,
    true,
    now(),
    false,
    now(),
    now()
  FROM public.notificaciones AS n
  LEFT JOIN public.notificaciones_usuario AS existente
    ON existente.notificacion_id = n.id
   AND existente.usuario_id = v_usuario_id
  WHERE (
      n.destinatario_id = v_usuario_id
      OR n.rol_destinatario = (SELECT private_auth.current_user_role())
      OR n.rol_destinatario = 'TODOS'
    )
    AND (n.expira_en IS NULL OR n.expira_en > now())
    AND COALESCE(existente.oculta, false) IS FALSE
  ON CONFLICT (notificacion_id, usuario_id) DO UPDATE
    SET leida = true,
        fecha_lectura = COALESCE(nu.fecha_lectura, EXCLUDED.fecha_lectura),
        updated_at = now()
    WHERE nu.oculta IS FALSE;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.ocultar_notificacion(
  p_notificacion_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_usuario_id uuid := (SELECT auth.uid());
  v_resultado boolean := false;
BEGIN
  IF v_usuario_id IS NULL
     OR (SELECT private_auth.current_user_estado()) <> 'activo' THEN
    RETURN false;
  END IF;

  INSERT INTO public.notificaciones_usuario AS nu (
    notificacion_id,
    usuario_id,
    leida,
    oculta,
    fecha_ocultacion,
    created_at,
    updated_at
  )
  SELECT
    n.id,
    v_usuario_id,
    false,
    true,
    now(),
    now(),
    now()
  FROM public.notificaciones AS n
  WHERE n.id = p_notificacion_id
    AND (
      n.destinatario_id = v_usuario_id
      OR n.rol_destinatario = (SELECT private_auth.current_user_role())
      OR n.rol_destinatario = 'TODOS'
    )
    AND (n.expira_en IS NULL OR n.expira_en > now())
  ON CONFLICT (notificacion_id, usuario_id) DO UPDATE
    SET oculta = true,
        fecha_ocultacion = COALESCE(nu.fecha_ocultacion, EXCLUDED.fecha_ocultacion),
        updated_at = now()
  RETURNING true INTO v_resultado;

  RETURN COALESCE(v_resultado, false);
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_notificaciones_usuario(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marcar_notificacion_leida(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marcar_todas_notificaciones_leidas()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ocultar_notificacion(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.obtener_notificaciones_usuario(integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_notificacion_leida(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_todas_notificaciones_leidas()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.ocultar_notificacion(uuid)
  TO authenticated;

-- Las funciones internas de creación y limpieza siguen reservadas a procesos
-- del servidor o administrativos.
REVOKE ALL ON FUNCTION public.crear_notificacion(
  character varying, text, character varying, uuid, character varying,
  character varying, character varying, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.limpiar_notificaciones_antiguas()
  FROM PUBLIC, anon, authenticated;

-- Mantener la tabla global y añadir el estado individual a Realtime. El
-- frontend filtra la segunda por usuario_id y las dos tablas por RLS.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notificaciones_usuario'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.notificaciones_usuario;
  END IF;
END;
$$;

COMMIT;
