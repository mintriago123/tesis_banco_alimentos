-- Row-level security: enable RLS and port every final-state policy from the
-- source migrations, verbatim except `TO authenticated` -> `TO app_user`
-- (there is no `anon` role in this deployment -- the app itself is the only
-- client, and it always authenticates as app_user or, for explicit
-- privileged paths, app_admin, which bypasses RLS entirely and needs no
-- policies at all).

-- ============================================================================
-- usuarios
-- ============================================================================
alter table public.usuarios enable row level security;

-- No INSERT policy: rows are created only by the signup flow (see
-- NOTE(auth-migration) on public.handle_new_user), never a direct client insert.

create policy usuarios_select_policy
  on public.usuarios
  for select
  to app_user
  using (
    id = (select auth.uid())
    or (
      (select private_auth.current_user_role()) = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
      and (select private_auth.current_user_estado()) = 'activo'::text
    )
  );

create policy usuarios_update_policy
  on public.usuarios
  for update
  to app_user
  using (
    id = (select auth.uid())
    or (
      (select private_auth.current_user_role()) = 'ADMINISTRADOR'::text
      and (select private_auth.current_user_estado()) = 'activo'::text
    )
  )
  with check (
    id = (select auth.uid())
    or (
      (select private_auth.current_user_role()) = 'ADMINISTRADOR'::text
      and (select private_auth.current_user_estado()) = 'activo'::text
    )
  );

create policy usuarios_delete_policy
  on public.usuarios
  for delete
  to app_user
  using (
    (select private_auth.current_user_role()) = 'ADMINISTRADOR'::text
    and (select private_auth.current_user_estado()) = 'activo'::text
  );

-- ============================================================================
-- alimentos / alimentos_unidades / tipos_magnitud / unidades / conversiones
-- (catalog tables -- inline EXISTS(usuarios) checks, never migrated to the
-- private_auth helpers in the source codebase; kept identical here)
-- ============================================================================
alter table public.alimentos enable row level security;
alter table public.alimentos_unidades enable row level security;
alter table public.tipos_magnitud enable row level security;
alter table public.unidades enable row level security;
alter table public.conversiones enable row level security;

create policy alimentos_select_authenticated_active
  on public.alimentos
  for select
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.estado = 'activo'
    )
  );

create policy alimentos_insert_admin
  on public.alimentos
  for insert
  to app_user
  with check (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'ADMINISTRADOR'
        and usuarios.estado = 'activo'
    )
  );

create policy alimentos_update_admin
  on public.alimentos
  for update
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'ADMINISTRADOR'
        and usuarios.estado = 'activo'
    )
  )
  with check (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'ADMINISTRADOR'
        and usuarios.estado = 'activo'
    )
  );

create policy alimentos_delete_admin
  on public.alimentos
  for delete
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'ADMINISTRADOR'
        and usuarios.estado = 'activo'
    )
  );

create policy alimentos_unidades_select_usuarios_activos
  on public.alimentos_unidades
  for select
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.estado = 'activo'
    )
  );

create policy alimentos_unidades_insert_admin_operador
  on public.alimentos_unidades
  for insert
  to app_user
  with check (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  );

create policy alimentos_unidades_update_admin_operador
  on public.alimentos_unidades
  for update
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  )
  with check (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  );

create policy alimentos_unidades_delete_admin
  on public.alimentos_unidades
  for delete
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'ADMINISTRADOR'
        and usuarios.estado = 'activo'
    )
  );

create policy tipos_magnitud_select_authenticated_active
  on public.tipos_magnitud
  for select
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.estado = 'activo'
    )
  );

create policy unidades_select_authenticated_active
  on public.unidades
  for select
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.estado = 'activo'
    )
  );

create policy conversiones_select_authenticated_active
  on public.conversiones
  for select
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.estado = 'activo'
    )
  );

-- ============================================================================
-- depositos / donante_depositos
-- Direct writes are intentionally not exposed to app_user: they only happen
-- through the private_auth.* SECURITY DEFINER RPCs in 0004_functions.sql.
-- The write policies below still exist (ported for parity) but are moot in
-- practice because 0007_grants.sql only grants SELECT on these two tables
-- to app_user -- matching the source's final grant model exactly.
-- ============================================================================
alter table public.depositos enable row level security;
alter table public.donante_depositos enable row level security;

