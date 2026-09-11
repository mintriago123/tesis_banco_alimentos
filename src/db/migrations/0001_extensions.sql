-- Extensions used by the ported schema/functions.
-- supabase_vault intentionally omitted: confirmed unused in the source
-- codebase (declared but never called via vault.* anywhere).
create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_stat_statements with schema extensions;
