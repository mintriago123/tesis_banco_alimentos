-- Application-level Postgres roles.
--
-- app_user  : ordinary LOGIN role, RLS-enforced. The Drizzle `db` client
--             (src/db/client.ts) always connects as this role. Mirrors the
--             old Supabase `authenticated` role.
-- app_admin : LOGIN role with BYPASSRLS. The Drizzle `dbAdmin` client
--             connects as this role, used only from explicit, reviewed
--             privileged server-side code paths. Mirrors the old Supabase
--             `service_role`.
--
-- Passwords below are dev/test placeholders (this is a fresh database with
-- no real data, per the migration plan) -- rotate them for anything beyond
-- local development and set the real values via DATABASE_URL /
-- DATABASE_ADMIN_URL, never by editing this file.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user with login password 'changeme_app_user';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'app_admin') then
    create role app_admin with login password 'changeme_app_admin' bypassrls;
  end if;
end;
$$;

grant usage on schema public to app_user, app_admin;
grant usage on schema extensions to app_user, app_admin;