create policy depositos_select_visible
  on public.depositos
  for select
  to app_user
  using (
    (
      (select private_auth.current_user_role()) = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
      and (select private_auth.current_user_estado()) = 'activo'
    )
    or exists (
      select 1
      from public.donante_depositos as dd
      where dd.id_deposito = depositos.id_deposito
        and dd.donante_id = (select auth.uid())
        and dd.activo is true
    )
  );

create policy depositos_delete_admin
  on public.depositos
  for delete
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'ADMINISTRADOR'
        and usuarios.estado = 'activo'
    )
  );

create policy depositos_insert_admin_operador
  on public.depositos
  for insert
  to app_user
  with check (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  );

create policy depositos_update_admin_operador
  on public.depositos
  for update
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  )
  with check (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  );

-- donante_depositos: only a SELECT policy in the final source state --
-- insert/update/delete staff policies were dropped in favor of the
-- private_auth.* RPCs and never recreated.
create policy donante_depositos_select_visible
  on public.donante_depositos
  for select
  to app_user
  using (
    (
      donante_id = (select auth.uid())
      and exists (
        select 1
        from public.usuarios
        where usuarios.id = (select auth.uid())
          and usuarios.rol = 'DONANTE'
          and usuarios.estado = 'activo'
      )
    )
    or exists (
      select 1
      from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  );

-- ============================================================================
-- bajas_productos / productos_donados / entradas_inventario
-- ============================================================================
alter table public.bajas_productos enable row level security;
alter table public.productos_donados enable row level security;
alter table public.entradas_inventario enable row level security;

create policy bajas_productos_select_staff
  on public.bajas_productos
  for select
  to app_user
  using (
    (select private_auth.current_user_role()) = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
    and (select private_auth.current_user_estado()) = 'activo'::text
  );

create policy bajas_productos_insert_admin_operador
  on public.bajas_productos
  for insert
  to app_user
  with check (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  );

create policy bajas_productos_update_admin
  on public.bajas_productos
  for update
  to app_user
  using (
    (select private_auth.current_user_role()) = 'ADMINISTRADOR'
    and (select private_auth.current_user_estado()) = 'activo'
  )
  with check (
    (select private_auth.current_user_role()) = 'ADMINISTRADOR'
    and (select private_auth.current_user_estado()) = 'activo'
  );

create policy bajas_productos_delete_admin
  on public.bajas_productos
  for delete
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'ADMINISTRADOR'
        and usuarios.estado = 'activo'
    )
  );

create policy productos_donados_select_staff_or_owner
  on public.productos_donados
  for select
  to app_user
  using (
    (
      (select private_auth.current_user_role()) = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
      and (select private_auth.current_user_estado()) = 'activo'::text
    )
    or (
      id_usuario = (select auth.uid())
      and (select private_auth.current_user_role()) = 'DONANTE'::text
      and (select private_auth.current_user_estado()) = 'activo'::text
    )
  );

create policy productos_donados_insert_permitidos
  on public.productos_donados
  for insert
  to app_user
  with check (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text, 'DONANTE'::text])
        and usuarios.estado = 'activo'
    )
    and (
      (
        id_usuario = (select auth.uid())
        and exists (
          select 1 from public.usuarios
          where usuarios.id = (select auth.uid())
            and usuarios.rol = 'DONANTE'
        )
      )
      or exists (
        select 1 from public.usuarios
        where usuarios.id = (select auth.uid())
          and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
      )
    )
  );

create policy productos_donados_update_admin_operador
  on public.productos_donados
  for update
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  )
  with check (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  );

create policy productos_donados_delete_admin
  on public.productos_donados
  for delete
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'ADMINISTRADOR'
        and usuarios.estado = 'activo'
    )
  );

create policy entradas_inventario_select_active
  on public.entradas_inventario
  for select
  to app_user
  using ((select private_auth.current_user_estado()) = 'activo');

