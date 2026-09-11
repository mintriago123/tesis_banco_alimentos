-- Recreates the one Supabase-specific primitive the ported RLS policies and
-- SECURITY DEFINER functions depend on: auth.uid(). In Supabase, PostgREST
-- sets the `request.jwt.claims` GUC from the verified JWT on every request
-- and auth.uid() reads the `sub` claim out of it. Here, the app sets
-- `app.current_user_id` itself via `SET LOCAL` inside a transaction wrapper
-- (see withRlsContext in src/db/client.ts) before running any RLS-scoped
-- query, and this function reads that instead.
--
-- Recreating it in a schema literally named `auth` (rather than inlining a
-- different function name everywhere) means every one of the ~140 ported RLS
-- policies and ~20 ported functions below needed zero text changes to their
-- auth.uid() calls.
create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

grant usage on schema auth to app_user, app_admin;
grant execute on function auth.uid() to app_user, app_admin;
