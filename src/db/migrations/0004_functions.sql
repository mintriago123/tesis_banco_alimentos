-- Ported database functions, final state as of main@74355e3's
-- supabase/migrations/. Bodies are verbatim from source; only the
-- private schema/role model is new (see 0002/0003). Grants are centralized
-- in 0007_grants.sql, not repeated per-function here.

create schema if not exists private_auth;

-- ============================================================================
-- 1. private_auth.* -- RLS helper functions
-- ============================================================================

create or replace function private_auth.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select rol
  from public.usuarios
  where id = (select auth.uid());
$$;

create or replace function private_auth.current_user_estado()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select estado
  from public.usuarios
  where id = (select auth.uid());
$$;

-- Prefixes a warehouse name with its owner's display name
-- ("Nombre del usuario - Referencia"), idempotently.
create or replace function private_auth.formatear_nombre_bodega(
  p_donante_id uuid,
  p_nombre text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_propietario text;
  v_referencia text := btrim(coalesce(p_nombre, ''));
  v_prefijo text;
  v_nombre_final text;
begin
  select nullif(btrim(u.nombre), '')
  into v_propietario
  from public.usuarios as u
  where u.id = p_donante_id;

  v_prefijo := coalesce(v_propietario, 'Donante');

  if lower(left(v_referencia, length(v_prefijo) + 3)) = lower(v_prefijo || ' - ') then
    v_nombre_final := v_referencia;
  else
    v_nombre_final := v_prefijo || ' - ' || v_referencia;
  end if;

  if length(v_nombre_final) > 150 then
    raise exception 'El nombre final de la bodega no puede superar los 150 caracteres';
  end if;

  return v_nombre_final;
end;
$$;

-- ============================================================================
-- 2. private_auth.* -- SECURITY DEFINER delegates for the warehouse
--    (bodega) request workflow, called only by the thin public.* INVOKER
--    wrappers below.
-- ============================================================================

create or replace function private_auth.crear_solicitud_bodega(
  p_tipo text,
  p_nombre text,
  p_direccion text,
  p_telefono text,
  p_descripcion text,
  p_id_deposito uuid,
  p_latitud double precision,
  p_longitud double precision
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_tipo text := upper(btrim(coalesce(p_tipo, '')));
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_direccion text := btrim(coalesce(p_direccion, ''));
  v_telefono text := btrim(coalesce(p_telefono, ''));
  v_id uuid;
begin
  if v_usuario_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  if not exists (
    select 1 from public.usuarios
    where id = v_usuario_id and rol = 'DONANTE' and estado = 'activo'
  ) then
    raise exception 'Solo un donante activo puede solicitar una bodega';
  end if;

  if v_tipo not in ('ALTA', 'MODIFICACION') then
    raise exception 'El tipo de solicitud no es válido';
  end if;
  if length(v_nombre) not between 2 and 150 then
    raise exception 'El nombre de la bodega debe tener entre 2 y 150 caracteres';
  end if;
  if length(v_direccion) not between 5 and 250 then
    raise exception 'La dirección debe tener entre 5 y 250 caracteres';
  end if;
  if length(v_telefono) not between 7 and 30 then
    raise exception 'El teléfono debe tener entre 7 y 30 caracteres';
  end if;
  if p_latitud is not null and (p_latitud < -90 or p_latitud > 90) then
    raise exception 'La latitud está fuera de rango';
  end if;
  if p_longitud is not null and (p_longitud < -180 or p_longitud > 180) then
    raise exception 'La longitud está fuera de rango';
  end if;

  if v_tipo = 'ALTA' and p_id_deposito is not null then
    raise exception 'Una solicitud de alta no puede incluir una bodega existente';
  end if;

  if v_tipo = 'MODIFICACION' then
    if p_id_deposito is null then
      raise exception 'La bodega a modificar es obligatoria';
    end if;
    if not exists (
      select 1
      from public.donante_depositos as dd
      join public.depositos as d on d.id_deposito = dd.id_deposito
      where dd.donante_id = v_usuario_id
        and dd.id_deposito = p_id_deposito
        and dd.activo is true
        and d.activo is true
    ) then
      raise exception 'La bodega no pertenece al donante o está inactiva';
    end if;
  end if;

  if v_tipo = 'ALTA' then
    v_nombre := private_auth.formatear_nombre_bodega(v_usuario_id, v_nombre);

    if exists (
      select 1
      from public.donante_depositos as dd
      join public.depositos as d on d.id_deposito = dd.id_deposito
      where dd.donante_id = v_usuario_id
        and dd.activo is true
        and d.activo is true
        and lower(btrim(d.nombre)) = lower(v_nombre)
    ) then
      raise exception 'Ya existe una bodega activa con ese nombre';
    end if;
  end if;

  insert into public.solicitudes_bodega (
    donante_id, id_deposito, tipo, nombre, descripcion, direccion,
    telefono, latitud, longitud
  )
  values (
    v_usuario_id, p_id_deposito, v_tipo, v_nombre,
    nullif(btrim(coalesce(p_descripcion, '')), ''), v_direccion,
    v_telefono, p_latitud, p_longitud
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function private_auth.aprobar_solicitud_bodega(p_solicitud_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_solicitud public.solicitudes_bodega%rowtype;
  v_deposito_id uuid;
  v_nombre text;
begin
  if v_usuario_id is null or not exists (
    select 1 from public.usuarios
    where id = v_usuario_id
      and rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
      and estado = 'activo'
  ) then
    raise exception 'Solo un administrador u operador activo puede aprobar solicitudes';
  end if;

  select * into v_solicitud
  from public.solicitudes_bodega
  where id = p_solicitud_id
  for update;

  if not found then
    raise exception 'La solicitud de bodega no existe';
  end if;
  if v_solicitud.estado <> 'PENDIENTE' then
    raise exception 'Solo se pueden aprobar solicitudes pendientes';
  end if;

  if v_solicitud.tipo = 'MODIFICACION' then
    if not exists (
      select 1
      from public.donante_depositos as dd
      join public.depositos as d on d.id_deposito = dd.id_deposito
      where dd.donante_id = v_solicitud.donante_id
        and dd.id_deposito = v_solicitud.id_deposito
        and dd.activo is true
        and d.activo is true
    ) then
      raise exception 'La bodega a modificar ya no está activa';
    end if;

    update public.depositos
    set nombre = v_solicitud.nombre,
        descripcion = v_solicitud.descripcion,
        direccion = v_solicitud.direccion,
        telefono = v_solicitud.telefono,
        latitud = v_solicitud.latitud,
        longitud = v_solicitud.longitud,
        activo = true
    where id_deposito = v_solicitud.id_deposito;

    v_deposito_id := v_solicitud.id_deposito;
  else
    v_nombre := private_auth.formatear_nombre_bodega(
      v_solicitud.donante_id,
      v_solicitud.nombre
    );

    if exists (
      select 1
      from public.donante_depositos as dd
      join public.depositos as d on d.id_deposito = dd.id_deposito
      where dd.donante_id = v_solicitud.donante_id
        and dd.activo is true
        and d.activo is true
        and lower(btrim(d.nombre)) = lower(btrim(v_nombre))
    ) then
      raise exception 'Ya existe una bodega activa con ese nombre';
    end if;

    insert into public.depositos (
      nombre, descripcion, direccion, telefono, latitud, longitud, activo
    )
    values (
      v_nombre, v_solicitud.descripcion, v_solicitud.direccion,
      v_solicitud.telefono, v_solicitud.latitud, v_solicitud.longitud, true
    )
    returning id_deposito into v_deposito_id;

    insert into public.donante_depositos (
      donante_id, id_deposito, es_principal, activo
    )
    values (v_solicitud.donante_id, v_deposito_id, false, true);
  end if;

  update public.solicitudes_bodega
  set estado = 'APROBADA', revisado_por = v_usuario_id, revisado_at = now()
  where id = v_solicitud.id;

  return v_deposito_id;
end;
$$;

create or replace function private_auth.rechazar_solicitud_bodega(
  p_solicitud_id uuid,
  p_motivo text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if v_usuario_id is null or not exists (
    select 1 from public.usuarios
    where id = v_usuario_id
      and rol = any (array['ADMINISTRADOR'::text, 'OPERADOR'::text])
      and estado = 'activo'
  ) then
    raise exception 'Solo un administrador u operador activo puede rechazar solicitudes';
  end if;
  if length(v_motivo) not between 5 and 500 then
    raise exception 'El motivo de rechazo es obligatorio y debe tener entre 5 y 500 caracteres';
  end if;

  perform 1
  from public.solicitudes_bodega
  where id = p_solicitud_id and estado = 'PENDIENTE'
  for update;

  if not found then
    raise exception 'Solo se pueden rechazar solicitudes pendientes';
  end if;

  update public.solicitudes_bodega
  set estado = 'RECHAZADA', motivo_rechazo = v_motivo,
      revisado_por = v_usuario_id, revisado_at = now()
  where id = p_solicitud_id;

  return p_solicitud_id;
end;
$$;

create or replace function private_auth.cancelar_solicitud_bodega(p_solicitud_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
begin
  if v_usuario_id is null or not exists (
    select 1 from public.usuarios
    where id = v_usuario_id and rol = 'DONANTE' and estado = 'activo'
  ) then
    raise exception 'Solo un donante activo puede cancelar solicitudes';
  end if;

  update public.solicitudes_bodega
  set estado = 'CANCELADA'
  where id = p_solicitud_id
    and donante_id = v_usuario_id
    and estado = 'PENDIENTE';

  if not found then
    raise exception 'La solicitud no existe o ya no está pendiente';
  end if;

  return true;
end;
$$;

-- Idempotent: provisions a donor's first/principal warehouse from their
-- profile address, or returns the existing one.
create or replace function private_auth.crear_bodega_principal_donante(
  p_nombre text default null,
  p_descripcion text default null
)
returns table (
  id_deposito uuid,
  nombre text,
  descripcion text,
  direccion text,
  latitud double precision,
  longitud double precision
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_nombre_usuario text;
  v_direccion text;
  v_telefono text;
  v_latitud double precision;
  v_longitud double precision;
  v_deposito_id uuid;
  v_nombre text;
  v_descripcion text;
begin
  if v_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  select u.nombre, u.direccion, u.telefono, u.latitud, u.longitud
  into v_nombre_usuario, v_direccion, v_telefono, v_latitud, v_longitud
  from public.usuarios as u
  where u.id = v_user_id and u.rol = 'DONANTE' and u.estado = 'activo';

  if not found then
    raise exception 'Solo un donante activo puede crear su bodega';
  end if;

  select dd.id_deposito into v_deposito_id
  from public.donante_depositos as dd
  where dd.donante_id = v_user_id
    and dd.activo is true
    and dd.es_principal is true
  order by dd.created_at asc
  limit 1
  for update;

  if v_deposito_id is null then
    v_nombre := coalesce(
      nullif(btrim(p_nombre), ''),
      'Bodega de ' || coalesce(nullif(btrim(v_nombre_usuario), ''), 'donante')
    );
    v_descripcion := coalesce(nullif(btrim(p_descripcion), ''), 'Bodega principal del donante');

    insert into public.depositos (
      nombre, descripcion, direccion, telefono, latitud, longitud, activo
    )
    values (v_nombre, v_descripcion, v_direccion, v_telefono, v_latitud, v_longitud, true)
    returning public.depositos.id_deposito into v_deposito_id;

    insert into public.donante_depositos (donante_id, id_deposito, es_principal, activo)
    values (v_user_id, v_deposito_id, true, true);
  else
    update public.depositos as d
    set telefono = coalesce(d.telefono, v_telefono)
    where d.id_deposito = v_deposito_id;
  end if;

  return query
  select d.id_deposito, d.nombre, d.descripcion, d.direccion, d.latitud, d.longitud
  from public.depositos as d
  where d.id_deposito = v_deposito_id and d.activo is true;
end;
$$;

-- ============================================================================
-- 3. public.* -- thin SECURITY INVOKER wrappers over the private_auth
--    delegates above. Splitting privilege this way (rather than making the
--    RPC itself SECURITY DEFINER) is the pattern the source codebase already
--    used throughout; kept unchanged here.
-- ============================================================================

create or replace function public.crear_solicitud_bodega(
  p_tipo text,
  p_nombre text,
  p_direccion text,
  p_telefono text,
  p_descripcion text default null,
  p_id_deposito uuid default null,
  p_latitud double precision default null,
  p_longitud double precision default null
) returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private_auth.crear_solicitud_bodega(
    $1, $2, $3, $4, $5, $6, $7, $8
  );
$$;

create or replace function public.aprobar_solicitud_bodega(p_solicitud_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private_auth.aprobar_solicitud_bodega($1); $$;

create or replace function public.rechazar_solicitud_bodega(
  p_solicitud_id uuid,
  p_motivo text
) returns uuid
language sql
security invoker
set search_path = ''
as $$ select private_auth.rechazar_solicitud_bodega($1, $2); $$;

create or replace function public.cancelar_solicitud_bodega(p_solicitud_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private_auth.cancelar_solicitud_bodega($1); $$;

create or replace function public.crear_bodega_principal_donante(
  p_nombre text default null,
  p_descripcion text default null
)
returns table (
  id_deposito uuid,
  nombre text,
  descripcion text,
  direccion text,
  latitud double precision,
  longitud double precision
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private_auth.crear_bodega_principal_donante($1, $2);
$$;

-- ============================================================================
-- 4. public.* -- app-facing RPCs (called via the app's `.rpc()`-equivalent
--    helper against Postgres functions). All SECURITY INVOKER: RLS and the
--    caller's own grants apply during execution.
-- ============================================================================

-- Atomic FEFO (first-expires-first-out) stock consumption across as many
-- lots as needed. Role-gated to ADMINISTRADOR/OPERADOR internally.
create or replace function public.descontar_stock_por_lote(
  p_id_deposito uuid,
  p_id_producto uuid,
  p_cantidad numeric,
  p_unidad_id bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rol text;
  v_unidad_producto bigint;
  v_nombre_origen text;
  v_nombre_destino text;
  v_resolucion jsonb;
  v_factor numeric;
  v_requerida numeric;
  v_disponible numeric;
  v_restante numeric;
  v_consumo numeric;
  v_detalle jsonb := '[]'::jsonb;
  v_unidad_fraccionable boolean;
  entrada record;
begin
  select rol into v_rol
  from public.usuarios
  where id = (select auth.uid())
    and estado = 'activo';

  if v_rol is null or v_rol not in ('ADMINISTRADOR', 'OPERADOR') then
    raise exception 'Solo un administrador u operador activo puede descontar inventario';
  end if;

  if p_id_deposito is null or p_id_producto is null or p_unidad_id is null
     or p_cantidad is null or p_cantidad <= 0 then
    raise exception 'Los datos del descuento son obligatorios y deben ser positivos';
  end if;

  select unidad_id into v_unidad_producto
  from public.productos_donados
  where id_producto = p_id_producto;

  if v_unidad_producto is null then
    raise exception 'El producto no tiene unidad configurada';
  end if;

  select nombre into v_nombre_origen from public.unidades where id = p_unidad_id;
  select nombre into v_nombre_destino from public.unidades where id = v_unidad_producto;
  select permite_fraccion into v_unidad_fraccionable
  from public.unidades
  where id = p_unidad_id and activa is true;

  if v_nombre_origen is null or v_nombre_destino is null or v_unidad_fraccionable is null then
    raise exception 'La unidad del descuento no existe o está inactiva';
  end if;

  if not v_unidad_fraccionable and p_cantidad <> trunc(p_cantidad) then
    raise exception 'La unidad % no permite cantidades decimales', v_nombre_origen;
  end if;

  v_resolucion := public.resolver_conversion(p_unidad_id, v_unidad_producto);
  if v_resolucion ->> 'convertible' <> 'true' then
    raise exception 'No existe conversión entre % y % para esta operación', v_nombre_origen, v_nombre_destino;
  end if;

  v_factor := (v_resolucion ->> 'factor')::numeric;
  v_requerida := p_cantidad * v_factor;

  select coalesce(sum(e.cantidad_disponible), 0)
  into v_disponible
  from public.entradas_inventario e
  where e.id_deposito = p_id_deposito
    and e.id_producto = p_id_producto
    and e.unidad_id = v_unidad_producto
    and e.estado = 'disponible'
    and e.cantidad_disponible > 0;

  if v_disponible < v_requerida then
    raise exception 'Stock insuficiente para la operación';
  end if;

  v_restante := v_requerida;
  for entrada in
    select e.id_entrada, e.cantidad_disponible
    from public.entradas_inventario e
    where e.id_deposito = p_id_deposito
      and e.id_producto = p_id_producto
      and e.unidad_id = v_unidad_producto
      and e.estado = 'disponible'
      and e.cantidad_disponible > 0
    order by e.fecha_vencimiento asc nulls last, e.fecha_ingreso asc, e.id_entrada asc
    for update
  loop
    exit when v_restante <= 0;
    v_consumo := least(v_restante, entrada.cantidad_disponible);

    update public.entradas_inventario
    set cantidad_disponible = cantidad_disponible - v_consumo,
        estado = case when cantidad_disponible - v_consumo = 0 then 'agotado' else 'disponible' end,
        updated_at = now()
    where id_entrada = entrada.id_entrada;

    v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
      'idEntrada', entrada.id_entrada,
      'idDeposito', p_id_deposito,
      'cantidad', v_consumo,
      'cantidadOriginal', v_consumo / v_factor,
      'unidadOriginalId', p_unidad_id,
      'unidadConvertidaId', v_unidad_producto
    ));
    v_restante := v_restante - v_consumo;
  end loop;

  return jsonb_build_object(
    'cantidadRestante', 0,
    'cantidadConsumida', p_cantidad,
    'cantidadConvertida', v_requerida,
    'detalles', v_detalle
  );
end;
$$;

-- Reverses a previous stock consumption back onto the exact lot it came
-- from (the caller must pass the same id_entrada that was consumed).
create or replace function public.restaurar_entrada_inventario(
  p_id_entrada uuid,
  p_cantidad numeric
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rol text;
  v_entrada public.entradas_inventario%rowtype;
  v_cantidad_restaurada numeric;
begin
  select rol into v_rol
  from public.usuarios
  where id = (select auth.uid())
    and estado = 'activo';

  if v_rol is null or v_rol not in ('ADMINISTRADOR', 'OPERADOR') then
    raise exception 'Solo un administrador u operador activo puede restaurar inventario';
  end if;

  if p_id_entrada is null or p_cantidad is null or p_cantidad <= 0 then
    raise exception 'Los datos de restauración son inválidos';
  end if;

  select * into v_entrada
  from public.entradas_inventario
  where id_entrada = p_id_entrada
  for update;

  if not found then
    raise exception 'La entrada de inventario no existe';
  end if;

  v_cantidad_restaurada := least(
    v_entrada.cantidad_original,
    v_entrada.cantidad_disponible + p_cantidad
  ) - v_entrada.cantidad_disponible;

  if v_cantidad_restaurada <= 0 then
    return true;
  end if;

  update public.entradas_inventario
  set cantidad_disponible = cantidad_disponible + v_cantidad_restaurada,
      estado = 'disponible',
      updated_at = now()
  where id_entrada = p_id_entrada;

  return true;
end;
$$;

-- Sole authority for unit-equivalence resolution: identity, a direct
-- conversiones row, or its inverse. Never infers from shared tipo_magnitud.
create or replace function public.resolver_conversion(
  unidad_origen_id bigint,
  unidad_destino_id bigint
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tipo_origen bigint;
  v_tipo_destino bigint;
  v_origen_activo boolean;
  v_destino_activo boolean;
  v_factor numeric;
begin
  if unidad_origen_id is null or unidad_destino_id is null then
    return jsonb_build_object('convertible', false, 'reason', 'no_conversion');
  end if;

  select tipo_magnitud_id, activa
  into v_tipo_origen, v_origen_activo
  from public.unidades
  where id = unidad_origen_id;

  select tipo_magnitud_id, activa
  into v_tipo_destino, v_destino_activo
  from public.unidades
  where id = unidad_destino_id;

  if v_tipo_origen is null or v_tipo_destino is null
     or not coalesce(v_origen_activo, false)
     or not coalesce(v_destino_activo, false) then
    return jsonb_build_object('convertible', false, 'reason', 'inactive_unit');
  end if;

  if unidad_origen_id = unidad_destino_id then
    return jsonb_build_object(
      'convertible', true,
      'factor', 1,
      'origenId', unidad_origen_id,
      'destinoId', unidad_destino_id,
      'source', 'same_unit'
    );
  end if;

  if v_tipo_origen <> v_tipo_destino then
    return jsonb_build_object('convertible', false, 'reason', 'incompatible_magnitude');
  end if;

  select c.factor_conversion
  into v_factor
  from public.conversiones c
  where c.unidad_origen_id = $1
    and c.unidad_destino_id = $2
    and c.activo is true
    and c.factor_conversion > 0;

  if v_factor is not null then
    return jsonb_build_object(
      'convertible', true,
      'factor', v_factor,
      'origenId', unidad_origen_id,
      'destinoId', unidad_destino_id,
      'source', 'database'
    );
  end if;

  select c.factor_conversion
  into v_factor
  from public.conversiones c
  where c.unidad_origen_id = $2
    and c.unidad_destino_id = $1
    and c.activo is true
    and c.factor_conversion > 0;

  if v_factor is not null then
    return jsonb_build_object(
      'convertible', true,
      'factor', 1 / v_factor,
      'origenId', unidad_origen_id,
      'destinoId', unidad_destino_id,
      'source', 'database'
    );
  end if;

  return jsonb_build_object('convertible', false, 'reason', 'no_conversion');
end;
$$;

comment on function public.resolver_conversion(bigint, bigint)
  is 'Resuelve únicamente identidad o equivalencias explícitas activas; no infiere por tipo de magnitud.';

-- Contract aligned with the app's UnidadAlimento TypeScript type.
create or replace function public.obtener_unidades_alimento(p_alimento_id bigint)
returns table (
  unidad_id bigint,
  nombre text,
  simbolo text,
  tipo_magnitud_id bigint,
  tipo_magnitud_nombre text,
  es_base boolean,
  es_principal boolean
)
language sql
stable
set search_path = ''
as $$
  select
    u.id,
    u.nombre,
    u.simbolo,
    u.tipo_magnitud_id,
    tm.nombre,
    u.es_base,
    au.es_unidad_principal
  from public.alimentos_unidades au
  join public.unidades u on u.id = au.unidad_id
  join public.tipos_magnitud tm on tm.id = u.tipo_magnitud_id
  where au.alimento_id = p_alimento_id
    and u.activa is true
  order by au.es_unidad_principal desc, u.nombre;
$$;

-- Exposes only the catalog subset that currently has available stock,
-- without granting SOLICITANTE direct read access to productos_donados.
create or replace function public.obtener_alimentos_con_stock()
returns table (
  id bigint,
  nombre text,
  categoria text
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct
    a.id,
    a.nombre,
    coalesce(a.categoria, '') as categoria
  from public.entradas_inventario as e
  join public.productos_donados as pd on pd.id_producto = e.id_producto
  join public.alimentos as a on a.id = pd.alimento_id
  join public.usuarios as u on u.id = (select auth.uid())
  where u.estado = 'activo'
    and e.estado = 'disponible'
    and e.cantidad_disponible > 0
  order by a.nombre;
$$;

-- Returns only the operative stock a requester needs for a request; never
-- exposes full productos_donados rows to SOLICITANTE.
create or replace function public.obtener_stock_por_producto(p_nombre_producto text)
returns table (
  id_entrada uuid,
  id_deposito uuid,
  cantidad_disponible numeric,
  fecha_ingreso timestamptz,
  unidad_id bigint,
  unidad_nombre text,
  unidad_simbolo text,
  deposito text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id_entrada,
    e.id_deposito,
    e.cantidad_disponible,
    e.fecha_ingreso,
    coalesce(e.unidad_id, pd.unidad_id) as unidad_id,
    u.nombre as unidad_nombre,
    u.simbolo as unidad_simbolo,
    d.nombre as deposito
  from public.entradas_inventario as e
  join public.productos_donados as pd on pd.id_producto = e.id_producto
  join public.depositos as d on d.id_deposito = e.id_deposito
  join public.unidades as u on u.id = coalesce(e.unidad_id, pd.unidad_id)
  join public.usuarios as requester on requester.id = (select auth.uid())
  where requester.estado = 'activo'
    and e.estado = 'disponible'
    and e.cantidad_disponible > 0
    and nullif(btrim(coalesce(p_nombre_producto, '')), '') is not null
    and pd.nombre_producto ilike '%' || replace(
      replace(replace(btrim(p_nombre_producto), '\', '\\'), '%', '\%'),
      '_', '\_'
    ) || '%' escape '\'
  order by e.cantidad_disponible desc;
$$;

create or replace function public.obtener_notificaciones_usuario(
  p_limite integer default 50
) returns table (
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
language sql
stable
security invoker
set search_path = ''
as $$
  select
    n.id,
    n.titulo,
    n.mensaje,
    n.tipo,
    n.categoria,
    n.url_accion,
    n.metadatos,
    n.fecha_creacion,
    coalesce(nu.leida, false) as leida
  from public.notificaciones as n
  left join public.notificaciones_usuario as nu
    on nu.notificacion_id = n.id
   and nu.usuario_id = (select auth.uid())
  where (select private_auth.current_user_estado()) = 'activo'
    and (
      n.destinatario_id = (select auth.uid())
      or n.rol_destinatario = (select private_auth.current_user_role())
      or n.rol_destinatario = 'TODOS'
    )
    and (n.expira_en is null or n.expira_en > now())
    and coalesce(nu.oculta, false) is false
  order by n.fecha_creacion desc
  limit least(greatest(coalesce(p_limite, 50), 1), 100);
$$;

create or replace function public.marcar_notificacion_leida(
  p_notificacion_id uuid
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_resultado boolean := false;
begin
  if v_usuario_id is null
     or (select private_auth.current_user_estado()) <> 'activo' then
    return false;
  end if;

  insert into public.notificaciones_usuario as nu (
    notificacion_id,
    usuario_id,
    leida,
    fecha_lectura,
    oculta,
    created_at,
    updated_at
  )
  select
    n.id,
    v_usuario_id,
    true,
    now(),
    false,
    now(),
    now()
  from public.notificaciones as n
  where n.id = p_notificacion_id
    and (
      n.destinatario_id = v_usuario_id
      or n.rol_destinatario = (select private_auth.current_user_role())
      or n.rol_destinatario = 'TODOS'
    )
    and (n.expira_en is null or n.expira_en > now())
  on conflict (notificacion_id, usuario_id) do update
    set leida = true,
        fecha_lectura = coalesce(nu.fecha_lectura, excluded.fecha_lectura),
        updated_at = now()
    where nu.oculta is false
  returning true into v_resultado;

  return coalesce(v_resultado, false);
end;
$$;

create or replace function public.marcar_todas_notificaciones_leidas()
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
begin
  if v_usuario_id is null
     or (select private_auth.current_user_estado()) <> 'activo' then
    return false;
  end if;

  insert into public.notificaciones_usuario as nu (
    notificacion_id,
    usuario_id,
    leida,
    fecha_lectura,
    oculta,
    created_at,
    updated_at
  )
  select
    n.id,
    v_usuario_id,
    true,
    now(),
    false,
    now(),
    now()
  from public.notificaciones as n
  left join public.notificaciones_usuario as existente
    on existente.notificacion_id = n.id
   and existente.usuario_id = v_usuario_id
  where (
      n.destinatario_id = v_usuario_id
      or n.rol_destinatario = (select private_auth.current_user_role())
      or n.rol_destinatario = 'TODOS'
    )
    and (n.expira_en is null or n.expira_en > now())
    and coalesce(existente.oculta, false) is false
  on conflict (notificacion_id, usuario_id) do update
    set leida = true,
        fecha_lectura = coalesce(nu.fecha_lectura, excluded.fecha_lectura),
        updated_at = now()
    where nu.oculta is false;

  return true;
end;
$$;

create or replace function public.ocultar_notificacion(
  p_notificacion_id uuid
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_resultado boolean := false;
begin
  if v_usuario_id is null
     or (select private_auth.current_user_estado()) <> 'activo' then
    return false;
  end if;

  insert into public.notificaciones_usuario as nu (
    notificacion_id,
    usuario_id,
    leida,
    oculta,
    fecha_ocultacion,
    created_at,
    updated_at
  )
  select
    n.id,
    v_usuario_id,
    false,
    true,
    now(),
    now(),
    now()
  from public.notificaciones as n
  where n.id = p_notificacion_id
    and (
      n.destinatario_id = v_usuario_id
      or n.rol_destinatario = (select private_auth.current_user_role())
      or n.rol_destinatario = 'TODOS'
    )
    and (n.expira_en is null or n.expira_en > now())
  on conflict (notificacion_id, usuario_id) do update
    set oculta = true,
        fecha_ocultacion = coalesce(nu.fecha_ocultacion, excluded.fecha_ocultacion),
        updated_at = now()
  returning true into v_resultado;

  return coalesce(v_resultado, false);
end;
$$;

-- Inserts a notification as the caller. SECURITY INVOKER: the only
-- legitimate callers are SECURITY DEFINER triggers (running as owner) and
-- app_admin server code; RLS on `notificaciones` blocks anyone else.
create or replace function public.crear_notificacion(
  p_titulo character varying,
  p_mensaje text,
  p_tipo character varying,
  p_destinatario_id uuid,
  p_rol_destinatario character varying,
  p_categoria character varying,
  p_url_accion character varying default null::character varying,
  p_metadatos jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_notificacion_id uuid;
begin
  insert into public.notificaciones (
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
  values (
    p_titulo,
    p_mensaje,
    coalesce(p_tipo, 'info'),
    p_destinatario_id,
    p_rol_destinatario,
    p_categoria,
    p_url_accion,
    coalesce(p_metadatos, '{}'::jsonb),
    now()
  )
  returning id into v_notificacion_id;

  return v_notificacion_id;
end;
$$;

create or replace function public.limpiar_notificaciones_antiguas() returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notificaciones
  where expira_en is not null
    and expira_en <= now();
end;
$$;

-- ============================================================================
-- 5. public.* -- service-role-only functions (app_admin only; never granted
--    to app_user). Callable only from trusted server code.
-- ============================================================================

create or replace function public.dar_baja_producto(
  p_id_entrada uuid,
  p_cantidad numeric,
  p_motivo text,
  p_usuario_id uuid,
  p_observaciones text default null::text
) returns table(success boolean, message text, id_baja uuid, cantidad_restante numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_entrada public.entradas_inventario%rowtype;
  v_nombre_producto text;
  v_nueva_cantidad numeric;
  v_id_baja uuid;
  v_id_movimiento uuid;
  v_unidad_id bigint;
begin
  if p_usuario_id is null then
    return query select false, 'Usuario responsable inválido', null::uuid, null::numeric;
    return;
  end if;

  select rol into v_rol
  from public.usuarios
  where id = p_usuario_id and estado = 'activo';

  if v_rol not in ('ADMINISTRADOR', 'OPERADOR') then
    return query select false, 'Solo administradores u operadores activos pueden registrar bajas', null::uuid, null::numeric;
    return;
  end if;

  if p_motivo not in ('vencido', 'dañado', 'contaminado', 'rechazado', 'otro')
     or p_cantidad is null or p_cantidad <= 0 then
    return query select false, 'Datos de baja inválidos', null::uuid, null::numeric;
    return;
  end if;

  select * into v_entrada
  from public.entradas_inventario
  where id_entrada = p_id_entrada
  for update;

  if not found then
    return query select false, 'Entrada de inventario no encontrada', null::uuid, null::numeric;
    return;
  end if;

  if v_entrada.estado <> 'disponible' or v_entrada.cantidad_disponible < p_cantidad then
    return query select false, 'Cantidad insuficiente en la entrada seleccionada', null::uuid, v_entrada.cantidad_disponible;
    return;
  end if;

  select nombre_producto, unidad_id
  into v_nombre_producto, v_unidad_id
  from public.productos_donados
  where id_producto = v_entrada.id_producto;

  v_nueva_cantidad := v_entrada.cantidad_disponible - p_cantidad;

  update public.entradas_inventario
  set cantidad_disponible = v_nueva_cantidad,
      estado = case when v_nueva_cantidad = 0 then 'agotado' else 'disponible' end,
      updated_at = now()
  where id_entrada = p_id_entrada;

  insert into public.bajas_productos (
    id_producto,
    id_entrada,
    cantidad_baja,
    motivo_baja,
    usuario_responsable_id,
    observaciones,
    nombre_producto,
    cantidad_disponible_antes,
    id_deposito,
    estado_baja
  )
  values (
    v_entrada.id_producto,
    v_entrada.id_entrada,
    p_cantidad,
    p_motivo,
    p_usuario_id,
    p_observaciones,
    v_nombre_producto,
    v_entrada.cantidad_disponible,
    v_entrada.id_deposito,
    'confirmada'
  )
  returning public.bajas_productos.id_baja into v_id_baja;

  insert into public.movimiento_inventario_cabecera (
    id_donante,
    id_solicitante,
    estado_movimiento,
    observaciones
  )
  values (
    p_usuario_id,
    p_usuario_id,
    'completado',
    'Baja de producto - Motivo: ' || p_motivo
  )
  returning id_movimiento into v_id_movimiento;

  insert into public.movimiento_inventario_detalle (
    id_movimiento,
    id_producto,
    cantidad,
    tipo_transaccion,
    rol_usuario,
    observacion_detalle,
    unidad_id,
    unidad_convertida_id,
    id_entrada,
    id_deposito
  )
  values (
    v_id_movimiento,
    v_entrada.id_producto,
    p_cantidad,
    'baja',
    'distribuidor',
    p_observaciones,
    coalesce(v_entrada.unidad_id, v_unidad_id),
    coalesce(v_entrada.unidad_id, v_unidad_id),
    v_entrada.id_entrada,
    v_entrada.id_deposito
  );

  return query select true, 'Producto dado de baja exitosamente', v_id_baja, v_nueva_cantidad;
end;
$$;

create or replace function public.obtener_estadisticas_bajas(
  p_fecha_inicio timestamp with time zone default (now() - '30 days'::interval),
  p_fecha_fin timestamp with time zone default now()
) returns table(
  total_bajas bigint,
  total_cantidad numeric,
  bajas_por_vencido bigint,
  bajas_por_danado bigint,
  bajas_por_contaminado bigint,
  bajas_por_rechazado bigint,
  bajas_por_otro bigint,
  cantidad_vencido numeric,
  cantidad_danado numeric,
  cantidad_contaminado numeric,
  cantidad_rechazado numeric,
  cantidad_otro numeric
)
language plpgsql
set search_path = ''
as $$
begin
  return query
  select
    count(*)::bigint,
    coalesce(sum(cantidad_baja), 0),
    count(*) filter (where motivo_baja = 'vencido')::bigint,
    count(*) filter (where motivo_baja = 'dañado')::bigint,
    count(*) filter (where motivo_baja = 'contaminado')::bigint,
    count(*) filter (where motivo_baja = 'rechazado')::bigint,
    count(*) filter (where motivo_baja = 'otro')::bigint,
    coalesce(sum(cantidad_baja) filter (where motivo_baja = 'vencido'), 0),
    coalesce(sum(cantidad_baja) filter (where motivo_baja = 'dañado'), 0),
    coalesce(sum(cantidad_baja) filter (where motivo_baja = 'contaminado'), 0),
    coalesce(sum(cantidad_baja) filter (where motivo_baja = 'rechazado'), 0),
    coalesce(sum(cantidad_baja) filter (where motivo_baja = 'otro'), 0)
  from public.bajas_productos
  where fecha_baja between p_fecha_inicio and p_fecha_fin;
end;
$$;

create or replace function public.obtener_productos_proximos_vencer(p_dias_umbral integer)
returns table(
  id_entrada uuid,
  id_producto uuid,
  nombre_producto text,
  cantidad_disponible numeric,
  fecha_caducidad date,
  dias_para_vencer integer,
  id_deposito uuid,
  nombre_deposito text,
  unidad_simbolo text,
  prioridad text
)
language sql
stable
set search_path = ''
as $$
  select
    e.id_entrada,
    e.id_producto,
    p.nombre_producto,
    e.cantidad_disponible,
    e.fecha_vencimiento,
    (e.fecha_vencimiento - current_date)::integer,
    e.id_deposito,
    d.nombre,
    u.simbolo,
    case
      when e.fecha_vencimiento < current_date then 'vencido'
      when e.fecha_vencimiento - current_date <= 3 then 'alta'
      when e.fecha_vencimiento - current_date <= p_dias_umbral then 'media'
      else 'baja'
    end
  from public.entradas_inventario e
  join public.productos_donados p on p.id_producto = e.id_producto
  join public.depositos d on d.id_deposito = e.id_deposito
  left join public.unidades u on u.id = coalesce(e.unidad_id, p.unidad_id)
  where e.fecha_vencimiento is not null
    and e.estado = 'disponible'
    and e.cantidad_disponible > 0
    and e.fecha_vencimiento <= current_date + p_dias_umbral
  order by e.fecha_vencimiento asc, e.fecha_ingreso asc, e.id_entrada asc;
$$;

create or replace function public.obtener_info_producto_inventario(p_id_producto uuid)
returns table(
  nombre_producto text,
  alimento_nombre text,
  categoria text,
  unidad_nombre text,
  unidad_simbolo text,
  cantidad_total numeric
)
language plpgsql
stable
set search_path = ''
as $$
begin
  return query
  select
    pd.nombre_producto,
    a.nombre,
    a.categoria,
    u.nombre,
    u.simbolo,
    coalesce(sum(e.cantidad_disponible) filter (where e.estado = 'disponible'), 0)
  from public.productos_donados pd
  left join public.alimentos a on pd.alimento_id = a.id
  left join public.unidades u on u.id = pd.unidad_id
  left join public.entradas_inventario e on pd.id_producto = e.id_producto
  where pd.id_producto = p_id_producto
  group by pd.nombre_producto, a.nombre, a.categoria, u.nombre, u.simbolo;
end;
$$;

create or replace function public.aprobar_solicitud_alta_alimento_server(
  p_admin_id uuid,
  p_solicitud_id uuid,
  p_nombre text,
  p_categoria text,
  p_unidad_ids bigint[],
  p_unidad_principal_id bigint
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alimento_id bigint;
  v_unidad_id bigint;
  v_unidad_ids bigint[];
begin
  if not exists (
    select 1
    from public.usuarios
    where id = p_admin_id
      and rol = 'ADMINISTRADOR'
      and estado = 'activo'
  ) then
    raise exception 'Solo un administrador activo puede aprobar solicitudes de alta de alimento';
  end if;

  if p_nombre is null or length(trim(p_nombre)) = 0 then
    raise exception 'El nombre del alimento es obligatorio';
  end if;

  if p_categoria is null or length(trim(p_categoria)) = 0 then
    raise exception 'La categoria del alimento es obligatoria';
  end if;

  select array_agg(distinct unidad_id)
  into v_unidad_ids
  from unnest(p_unidad_ids) as unidad_ids(unidad_id)
  where unidad_id is not null;

  if v_unidad_ids is null or array_length(v_unidad_ids, 1) = 0 then
    raise exception 'Debes seleccionar al menos una unidad de medida';
  end if;

  if p_unidad_principal_id is not null and not (p_unidad_principal_id = any(v_unidad_ids)) then
    raise exception 'La unidad principal debe estar entre las unidades seleccionadas';
  end if;

  if exists (
    select 1
    from public.solicitudes_alta_alimentos
    where id = p_solicitud_id
      and estado <> 'pendiente'
  ) then
    raise exception 'La solicitud ya fue revisada';
  end if;

  if not exists (
    select 1
    from public.solicitudes_alta_alimentos
    where id = p_solicitud_id
      and estado = 'pendiente'
  ) then
    raise exception 'Solicitud de alta no encontrada';
  end if;

  insert into public.alimentos (nombre, categoria)
  values (trim(p_nombre), trim(p_categoria))
  returning id into v_alimento_id;

  foreach v_unidad_id in array v_unidad_ids loop
    insert into public.alimentos_unidades (
      alimento_id,
      unidad_id,
      es_unidad_principal
    )
    values (
      v_alimento_id,
      v_unidad_id,
      v_unidad_id = p_unidad_principal_id
    );
  end loop;

  update public.solicitudes_alta_alimentos
  set estado = 'aprobada',
      alimento_creado_id = v_alimento_id,
      revisado_por = p_admin_id,
      fecha_revision = now(),
      updated_at = now()
  where id = p_solicitud_id;

  return v_alimento_id;
end;
$$;

create or replace function public.consume_document_lookup_quota(
  p_user_id uuid,
  p_endpoint text,
  p_window_start timestamp with time zone,
  p_limit integer,
  p_window_seconds integer
) returns table(allowed boolean, requests_used integer, reset_at timestamp with time zone)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_reset_at timestamp with time zone;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate limit configuration';
  end if;

  v_reset_at := p_window_start + make_interval(secs => p_window_seconds);

  insert into public.api_rate_limits (user_id, endpoint, window_start, request_count)
  values (p_user_id, p_endpoint, p_window_start, 1)
  on conflict (user_id, endpoint, window_start)
  do update
    set request_count = public.api_rate_limits.request_count + 1,
        updated_at = now()
    where public.api_rate_limits.request_count < p_limit
  returning request_count into v_count;

  if v_count is null then
    select request_count
    into v_count
    from public.api_rate_limits
    where user_id = p_user_id
      and endpoint = p_endpoint
      and window_start = p_window_start;

    return query select false, coalesce(v_count, p_limit), v_reset_at;
    return;
  end if;

  return query select true, v_count, v_reset_at;
end;
$$;

-- ============================================================================
-- 6. public.* -- trigger functions (bindings live in 0005_triggers.sql)
-- ============================================================================

-- NOTE(auth-migration): in the source app this fired AFTER INSERT ON
-- auth.users (Supabase's GoTrue-managed table) and provisioned the matching
-- public.usuarios profile row transactionally on signup, clamping any
-- client-supplied role to DONANTE/SOLICITANTE. Per the migration plan, this
-- becomes an Auth.js `events.createUser` callback in application code
-- instead of a DB trigger (there is no more separate "raw_user_meta_data"
-- channel for a client to attack, so role is just a trusted server default
-- rather than something to clamp post-hoc). This function body is ported
-- verbatim as a reference for that callback's logic -- it is NOT bound to
-- any trigger by 0005_triggers.sql. The `public.user` table (see
-- src/db/schema/identity.ts) is the auth.users equivalent if a DB-trigger
-- approach is ever preferred instead.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested_role text := upper(coalesce(new.raw_user_meta_data->>'rol', 'SOLICITANTE'));
  v_role text;
begin
  v_role := case
    when v_requested_role in ('DONANTE', 'SOLICITANTE') then v_requested_role
    else 'SOLICITANTE'
  end;

  insert into public.usuarios (
    id,
    email,
    rol,
    estado,
    created_at,
    updated_at,
    recibir_notificaciones
  )
  values (
    new.id,
    new.email,
    v_role,
    'activo',
    now(),
    now(),
    true
  )
  on conflict (id) do nothing;

  return new;
exception
  when others then
    raise warning 'Error in handle_new_user: %', sqlerrm;
    return new;
end;
$$;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.update_bajas_productos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.validar_donacion_alimento_canonico()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.alimento_id is null then
    raise exception 'Las nuevas donaciones deben referenciar un alimento existente';
  end if;

  if coalesce(new.es_producto_personalizado, false) then
    raise exception 'Las nuevas donaciones no pueden usar producto personalizado';
  end if;

  return new;
end;
$$;

-- Historical duplicate-product guard, neutered to a no-op: product identity
-- is now donor + normalized name + unit (enforced by
-- idx_productos_donante_nombre_unidad), and two entries from the same donor
-- may legitimately share a name across different magnitudes (e.g. kg vs L).
create or replace function public.validar_producto_duplicado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  return new;
end;
$$;

-- Keeps each donation as an independent inventory entry; the catalog only
-- supplies identity and never re-accumulates quantities.
create or replace function public.crear_producto_desde_donacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_producto_id uuid;
  v_deposito_id uuid := new.id_deposito;
begin
  if not (
    (tg_op = 'INSERT' and new.estado = 'Aprobada') or
    (tg_op = 'UPDATE' and new.estado = 'Aprobada' and coalesce(old.estado, '') <> 'Aprobada')
  ) then
    return new;
  end if;

  if v_deposito_id is null or not exists (
    select 1
    from public.donante_depositos as dd
    join public.depositos as d on d.id_deposito = dd.id_deposito
    where dd.donante_id = new.user_id
      and dd.id_deposito = v_deposito_id
      and dd.activo is true
      and d.activo is true
  ) then
    raise exception 'La donación debe tener una bodega activa del donante';
  end if;

  select p.id_producto
  into v_producto_id
  from public.productos_donados as p
  where p.id_usuario = new.user_id
    and lower(trim(p.nombre_producto)) = lower(trim(new.tipo_producto))
    and p.unidad_id = new.unidad_id
  order by p.id_producto
  limit 1;

  if v_producto_id is null then
    insert into public.productos_donados (
      id_usuario,
      nombre_producto,
      descripcion,
      fecha_donacion,
      alimento_id,
      unidad_id
    )
    values (
      new.user_id,
      new.tipo_producto,
      new.observaciones,
      coalesce(new.creado_en, now()),
      new.alimento_id,
      new.unidad_id
    )
    returning id_producto into v_producto_id;
  end if;

  insert into public.entradas_inventario (
    donacion_id,
    donante_id,
    id_deposito,
    id_producto,
    unidad_id,
    cantidad_original,
    cantidad_disponible,
    fecha_vencimiento,
    estado,
    es_legacy
  )
  values (
    new.id,
    new.user_id,
    v_deposito_id,
    v_producto_id,
    new.unidad_id,
    new.cantidad,
    new.cantidad,
    new.fecha_vencimiento,
    'disponible',
    false
  )
  on conflict (donacion_id) where donacion_id is not null do nothing;

  return new;
end;
$$;

create or replace function public.trigger_notificacion_donacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.crear_notificacion(
      'Nueva Donación Registrada'::character varying,
      ('Se ha registrado una nueva donación de ' || new.tipo_producto)::text,
      'info'::character varying,
      null::uuid,
      'ADMINISTRADOR'::character varying,
      'donaciones'::character varying,
      '/admin/donaciones'::character varying,
      jsonb_build_object('donacion_id', new.id, 'tipo_producto', new.tipo_producto)
    );

    if new.user_id is not null then
      perform public.crear_notificacion(
        'Donación Registrada'::character varying,
        ('Tu donación de ' || new.tipo_producto || ' ha sido registrada exitosamente')::text,
        'success'::character varying,
        new.user_id::uuid,
        null::character varying,
        'donaciones'::character varying,
        '/donante/donaciones'::character varying,
        jsonb_build_object('donacion_id', new.id)
      );
    end if;

  elsif tg_op = 'UPDATE' and old.estado <> new.estado then
    if new.user_id is not null then
      perform public.crear_notificacion(
        'Estado de Donación Actualizado'::character varying,
        ('Tu donación de ' || new.tipo_producto || ' ahora está en estado: ' || new.estado)::text,
        (case
          when new.estado = 'Entregada' then 'success'
          when new.estado = 'Cancelada' then 'warning'
          else 'info'
        end)::character varying,
        new.user_id::uuid,
        null::character varying,
        'donaciones'::character varying,
        '/donante/donaciones'::character varying,
        jsonb_build_object('donacion_id', new.id, 'estado', new.estado)
      );
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.trigger_notificacion_solicitud()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.crear_notificacion(
      'Nueva Solicitud Recibida'::character varying,
      ('Se ha recibido una nueva solicitud de ' || new.tipo_alimento)::text,
      'info'::character varying,
      null::uuid,
      'ADMINISTRADOR'::character varying,
      'solicitudes'::character varying,
      '/admin/solicitudes'::character varying,
      jsonb_build_object('solicitud_id', new.id, 'tipo_alimento', new.tipo_alimento)
    );

    perform public.crear_notificacion(
      'Nueva Solicitud Recibida'::character varying,
      ('Se ha recibido una nueva solicitud de ' || new.tipo_alimento)::text,
      'info'::character varying,
      null::uuid,
      'OPERADOR'::character varying,
      'solicitudes'::character varying,
      '/operador/solicitudes'::character varying,
      jsonb_build_object('solicitud_id', new.id, 'tipo_alimento', new.tipo_alimento)
    );

    perform public.crear_notificacion(
      'Solicitud Registrada'::character varying,
      ('Tu solicitud de ' || new.tipo_alimento || ' ha sido registrada exitosamente')::text,
      'success'::character varying,
      new.usuario_id::uuid,
      null::character varying,
      'solicitudes'::character varying,
      '/user/solicitudes'::character varying,
      jsonb_build_object('solicitud_id', new.id)
    );

  elsif tg_op = 'UPDATE' and old.estado <> new.estado then
    perform public.crear_notificacion(
      'Estado de Solicitud Actualizado'::character varying,
      ('Tu solicitud de ' || new.tipo_alimento || ' ahora está en estado: ' || new.estado)::text,
      (case
        when new.estado = 'aprobada' then 'success'
        when new.estado = 'rechazada' then 'warning'
        else 'info'
      end)::character varying,
      new.usuario_id::uuid,
      null::character varying,
      'solicitudes'::character varying,
      '/user/solicitudes'::character varying,
      jsonb_build_object(
        'solicitud_id', new.id,
        'estado', new.estado,
        'comentario_admin', new.comentario_admin
      )
    );
  end if;

  return new;
end;
$$;

create or replace function public.trigger_notificacion_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'UPDATE' and old.estado is distinct from new.estado) then
    if new.estado = 'bloqueado' then
      perform public.crear_notificacion(
        'Cuenta Bloqueada'::character varying,
        'Tu cuenta ha sido bloqueada por un administrador. Si crees que esto es un error, contacta al soporte.'::text,
        'alerta'::character varying,
        new.id::uuid,
        null::character varying,
        'sistema'::character varying,
        null::character varying,
        '{}'::jsonb
      );
    elsif new.estado = 'desactivado' then
      perform public.crear_notificacion(
        'Cuenta Desactivada'::character varying,
        'Tu cuenta ha sido desactivada por un administrador. Contacta al soporte para mas informacion.'::text,
        'advertencia'::character varying,
        new.id::uuid,
        null::character varying,
        'sistema'::character varying,
        null::character varying,
        '{}'::jsonb
      );
    elsif new.estado = 'activo' and (old.estado = 'bloqueado' or old.estado = 'desactivado') then
      perform public.crear_notificacion(
        'Cuenta Reactivada'::character varying,
        'Tu cuenta ha sido reactivada. Ya puedes acceder al sistema normalmente.'::text,
        'exito'::character varying,
        new.id::uuid,
        null::character varying,
        'sistema'::character varying,
        null::character varying,
        '{}'::jsonb
      );
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validar_conversion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo_origen bigint;
  v_tipo_destino bigint;
  v_origen_activo boolean;
  v_destino_activo boolean;
begin
  if new.factor_conversion is null or new.factor_conversion <= 0 then
    raise exception 'El factor de conversión debe ser mayor que cero';
  end if;

  if new.unidad_origen_id = new.unidad_destino_id then
    raise exception 'Una conversión debe usar dos unidades diferentes';
  end if;

  select tipo_magnitud_id, activa
  into v_tipo_origen, v_origen_activo
  from public.unidades
  where id = new.unidad_origen_id;

  select tipo_magnitud_id, activa
  into v_tipo_destino, v_destino_activo
  from public.unidades
  where id = new.unidad_destino_id;

  if v_tipo_origen is null or v_tipo_destino is null then
    raise exception 'Las unidades de la conversión deben existir';
  end if;

  if v_tipo_origen <> v_tipo_destino then
    raise exception 'Las unidades de una conversión deben pertenecer a la misma magnitud';
  end if;

  if coalesce(new.activo, true) and (not v_origen_activo or not v_destino_activo) then
    raise exception 'No se puede activar una conversión con unidades inactivas';
  end if;

  return new;
end;
$$;

create or replace function public.validar_unidad_movimiento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_unidad_producto bigint;
  v_nombre_origen text;
  v_nombre_destino text;
  v_resolucion jsonb;
  v_unidad_convertida bigint;
  v_cantidad_original numeric;
  v_permite_fraccion boolean;
begin
  if new.unidad_id is null and tg_op = 'UPDATE' and old.unidad_id is null then
    return new;
  end if;

  if new.unidad_id is null and new.tipo_transaccion = 'baja' then
    select unidad_id
    into v_unidad_producto
    from public.productos_donados
    where id_producto = new.id_producto;
    new.unidad_id := v_unidad_producto;
  end if;

  if new.unidad_id is null then
    raise exception 'La unidad del movimiento es obligatoria';
  end if;

  if new.cantidad is null or new.cantidad <= 0 then
    raise exception 'La cantidad del movimiento debe ser mayor que cero';
  end if;

  select pd.unidad_id, u.nombre
  into v_unidad_producto, v_nombre_destino
  from public.productos_donados pd
  left join public.unidades u on u.id = pd.unidad_id
  where pd.id_producto = new.id_producto;

  if v_unidad_producto is null then
    raise exception 'El producto del movimiento no tiene una unidad válida';
  end if;

  select nombre into v_nombre_origen from public.unidades where id = new.unidad_id;
  if v_nombre_origen is null then
    raise exception 'La unidad del movimiento no existe';
  end if;

  v_resolucion := public.resolver_conversion(new.unidad_id, v_unidad_producto);
  if v_resolucion ->> 'convertible' <> 'true' then
    raise exception 'No existe conversión entre % y % para esta operación',
      v_nombre_origen, v_nombre_destino;
  end if;

  v_unidad_convertida := coalesce(new.unidad_convertida_id, v_unidad_producto);
  if v_unidad_convertida <> v_unidad_producto then
    raise exception 'La unidad convertida debe coincidir con la unidad del producto';
  end if;
  new.unidad_convertida_id := v_unidad_producto;

  v_cantidad_original := coalesce(
    new.cantidad_original,
    new.cantidad / (v_resolucion ->> 'factor')::numeric
  );
  new.cantidad_original := v_cantidad_original;
  new.cantidad := v_cantidad_original * (v_resolucion ->> 'factor')::numeric;

  select permite_fraccion
  into v_permite_fraccion
  from public.unidades
  where id = new.unidad_id;

  if not coalesce(v_permite_fraccion, true)
     and v_cantidad_original <> trunc(v_cantidad_original) then
    raise exception 'La unidad % no permite cantidades decimales', v_nombre_origen;
  end if;

  return new;
end;
$$;

create or replace function public.validar_cantidad_por_unidad()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_nombre text;
  v_permite_fraccion boolean;
begin
  if new.unidad_id is null and tg_op = 'UPDATE' and old.unidad_id is null then
    return new;
  end if;

  if new.unidad_id is null then
    raise exception 'La unidad es obligatoria';
  end if;

  if new.cantidad is null or new.cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero';
  end if;

  select nombre, permite_fraccion
  into v_nombre, v_permite_fraccion
  from public.unidades
  where id = new.unidad_id
    and activa is true;

  if v_nombre is null then
    raise exception 'La unidad no existe o está inactiva';
  end if;

  if not coalesce(v_permite_fraccion, true) and new.cantidad <> trunc(new.cantidad) then
    raise exception 'La unidad % no permite cantidades decimales', v_nombre;
  end if;

  return new;
end;
$$;

create or replace function public.validar_cancelacion_donacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_role text;
begin
  if old.estado = 'Cancelada'::text then
    raise exception 'Una donacion cancelada no puede modificarse ni cancelarse nuevamente';
  end if;

  if new.estado = 'Cancelada'::text then
    if old.estado <> 'Pendiente'::text then
      raise exception 'Solo se pueden cancelar donaciones pendientes';
    end if;

    if v_actor_id is null then
      raise exception 'Se requiere un usuario autenticado para cancelar una donacion';
    end if;

    select u.rol
    into v_actor_role
    from public.usuarios u
    where u.id = v_actor_id
      and u.estado = 'activo'::text;

    if v_actor_role is null or v_actor_role not in ('DONANTE'::text, 'ADMINISTRADOR'::text) then
      raise exception 'Solo un donante o administrador activo puede cancelar una donacion';
    end if;

    if v_actor_role = 'DONANTE'::text and new.user_id is distinct from v_actor_id then
      raise exception 'Un donante solo puede cancelar sus propias donaciones';
    end if;

    if v_actor_role = 'DONANTE'::text and new.motivo_cancelacion <> 'solicitud_donante'::text then
      raise exception 'Las cancelaciones realizadas por un donante deben usar el motivo solicitud_donante';
    end if;

    if new.motivo_cancelacion is null then
      raise exception 'El motivo de cancelacion es obligatorio';
    end if;

    new.usuario_cancelacion_id := v_actor_id;
    new.fecha_cancelacion := now();
    new.actualizado_en := now();
  end if;

  return new;
end;
$$;

-- NOTE(auth-migration): usuario_id below is populated from
-- new.usuario_cancelacion_id, which the trigger above stamps from
-- auth.uid() (i.e. app.current_user_id). The FK on
-- auditoria_donaciones.usuario_id should target public.user(id), not
-- auth.users(id) -- see src/db/schema/donaciones.ts.
create or replace function public.registrar_auditoria_cancelacion_donacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
begin
  if old.estado = 'Pendiente'::text and new.estado = 'Cancelada'::text then
    select u.rol
    into v_actor_role
    from public.usuarios u
    where u.id = new.usuario_cancelacion_id;

    insert into public.auditoria_donaciones (
      donacion_id,
      accion,
      estado_anterior,
      estado_nuevo,
      usuario_id,
      rol_usuario,
      motivo,
      observaciones,
      fecha_evento,
      metadatos
    )
    values (
      new.id,
      'cancelacion'::text,
      old.estado,
      new.estado,
      new.usuario_cancelacion_id,
      coalesce(v_actor_role, 'DESCONOCIDO'::text),
      new.motivo_cancelacion,
      new.observaciones_cancelacion,
      coalesce(new.fecha_cancelacion, now()),
      jsonb_build_object('origen', 'trigger_validar_cancelacion_donacion')
    );
  end if;

  return new;
end;
$$;

create or replace function public.bloquear_mutacion_auditoria_donaciones()
returns trigger
language plpgsql
as $$
begin
  raise exception 'La bitacora de auditoria de donaciones es inmutable';
end;
$$;

create or replace function public.notificar_solicitud_bodega()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo_text text := case
    when new.tipo = 'ALTA' then 'nueva bodega'
    else 'modificación de bodega'
  end;
  v_estado_text text := case
    when new.estado = 'APROBADA' then 'aprobada'
    when new.estado = 'RECHAZADA' then 'rechazada'
    else lower(new.estado)
  end;
begin
  if tg_op = 'INSERT' then
    perform public.crear_notificacion(
      'Nueva solicitud de bodega',
      'Hay una solicitud de ' || v_tipo_text || ' pendiente para "' || new.nombre || '".',
      'info', null, 'OPERADOR', 'bodegas', '/operador/solicitudes-bodegas',
      jsonb_build_object('solicitudId', new.id, 'tipo', new.tipo)
    );
    perform public.crear_notificacion(
      'Nueva solicitud de bodega',
      'Hay una solicitud de ' || v_tipo_text || ' pendiente para "' || new.nombre || '".',
      'info', null, 'ADMINISTRADOR', 'bodegas', '/admin/reportes/solicitudes-bodegas',
      jsonb_build_object('solicitudId', new.id, 'tipo', new.tipo)
    );
  elsif tg_op = 'UPDATE'
    and old.estado is distinct from new.estado
    and new.estado in ('APROBADA', 'RECHAZADA') then
    perform public.crear_notificacion(
      'Solicitud de bodega ' || v_estado_text,
      'La solicitud para "' || new.nombre || '" fue ' || v_estado_text ||
        case when new.motivo_rechazo is null then '.'
             else '. Motivo: ' || new.motivo_rechazo end,
      case when new.estado = 'APROBADA' then 'success' else 'error' end,
      new.donante_id, null, 'bodegas', '/donante/configuracion/bodegas',
      jsonb_build_object('solicitudId', new.id, 'estado', new.estado, 'tipo', new.tipo)
    );
  end if;

  return new;
end;
$$;