create policy entradas_inventario_insert_staff
  on public.entradas_inventario
  for insert
  to app_user
  with check (
    (select private_auth.current_user_role()) = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
    and (select private_auth.current_user_estado()) = 'activo'
  );

create policy entradas_inventario_update_staff
  on public.entradas_inventario
  for update
  to app_user
  using (
    (select private_auth.current_user_role()) = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
    and (select private_auth.current_user_estado()) = 'activo'
  )
  with check (
    (select private_auth.current_user_role()) = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
    and (select private_auth.current_user_estado()) = 'activo'
  );

create policy entradas_inventario_delete_admin
  on public.entradas_inventario
  for delete
  to app_user
  using (
    (select private_auth.current_user_role()) = 'ADMINISTRADOR'
    and (select private_auth.current_user_estado()) = 'activo'
  );

-- ============================================================================
-- solicitudes / detalles_solicitud
-- ============================================================================
alter table public.solicitudes enable row level security;
alter table public.detalles_solicitud enable row level security;

create policy solicitudes_select_allowed
  on public.solicitudes
  for select
  to app_user
  using (
    (
      (select private_auth.current_user_role()) = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
      and (select private_auth.current_user_estado()) = 'activo'::text
    )
    or (
      usuario_id = (select auth.uid())
      and (select private_auth.current_user_role()) = 'SOLICITANTE'::text
      and (select private_auth.current_user_estado()) = 'activo'::text
    )
  );

create policy solicitudes_insert_allowed
  on public.solicitudes
  for insert
  to app_user
  with check (
    (
      (select private_auth.current_user_role()) = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
      and (select private_auth.current_user_estado()) = 'activo'::text
    )
    or (
      usuario_id = (select auth.uid())
      and (select private_auth.current_user_role()) = 'SOLICITANTE'::text
      and (select private_auth.current_user_estado()) = 'activo'::text
    )
  );

create policy solicitudes_update_allowed
  on public.solicitudes
  for update
  to app_user
  using (
    (
      (select private_auth.current_user_role()) = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
      and (select private_auth.current_user_estado()) = 'activo'::text
    )
    or (
      usuario_id = (select auth.uid())
      and estado = 'pendiente'::text
      and (select private_auth.current_user_role()) = 'SOLICITANTE'::text
      and (select private_auth.current_user_estado()) = 'activo'::text
    )
  )
  with check (
    (
      (select private_auth.current_user_role()) = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
      and (select private_auth.current_user_estado()) = 'activo'::text
    )
    or (
      usuario_id = (select auth.uid())
      and (select private_auth.current_user_role()) = 'SOLICITANTE'::text
      and (select private_auth.current_user_estado()) = 'activo'::text
    )
  );

create policy solicitudes_delete_admin
  on public.solicitudes
  for delete
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'ADMINISTRADOR'
        and usuarios.estado = 'activo'
    )
  );

create policy detalles_solicitud_select_allowed
  on public.detalles_solicitud
  for select
  to app_user
  using (
    (
      (select private_auth.current_user_role()) = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
      and (select private_auth.current_user_estado()) = 'activo'::text
    )
    or (
      (select private_auth.current_user_estado()) = 'activo'::text
      and exists (
        select 1
        from public.solicitudes s
        where s.id = detalles_solicitud.id_solicitud
          and s.usuario_id = (select auth.uid())
      )
    )
  );

create policy detalles_solicitud_insert_admin_operador
  on public.detalles_solicitud
  for insert
  to app_user
  with check (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  );

create policy detalles_solicitud_update_admin_operador
  on public.detalles_solicitud
  for update
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  )
  with check (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  );

create policy detalles_solicitud_delete_admin
  on public.detalles_solicitud
  for delete
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'ADMINISTRADOR'
        and usuarios.estado = 'activo'
    )
  );

-- ============================================================================
-- donaciones / historial_donaciones
-- No DELETE policy on donaciones: donations are never hard-deleted, only
-- soft-cancelled via validar_cancelacion_donacion (see 0004/0005).
-- ============================================================================
alter table public.donaciones enable row level security;
alter table public.historial_donaciones enable row level security;

