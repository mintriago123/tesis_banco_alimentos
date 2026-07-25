BEGIN;

-- Gestión de bodegas por solicitud. Las escrituras sobre depósitos y su
-- relación con el donante quedan encapsuladas en RPC protegidos.
ALTER TABLE public.depositos
  ADD COLUMN IF NOT EXISTS telefono text;

UPDATE public.depositos AS d
SET telefono = u.telefono
FROM public.donante_depositos AS dd
JOIN public.usuarios AS u ON u.id = dd.donante_id
WHERE dd.id_deposito = d.id_deposito
  AND dd.es_principal IS TRUE
  AND dd.activo IS TRUE
  AND d.telefono IS NULL;

ALTER TABLE public.donaciones
  ADD COLUMN IF NOT EXISTS id_deposito uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'donaciones_id_deposito_fkey'
      AND conrelid = 'public.donaciones'::regclass
  ) THEN
    ALTER TABLE public.donaciones
      ADD CONSTRAINT donaciones_id_deposito_fkey
      FOREIGN KEY (id_deposito)
      REFERENCES public.depositos(id_deposito)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

-- Las donaciones históricas conservan su información y se asocian al mapeo
-- principal conocido. Las que no tienen mapeo quedan con NULL para revisión.
UPDATE public.donaciones AS d
SET id_deposito = dd.id_deposito
FROM public.donante_depositos AS dd
JOIN public.depositos AS dep ON dep.id_deposito = dd.id_deposito
WHERE d.id_deposito IS NULL
  AND d.user_id = dd.donante_id
  AND dd.es_principal IS TRUE
  AND dd.activo IS TRUE
  AND dep.activo IS TRUE;

CREATE INDEX IF NOT EXISTS idx_donaciones_id_deposito
  ON public.donaciones(id_deposito);

