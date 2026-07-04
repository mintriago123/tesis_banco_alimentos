BEGIN;

-- Endurecer acceso al mapeo donante -> depósito.
ALTER TABLE public.donante_depositos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS donante_depositos_select_visible ON public.donante_depositos;
CREATE POLICY donante_depositos_select_visible
  ON public.donante_depositos
  FOR SELECT
  TO authenticated
  USING (
    (
      donante_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.usuarios
        WHERE usuarios.id = auth.uid()
          AND usuarios.rol = 'DONANTE'
          AND usuarios.estado = 'activo'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.usuarios
      WHERE usuarios.id = auth.uid()
        AND usuarios.rol = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
        AND usuarios.estado = 'activo'
    )
  );

DROP POLICY IF EXISTS donante_depositos_insert_staff ON public.donante_depositos;
CREATE POLICY donante_depositos_insert_staff
  ON public.donante_depositos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios
      WHERE usuarios.id = auth.uid()
        AND usuarios.rol = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
        AND usuarios.estado = 'activo'
    )
  );

DROP POLICY IF EXISTS donante_depositos_update_staff ON public.donante_depositos;
CREATE POLICY donante_depositos_update_staff
  ON public.donante_depositos
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios
      WHERE usuarios.id = auth.uid()
        AND usuarios.rol = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
        AND usuarios.estado = 'activo'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios
      WHERE usuarios.id = auth.uid()
        AND usuarios.rol = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
        AND usuarios.estado = 'activo'
    )
  );

DROP POLICY IF EXISTS donante_depositos_delete_staff ON public.donante_depositos;
CREATE POLICY donante_depositos_delete_staff
  ON public.donante_depositos
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios
      WHERE usuarios.id = auth.uid()
        AND usuarios.rol = ANY (ARRAY['ADMINISTRADOR'::text, 'OPERADOR'::text])
        AND usuarios.estado = 'activo'
    )
  );

-- Eliminar políticas permisivas heredadas en tablas de catálogo.
DROP POLICY IF EXISTS "Enable all operations for alimentos" ON public.alimentos;
DROP POLICY IF EXISTS "Enable all operations for conversiones" ON public.conversiones;
DROP POLICY IF EXISTS "Enable all operations for tipos_magnitud" ON public.tipos_magnitud;
DROP POLICY IF EXISTS "Enable all operations for unidades" ON public.unidades;
DROP POLICY IF EXISTS "Permitir lectura pública de alimentos" ON public.alimentos;

DROP POLICY IF EXISTS alimentos_select_authenticated_active ON public.alimentos;
CREATE POLICY alimentos_select_authenticated_active
  ON public.alimentos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios
      WHERE usuarios.id = auth.uid()
        AND usuarios.estado = 'activo'
    )
  );

DROP POLICY IF EXISTS alimentos_insert_admin ON public.alimentos;
CREATE POLICY alimentos_insert_admin
  ON public.alimentos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios
      WHERE usuarios.id = auth.uid()
        AND usuarios.rol = 'ADMINISTRADOR'
        AND usuarios.estado = 'activo'
    )
  );

DROP POLICY IF EXISTS alimentos_update_admin ON public.alimentos;
CREATE POLICY alimentos_update_admin
  ON public.alimentos
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios
      WHERE usuarios.id = auth.uid()
        AND usuarios.rol = 'ADMINISTRADOR'
        AND usuarios.estado = 'activo'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios
      WHERE usuarios.id = auth.uid()
        AND usuarios.rol = 'ADMINISTRADOR'
        AND usuarios.estado = 'activo'
    )
  );

DROP POLICY IF EXISTS alimentos_delete_admin ON public.alimentos;
CREATE POLICY alimentos_delete_admin
  ON public.alimentos
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios
      WHERE usuarios.id = auth.uid()
        AND usuarios.rol = 'ADMINISTRADOR'
        AND usuarios.estado = 'activo'
    )
  );

DROP POLICY IF EXISTS conversiones_select_authenticated_active ON public.conversiones;
CREATE POLICY conversiones_select_authenticated_active
  ON public.conversiones
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios
      WHERE usuarios.id = auth.uid()
        AND usuarios.estado = 'activo'
    )
  );

DROP POLICY IF EXISTS tipos_magnitud_select_authenticated_active ON public.tipos_magnitud;
CREATE POLICY tipos_magnitud_select_authenticated_active
  ON public.tipos_magnitud
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios
      WHERE usuarios.id = auth.uid()
        AND usuarios.estado = 'activo'
    )
  );

DROP POLICY IF EXISTS unidades_select_authenticated_active ON public.unidades;
CREATE POLICY unidades_select_authenticated_active
  ON public.unidades
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios
      WHERE usuarios.id = auth.uid()
        AND usuarios.estado = 'activo'
    )
  );

-- Endurecer la creación de donaciones para que la fila siempre pertenezca al usuario autenticado.
DROP POLICY IF EXISTS donante_insert_donaciones ON public.donaciones;
CREATE POLICY donante_insert_donaciones
  ON public.donaciones
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND alimento_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.usuarios
      WHERE usuarios.id = auth.uid()
        AND usuarios.rol = 'DONANTE'
        AND usuarios.estado = 'activo'
    )
  );

-- Reducir superficie expuesta al rol anon.
REVOKE ALL ON TABLE public.usuarios FROM anon;
REVOKE ALL ON TABLE public.solicitudes FROM anon;
REVOKE ALL ON TABLE public.donaciones FROM anon;
REVOKE ALL ON TABLE public.donante_depositos FROM anon;
REVOKE ALL ON TABLE public.alimentos FROM anon;
REVOKE ALL ON TABLE public.conversiones FROM anon;
REVOKE ALL ON TABLE public.tipos_magnitud FROM anon;
REVOKE ALL ON TABLE public.unidades FROM anon;

-- Las funciones SECURITY DEFINER internas no deben estar abiertas al rol anon.
REVOKE ALL ON FUNCTION public.cancelar_eliminacion_categoria(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.crear_notificacion(character varying, text, character varying, uuid, character varying, character varying, character varying, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.crear_producto_desde_donacion() FROM anon;
REVOKE ALL ON FUNCTION public.get_user_estado() FROM anon;
REVOKE ALL ON FUNCTION public.get_user_role() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.is_admin_or_operator() FROM anon;
REVOKE ALL ON FUNCTION public.limpiar_notificaciones_antiguas() FROM anon;
REVOKE ALL ON FUNCTION public.marcar_notificacion_leida(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.obtener_notificaciones_no_leidas(uuid, character varying) FROM anon;
REVOKE ALL ON FUNCTION public.procesar_eliminaciones_categorias_pendientes() FROM anon;
REVOKE ALL ON FUNCTION public.registrar_movimiento_con_unidad(uuid, uuid, numeric, text, bigint, text) FROM anon;
REVOKE ALL ON FUNCTION public.trigger_notificacion_donacion() FROM anon;
REVOKE ALL ON FUNCTION public.trigger_notificacion_solicitud() FROM anon;
REVOKE ALL ON FUNCTION public.trigger_notificacion_usuario() FROM anon;

COMMIT;