create policy donaciones_select_visible
  on public.donaciones
  for select
  to app_user
  using (
    (
      user_id = (select auth.uid())
      and (select private_auth.current_user_role()) = 'DONANTE'
      and (select private_auth.current_user_estado()) = 'activo'
    )
    or (
      (select private_auth.current_user_role()) = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
      and (select private_auth.current_user_estado()) = 'activo'
    )
  );

create policy donante_insert_donaciones
  on public.donaciones
  for insert
  to app_user
  with check (
    user_id = (select auth.uid())
    and alimento_id is not null
    and id_deposito is not null
    and (select private_auth.current_user_role()) = 'DONANTE'
    and (select private_auth.current_user_estado()) = 'activo'
    and exists (
      select 1
      from public.donante_depositos as dd
      join public.depositos as dep on dep.id_deposito = dd.id_deposito
      where dd.donante_id = (select auth.uid())
        and dd.id_deposito = donaciones.id_deposito
        and dd.activo is true
        and dep.activo is true
    )
  );

create policy donaciones_update_allowed
  on public.donaciones
  for update
  to app_user
  using (
    (
      user_id = (select auth.uid())
      and estado = 'Pendiente'
      and (select private_auth.current_user_role()) = 'DONANTE'
      and (select private_auth.current_user_estado()) = 'activo'
    )
    or (
      (select private_auth.current_user_role()) = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
      and (select private_auth.current_user_estado()) = 'activo'
    )
  )
  with check (
    (
      user_id = (select auth.uid())
      and estado = any (array['Pendiente'::text, 'Cancelada'::text])
      and id_deposito is not null
      and (select private_auth.current_user_role()) = 'DONANTE'
      and (select private_auth.current_user_estado()) = 'activo'
      and exists (
        select 1
        from public.donante_depositos as dd
        join public.depositos as dep on dep.id_deposito = dd.id_deposito
        where dd.donante_id = (select auth.uid())
          and dd.id_deposito = donaciones.id_deposito
          and dd.activo is true
          and dep.activo is true
      )
    )
    or (
      (select private_auth.current_user_role()) = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
      and (select private_auth.current_user_estado()) = 'activo'
    )
  );

create policy historial_donaciones_insert_staff
  on public.historial_donaciones
  for insert
  to app_user
  with check (
    (select private_auth.current_user_role()) = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
    and (select private_auth.current_user_estado()) = 'activo'
  );

create policy historial_donaciones_select_visible
  on public.historial_donaciones
  for select
  to app_user
  using (
    (
      (select private_auth.current_user_role()) = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
      and (select private_auth.current_user_estado()) = 'activo'
    )
    or exists (
      select 1
      from public.solicitudes
      where solicitudes.id = historial_donaciones.solicitud_id
        and solicitudes.usuario_id = (select auth.uid())
    )
  );

-- ============================================================================
-- movimiento_inventario_cabecera / movimiento_inventario_detalle
-- ============================================================================
alter table public.movimiento_inventario_cabecera enable row level security;
alter table public.movimiento_inventario_detalle enable row level security;

create policy movimiento_cabecera_select
  on public.movimiento_inventario_cabecera
  for select
  to app_user
  using (
    id_donante = (select auth.uid())
    or id_solicitante = (select auth.uid())
    or exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  );

create policy movimiento_cabecera_insert
  on public.movimiento_inventario_cabecera
  for insert
  to app_user
  with check (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  );

create policy movimiento_cabecera_update
  on public.movimiento_inventario_cabecera
  for update
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  )
  with check (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  );

create policy movimiento_cabecera_delete
  on public.movimiento_inventario_cabecera
  for delete
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'ADMINISTRADOR'
        and usuarios.estado = 'activo'
    )
  );

create policy movimiento_detalle_select
  on public.movimiento_inventario_detalle
  for select
  to app_user
  using (
    exists (
      select 1
      from public.movimiento_inventario_cabecera mic
      where mic.id_movimiento = movimiento_inventario_detalle.id_movimiento
        and (
          mic.id_donante = (select auth.uid())
          or mic.id_solicitante = (select auth.uid())
          or exists (
            select 1 from public.usuarios
            where usuarios.id = (select auth.uid())
              and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
              and usuarios.estado = 'activo'
          )
        )
    )
  );