CREATE TABLE IF NOT EXISTS public.solicitudes_bodega (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donante_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  id_deposito uuid REFERENCES public.depositos(id_deposito) ON DELETE RESTRICT,
  tipo text NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  direccion text NOT NULL,
  telefono text NOT NULL,
  latitud double precision,
  longitud double precision,
  estado text NOT NULL DEFAULT 'PENDIENTE',
  motivo_rechazo text,
  revisado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  revisado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT solicitudes_bodega_tipo_check
    CHECK (tipo IN ('ALTA', 'MODIFICACION')),
  CONSTRAINT solicitudes_bodega_estado_check
    CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA')),
  CONSTRAINT solicitudes_bodega_tipo_deposito_check
    CHECK ((tipo = 'ALTA' AND id_deposito IS NULL) OR
           (tipo = 'MODIFICACION' AND id_deposito IS NOT NULL)),
  CONSTRAINT solicitudes_bodega_nombre_check
    CHECK (length(btrim(nombre)) BETWEEN 2 AND 150),
  CONSTRAINT solicitudes_bodega_direccion_check
    CHECK (length(btrim(direccion)) BETWEEN 5 AND 250),
  CONSTRAINT solicitudes_bodega_telefono_check
    CHECK (length(btrim(telefono)) BETWEEN 7 AND 30),
  CONSTRAINT solicitudes_bodega_latitud_check
    CHECK (latitud IS NULL OR latitud BETWEEN -90 AND 90),
  CONSTRAINT solicitudes_bodega_longitud_check
    CHECK (longitud IS NULL OR longitud BETWEEN -180 AND 180),
  CONSTRAINT solicitudes_bodega_rechazo_check
    CHECK (estado <> 'RECHAZADA' OR length(btrim(COALESCE(motivo_rechazo, ''))) >= 5)
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_bodega_donante_estado
  ON public.solicitudes_bodega(donante_id, estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_solicitudes_bodega_estado_created
  ON public.solicitudes_bodega(estado, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS solicitudes_bodega_alta_pendiente_unica
  ON public.solicitudes_bodega(donante_id, lower(btrim(nombre)))
  WHERE tipo = 'ALTA' AND estado = 'PENDIENTE';
CREATE UNIQUE INDEX IF NOT EXISTS solicitudes_bodega_modificacion_pendiente_unica
  ON public.solicitudes_bodega(donante_id, id_deposito)
  WHERE tipo = 'MODIFICACION' AND estado = 'PENDIENTE';

DROP TRIGGER IF EXISTS trigger_solicitudes_bodega_updated_at
  ON public.solicitudes_bodega;
CREATE TRIGGER trigger_solicitudes_bodega_updated_at
  BEFORE UPDATE ON public.solicitudes_bodega
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.solicitudes_bodega ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS solicitudes_bodega_select_visible ON public.solicitudes_bodega;
CREATE POLICY solicitudes_bodega_select_visible
  ON public.solicitudes_bodega
  FOR SELECT
  TO authenticated
  USING (
    (
      donante_id = (SELECT auth.uid())
      AND (SELECT private_auth.current_user_role()) = 'DONANTE'
      AND (SELECT private_auth.current_user_estado()) = 'activo'
    )
    OR (
      (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
      AND (SELECT private_auth.current_user_estado()) = 'activo'
    )
  );

-- Helper privado para la creación de solicitudes.
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

  IF v_tipo = 'ALTA' AND EXISTS (
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
    IF EXISTS (
      SELECT 1
      FROM public.donante_depositos AS dd
      JOIN public.depositos AS d ON d.id_deposito = dd.id_deposito
      WHERE dd.donante_id = v_solicitud.donante_id
        AND dd.activo IS TRUE
        AND d.activo IS TRUE
        AND lower(btrim(d.nombre)) = lower(btrim(v_solicitud.nombre))
    ) THEN
      RAISE EXCEPTION 'Ya existe una bodega activa con ese nombre';
    END IF;

    INSERT INTO public.depositos (
      nombre, descripcion, direccion, telefono, latitud, longitud, activo
    )
    VALUES (
      v_solicitud.nombre, v_solicitud.descripcion, v_solicitud.direccion,
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

CREATE OR REPLACE FUNCTION private_auth.rechazar_solicitud_bodega(
  p_solicitud_id uuid,
  p_motivo text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario_id uuid := (SELECT auth.uid());
  v_motivo text := btrim(COALESCE(p_motivo, ''));
BEGIN
  IF v_usuario_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = v_usuario_id
      AND rol = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
      AND estado = 'activo'
  ) THEN
    RAISE EXCEPTION 'Solo un administrador u operador activo puede rechazar solicitudes';
  END IF;
  IF length(v_motivo) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'El motivo de rechazo es obligatorio y debe tener entre 5 y 500 caracteres';
  END IF;

  PERFORM 1
  FROM public.solicitudes_bodega
  WHERE id = p_solicitud_id AND estado = 'PENDIENTE'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo se pueden rechazar solicitudes pendientes';
  END IF;

  UPDATE public.solicitudes_bodega
  SET estado = 'RECHAZADA', motivo_rechazo = v_motivo,
      revisado_por = v_usuario_id, revisado_at = now()
  WHERE id = p_solicitud_id;

  RETURN p_solicitud_id;
END;
$$;

CREATE OR REPLACE FUNCTION private_auth.cancelar_solicitud_bodega(p_solicitud_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario_id uuid := (SELECT auth.uid());
BEGIN
  IF v_usuario_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = v_usuario_id AND rol = 'DONANTE' AND estado = 'activo'
  ) THEN
    RAISE EXCEPTION 'Solo un donante activo puede cancelar solicitudes';
  END IF;

  UPDATE public.solicitudes_bodega
  SET estado = 'CANCELADA'
  WHERE id = p_solicitud_id
    AND donante_id = v_usuario_id
    AND estado = 'PENDIENTE';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La solicitud no existe o ya no está pendiente';
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_solicitud_bodega(
  p_tipo text,
  p_nombre text,
  p_direccion text,
  p_telefono text,
  p_descripcion text DEFAULT NULL,
  p_id_deposito uuid DEFAULT NULL,
  p_latitud double precision DEFAULT NULL,
  p_longitud double precision DEFAULT NULL
) RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private_auth.crear_solicitud_bodega(
    $1, $2, $3, $4, $5, $6, $7, $8
  );
$$;

CREATE OR REPLACE FUNCTION public.aprobar_solicitud_bodega(p_solicitud_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private_auth.aprobar_solicitud_bodega($1); $$;

CREATE OR REPLACE FUNCTION public.rechazar_solicitud_bodega(
  p_solicitud_id uuid,
  p_motivo text
) RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private_auth.rechazar_solicitud_bodega($1, $2); $$;

CREATE OR REPLACE FUNCTION public.cancelar_solicitud_bodega(p_solicitud_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private_auth.cancelar_solicitud_bodega($1); $$;

REVOKE ALL ON FUNCTION private_auth.crear_solicitud_bodega(text, text, text, text, text, uuid, double precision, double precision)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private_auth.aprobar_solicitud_bodega(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private_auth.rechazar_solicitud_bodega(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private_auth.cancelar_solicitud_bodega(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private_auth.crear_solicitud_bodega(text, text, text, text, text, uuid, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION private_auth.aprobar_solicitud_bodega(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private_auth.rechazar_solicitud_bodega(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private_auth.cancelar_solicitud_bodega(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.crear_solicitud_bodega(text, text, text, text, text, uuid, double precision, double precision)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aprobar_solicitud_bodega(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rechazar_solicitud_bodega(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancelar_solicitud_bodega(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_solicitud_bodega(text, text, text, text, text, uuid, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aprobar_solicitud_bodega(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rechazar_solicitud_bodega(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_solicitud_bodega(uuid) TO authenticated;

-- Mantener el teléfono del perfil en la primera bodega automática sin cambiar
-- el contrato que ya consume el alta de perfil.
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
  v_telefono text;
  v_latitud double precision;
  v_longitud double precision;
  v_deposito_id uuid;
  v_nombre text;
  v_descripcion text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  SELECT u.nombre, u.direccion, u.telefono, u.latitud, u.longitud
  INTO v_nombre_usuario, v_direccion, v_telefono, v_latitud, v_longitud
  FROM public.usuarios AS u
  WHERE u.id = v_user_id AND u.rol = 'DONANTE' AND u.estado = 'activo';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo un donante activo puede crear su bodega';
  END IF;

  SELECT dd.id_deposito INTO v_deposito_id
  FROM public.donante_depositos AS dd
  WHERE dd.donante_id = v_user_id
    AND dd.activo IS TRUE
    AND dd.es_principal IS TRUE
  ORDER BY dd.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_deposito_id IS NULL THEN
    v_nombre := COALESCE(
      NULLIF(btrim(p_nombre), ''),
      'Bodega de ' || COALESCE(NULLIF(btrim(v_nombre_usuario), ''), 'donante')
    );
    v_descripcion := COALESCE(NULLIF(btrim(p_descripcion), ''), 'Bodega principal del donante');

    INSERT INTO public.depositos (
      nombre, descripcion, direccion, telefono, latitud, longitud, activo
    )
    VALUES (v_nombre, v_descripcion, v_direccion, v_telefono, v_latitud, v_longitud, true)
    RETURNING public.depositos.id_deposito INTO v_deposito_id;

    INSERT INTO public.donante_depositos (donante_id, id_deposito, es_principal, activo)
    VALUES (v_user_id, v_deposito_id, true, true);
  ELSE
    UPDATE public.depositos
    SET telefono = COALESCE(telefono, v_telefono)
    WHERE id_deposito = v_deposito_id;
  END IF;

  RETURN QUERY
  SELECT d.id_deposito, d.nombre, d.descripcion, d.direccion, d.latitud, d.longitud
  FROM public.depositos AS d
  WHERE d.id_deposito = v_deposito_id AND d.activo IS TRUE;
END;
$$;

-- La donación aprobada usa exclusivamente la bodega guardada en su propia
-- fila; nunca se selecciona silenciosamente la primera bodega disponible.
CREATE OR REPLACE FUNCTION public.crear_producto_desde_donacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_producto_id uuid;
  v_deposito_id uuid := NEW.id_deposito;
  v_entrada_id uuid;
  v_producto_existia boolean := false;
BEGIN
  IF NOT (
    (TG_OP = 'INSERT' AND NEW.estado = 'Aprobada') OR
    (TG_OP = 'UPDATE' AND NEW.estado = 'Aprobada' AND COALESCE(OLD.estado, '') <> 'Aprobada')
  ) THEN
    RETURN NEW;
  END IF;

  IF v_deposito_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.donante_depositos AS dd
    JOIN public.depositos AS d ON d.id_deposito = dd.id_deposito
    WHERE dd.donante_id = NEW.user_id
      AND dd.id_deposito = v_deposito_id
      AND dd.activo IS TRUE
      AND d.activo IS TRUE
  ) THEN
    RAISE EXCEPTION 'La donación debe tener una bodega activa del donante';
  END IF;

  SELECT id_producto INTO v_producto_id
  FROM public.productos_donados
  WHERE lower(trim(nombre_producto)) = lower(trim(NEW.tipo_producto))
    AND unidad_id = NEW.unidad_id
    AND id_usuario = NEW.user_id
  LIMIT 1;

  IF v_producto_id IS NULL THEN
    INSERT INTO public.productos_donados (
      id_usuario, nombre_producto, descripcion, cantidad, unidad_medida,
      fecha_caducidad, alimento_id, unidad_id
    )
    VALUES (
      NEW.user_id, NEW.tipo_producto, NEW.observaciones, NEW.cantidad,
      NEW.unidad_nombre, NEW.fecha_vencimiento, NEW.alimento_id, NEW.unidad_id
    )
    RETURNING id_producto INTO v_producto_id;
  ELSE
    v_producto_existia := true;
  END IF;

  INSERT INTO public.entradas_inventario (
    donacion_id, donante_id, id_deposito, id_producto, unidad_id,
    cantidad_original, cantidad_disponible, fecha_vencimiento, estado, es_legacy
  )
  VALUES (
    NEW.id, NEW.user_id, v_deposito_id, v_producto_id, NEW.unidad_id,
    NEW.cantidad, NEW.cantidad, NEW.fecha_vencimiento, 'disponible', false
  )
  ON CONFLICT DO NOTHING
  RETURNING id_entrada INTO v_entrada_id;

  IF v_entrada_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_producto_existia THEN
    UPDATE public.productos_donados
    SET cantidad = COALESCE(cantidad, 0) + NEW.cantidad
    WHERE id_producto = v_producto_id;
  END IF;

  INSERT INTO public.inventario (id_deposito, id_producto, cantidad_disponible)
  VALUES (v_deposito_id, v_producto_id, NEW.cantidad)
  ON CONFLICT (id_deposito, id_producto)
  DO UPDATE SET
    cantidad_disponible = public.inventario.cantidad_disponible + EXCLUDED.cantidad_disponible,
    fecha_actualizacion = now();

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.crear_producto_desde_donacion() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.crear_producto_desde_donacion() FROM PUBLIC, anon, authenticated;

-- Notificaciones internas: las solicitudes nuevas llegan a ambos roles
-- operativos y sus cambios de estado llegan al donante.
CREATE OR REPLACE FUNCTION public.notificar_solicitud_bodega()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tipo_text text := CASE
    WHEN NEW.tipo = 'ALTA' THEN 'nueva bodega'
    ELSE 'modificación de bodega'
  END;
  v_estado_text text := CASE
    WHEN NEW.estado = 'APROBADA' THEN 'aprobada'
    WHEN NEW.estado = 'RECHAZADA' THEN 'rechazada'
    ELSE lower(NEW.estado)
  END;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.crear_notificacion(
      'Nueva solicitud de bodega',
      'Hay una solicitud de ' || v_tipo_text || ' pendiente para "' || NEW.nombre || '".',
      'info', NULL, 'OPERADOR', 'bodegas', '/operador/solicitudes-bodegas',
      jsonb_build_object('solicitudId', NEW.id, 'tipo', NEW.tipo)
    );
    PERFORM public.crear_notificacion(
      'Nueva solicitud de bodega',
      'Hay una solicitud de ' || v_tipo_text || ' pendiente para "' || NEW.nombre || '".',
      'info', NULL, 'ADMINISTRADOR', 'bodegas', '/admin/reportes/solicitudes-bodegas',
      jsonb_build_object('solicitudId', NEW.id, 'tipo', NEW.tipo)
    );
  ELSIF TG_OP = 'UPDATE'
    AND OLD.estado IS DISTINCT FROM NEW.estado
    AND NEW.estado IN ('APROBADA', 'RECHAZADA') THEN
    PERFORM public.crear_notificacion(
      'Solicitud de bodega ' || v_estado_text,
      'La solicitud para "' || NEW.nombre || '" fue ' || v_estado_text ||
        CASE WHEN NEW.motivo_rechazo IS NULL THEN '.'
             ELSE '. Motivo: ' || NEW.motivo_rechazo END,
      CASE WHEN NEW.estado = 'APROBADA' THEN 'success' ELSE 'error' END,
      NEW.donante_id, NULL, 'bodegas', '/donante/configuracion/bodegas',
      jsonb_build_object('solicitudId', NEW.id, 'estado', NEW.estado, 'tipo', NEW.tipo)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_solicitud_bodega_notificacion
  ON public.solicitudes_bodega;
CREATE TRIGGER trigger_solicitud_bodega_notificacion
  AFTER INSERT OR UPDATE ON public.solicitudes_bodega
  FOR EACH ROW
  EXECUTE FUNCTION public.notificar_solicitud_bodega();

ALTER FUNCTION public.notificar_solicitud_bodega() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.notificar_solicitud_bodega() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.solicitudes_bodega FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.solicitudes_bodega TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.solicitudes_bodega TO service_role;

DROP POLICY IF EXISTS depositos_select_authenticated_active ON public.depositos;
DROP POLICY IF EXISTS depositos_select_visible ON public.depositos;
CREATE POLICY depositos_select_visible
  ON public.depositos
  FOR SELECT
  TO authenticated
  USING (
    (
      (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
      AND (SELECT private_auth.current_user_estado()) = 'activo'
    )
    OR EXISTS (
      SELECT 1
      FROM public.donante_depositos AS dd
      WHERE dd.id_deposito = depositos.id_deposito
        AND dd.donante_id = (SELECT auth.uid())
        AND dd.activo IS TRUE
    )
  );

REVOKE ALL ON TABLE public.depositos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.depositos TO authenticated;

DROP POLICY IF EXISTS donante_depositos_insert_staff ON public.donante_depositos;
DROP POLICY IF EXISTS donante_depositos_update_staff ON public.donante_depositos;
DROP POLICY IF EXISTS donante_depositos_delete_staff ON public.donante_depositos;
REVOKE ALL ON TABLE public.donante_depositos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.donante_depositos TO authenticated;

DROP POLICY IF EXISTS donante_insert_donaciones ON public.donaciones;
CREATE POLICY donante_insert_donaciones
  ON public.donaciones
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND alimento_id IS NOT NULL
    AND id_deposito IS NOT NULL
    AND (SELECT private_auth.current_user_role()) = 'DONANTE'
    AND (SELECT private_auth.current_user_estado()) = 'activo'
    AND EXISTS (
      SELECT 1
      FROM public.donante_depositos AS dd
      JOIN public.depositos AS dep ON dep.id_deposito = dd.id_deposito
      WHERE dd.donante_id = (SELECT auth.uid())
        AND dd.id_deposito = donaciones.id_deposito
        AND dd.activo IS TRUE
        AND dep.activo IS TRUE
    )
  );

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
      AND estado = ANY (ARRAY['Pendiente'::text, 'Cancelada'::text])
      AND id_deposito IS NOT NULL
      AND (SELECT private_auth.current_user_role()) = 'DONANTE'
      AND (SELECT private_auth.current_user_estado()) = 'activo'
      AND EXISTS (
        SELECT 1
        FROM public.donante_depositos AS dd
        JOIN public.depositos AS dep ON dep.id_deposito = dd.id_deposito
        WHERE dd.donante_id = (SELECT auth.uid())
          AND dd.id_deposito = donaciones.id_deposito
          AND dd.activo IS TRUE
          AND dep.activo IS TRUE
      )
    )
    OR (
      (SELECT private_auth.current_user_role()) = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
      AND (SELECT private_auth.current_user_estado()) = 'activo'
    )
  );

COMMIT;