create policy movimiento_detalle_insert
  on public.movimiento_inventario_detalle
  for insert
  to app_user
  with check (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  );

create policy movimiento_detalle_update
  on public.movimiento_inventario_detalle
  for update
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  )
  with check (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
        and usuarios.estado = 'activo'
    )
  );

create policy movimiento_detalle_delete
  on public.movimiento_inventario_detalle
  for delete
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'ADMINISTRADOR'
        and usuarios.estado = 'activo'
    )
  );

-- ============================================================================
-- notificaciones / notificaciones_usuario / configuracion_notificaciones
-- No INSERT/UPDATE policy on notificaciones: rows are only written by the
-- SECURITY DEFINER trigger functions (running as owner) or app_admin.
-- ============================================================================
alter table public.notificaciones enable row level security;
alter table public.notificaciones_usuario enable row level security;
alter table public.configuracion_notificaciones enable row level security;

create policy notificaciones_select_visible
  on public.notificaciones
  for select
  to app_user
  using (
    (select private_auth.current_user_estado()) = 'activo'
    and (expira_en is null or expira_en > now())
    and (
      destinatario_id = (select auth.uid())
      or rol_destinatario = (select private_auth.current_user_role())
      or rol_destinatario = 'TODOS'
    )
  );

create policy notificaciones_delete_admin
  on public.notificaciones
  for delete
  to app_user
  using (
    (select private_auth.current_user_role()) = 'ADMINISTRADOR'
    and (select private_auth.current_user_estado()) = 'activo'
  );

create policy notificaciones_usuario_select_own
  on public.notificaciones_usuario
  for select
  to app_user
  using (usuario_id = (select auth.uid()));

create policy notificaciones_usuario_insert_own
  on public.notificaciones_usuario
  for insert
  to app_user
  with check (usuario_id = (select auth.uid()));

create policy notificaciones_usuario_update_own
  on public.notificaciones_usuario
  for update
  to app_user
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

create policy notificaciones_usuario_delete_own
  on public.notificaciones_usuario
  for delete
  to app_user
  using (usuario_id = (select auth.uid()));

create policy configuracion_notificaciones_manage_own
  on public.configuracion_notificaciones
  for all
  to app_user
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

-- ============================================================================
-- solicitudes_alta_alimentos / solicitudes_alta_alimentos_unidades
-- ============================================================================
alter table public.solicitudes_alta_alimentos enable row level security;
alter table public.solicitudes_alta_alimentos_unidades enable row level security;

create policy solicitudes_alta_select_allowed
  on public.solicitudes_alta_alimentos
  for select
  to app_user
  using (
    (
      (select private_auth.current_user_role()) = 'ADMINISTRADOR'::text
      and (select private_auth.current_user_estado()) = 'activo'::text
    )
    or (
      solicitante_id = (select auth.uid())
      and (select private_auth.current_user_role()) = 'DONANTE'::text
      and (select private_auth.current_user_estado()) = 'activo'::text
    )
  );

create policy solicitudes_alta_insert_donante
  on public.solicitudes_alta_alimentos
  for insert
  to app_user
  with check (
    solicitante_id = (select auth.uid())
    and estado = 'pendiente'
    and comentario_admin is null
    and alimento_creado_id is null
    and revisado_por is null
    and fecha_revision is null
    and exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'DONANTE'
        and usuarios.estado = 'activo'
    )
  );

create policy solicitudes_alta_update_admin
  on public.solicitudes_alta_alimentos
  for update
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'ADMINISTRADOR'
        and usuarios.estado = 'activo'
    )
  )
  with check (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'ADMINISTRADOR'
        and usuarios.estado = 'activo'
    )
  );

create policy solicitudes_alta_unidades_select_visible
  on public.solicitudes_alta_alimentos_unidades
  for select
  to app_user
  using (
    exists (
      select 1
      from public.solicitudes_alta_alimentos saa
      where saa.id = solicitudes_alta_alimentos_unidades.solicitud_id
        and (
          (
            saa.solicitante_id = (select auth.uid())
            and exists (
              select 1 from public.usuarios
              where usuarios.id = (select auth.uid())
                and usuarios.rol = 'DONANTE'
                and usuarios.estado = 'activo'
            )
          )
          or exists (
            select 1 from public.usuarios
            where usuarios.id = (select auth.uid())
              and usuarios.rol = 'ADMINISTRADOR'
              and usuarios.estado = 'activo'
          )
        )
    )
  );

create policy solicitudes_alta_unidades_insert_owner_pending_or_admin
  on public.solicitudes_alta_alimentos_unidades
  for insert
  to app_user
  with check (
    exists (
      select 1
      from public.solicitudes_alta_alimentos saa
      where saa.id = solicitudes_alta_alimentos_unidades.solicitud_id
        and (
          (
            saa.solicitante_id = (select auth.uid())
            and saa.estado = 'pendiente'
            and exists (
              select 1 from public.usuarios
              where usuarios.id = (select auth.uid())
                and usuarios.rol = 'DONANTE'
                and usuarios.estado = 'activo'
            )
          )
          or exists (
            select 1 from public.usuarios
            where usuarios.id = (select auth.uid())
              and usuarios.rol = 'ADMINISTRADOR'
              and usuarios.estado = 'activo'
          )
        )
    )
  );

create policy solicitudes_alta_unidades_update_admin
  on public.solicitudes_alta_alimentos_unidades
  for update
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'ADMINISTRADOR'
        and usuarios.estado = 'activo'
    )
  )
  with check (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'ADMINISTRADOR'
        and usuarios.estado = 'activo'
    )
  );

create policy solicitudes_alta_unidades_delete_admin
  on public.solicitudes_alta_alimentos_unidades
  for delete
  to app_user
  using (
    exists (
      select 1 from public.usuarios
      where usuarios.id = (select auth.uid())
        and usuarios.rol = 'ADMINISTRADOR'
        and usuarios.estado = 'activo'
    )
  );

-- ============================================================================
-- auditoria_donaciones -- immutable: only SELECT is policy-gated; the single
-- legitimate INSERT path is the SECURITY DEFINER trigger in 0004/0005, and
-- UPDATE/DELETE are hard-blocked by trigger_inmutabilidad_auditoria_donaciones
-- regardless of RLS.
-- ============================================================================
alter table public.auditoria_donaciones enable row level security;

create policy auditoria_donaciones_select_visible
  on public.auditoria_donaciones
  for select
  to app_user
  using (
    (
      (select private_auth.current_user_role()) = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
      and (select private_auth.current_user_estado()) = 'activo'::text
    )
    or exists (
      select 1
      from public.donaciones d
      where d.id = auditoria_donaciones.donacion_id
        and d.user_id = (select auth.uid())
        and (select private_auth.current_user_role()) = 'DONANTE'::text
        and (select private_auth.current_user_estado()) = 'activo'::text
    )
  );

-- ============================================================================
-- solicitudes_bodega -- only SELECT is policy-gated; all mutation happens
-- through the private_auth.* RPCs in 0004_functions.sql.
-- ============================================================================
alter table public.solicitudes_bodega enable row level security;

create policy solicitudes_bodega_select_visible
  on public.solicitudes_bodega
  for select
  to app_user
  using (
    (
      donante_id = (select auth.uid())
      and (select private_auth.current_user_role()) = 'DONANTE'
      and (select private_auth.current_user_estado()) = 'activo'
    )
    or (
      (select private_auth.current_user_role()) = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
      and (select private_auth.current_user_estado()) = 'activo'
    )
  );

-- ============================================================================
-- api_rate_limits / api_document_lookup_audit_log -- RLS enabled, zero
-- policies. Reachable only via app_admin (BYPASSRLS) or the SECURITY
-- DEFINER consume_document_lookup_quota function; app_user gets nothing
-- (matches the source's REVOKE ALL ... FROM PUBLIC, anon, authenticated).
-- ============================================================================
alter table public.api_rate_limits enable row level security;
alter table public.api_document_lookup_audit_log enable row level security;
