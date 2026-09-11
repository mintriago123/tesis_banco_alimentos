# Architecture

This document covers the pieces that changed in the Supabase → standalone
Postgres migration: data access, authorization, authentication, and
realtime. For setup instructions, see the main [README](../README.md).

## Database

**31 tables**, defined as Drizzle schema under `src/db/schema/` and applied
to Postgres as raw SQL under `src/db/migrations/` (run in filename order):

| File | Contents |
|---|---|
| `0001_extensions.sql` | `pgcrypto`, `uuid-ossp`, `pg_stat_statements` |
| `0002_roles.sql` | `app_user` (RLS-enforced) and `app_admin` (`BYPASSRLS`) Postgres roles |
| `0003_auth_shim.sql` | `auth.uid()` — reads a `SET LOCAL app.current_user_id` GUC, recreating the one piece of Supabase-specific SQL every RLS policy depended on |
| `0004_functions.sql` | 47 functions: business logic (stock discounting, comprobante codes, notification triggers) and RLS helper predicates |
| `0005_triggers.sql` | Triggers wiring the functions above to table changes |
| `0006_rls_policies.sql` | 68 Row-Level Security policies |
| `0007_grants.sql` | Table/function grants for `app_user`/`app_admin` |
| `0008_views.sql` | Reporting views |
| `0009_realtime_notify.sql` | `pg_notify` triggers feeding the SSE layer (see [Realtime](#realtime)) |

### Why RLS, and why it barely changed

The app keeps its original "thin app / fat database" design: authorization
lives in Postgres policies, not just in application code, so a bug in a
Server Action can't bypass row-level access control the way it could if
authorization were purely a `WHERE` clause the app remembered to add.

Supabase's RLS policies all call `auth.uid()`, which PostgREST populated
from a JWT claim. Since that mechanism doesn't exist without Supabase,
`0003_auth_shim.sql` recreates `auth.uid()` as a real function reading a
transaction-scoped GUC instead:

```sql
create function auth.uid() returns uuid as $$
  select current_setting('app.current_user_id', true)::uuid
$$ language sql stable;
```

This is why the 68 RLS policies ported with **near-zero text changes** —
only the mechanism that populates `auth.uid()`'s answer changed, not the
policies themselves.

### Two roles, two Drizzle clients

`src/db/client.ts` exports:

- **`db`** — connects as `app_user` (RLS-enforced). Used for essentially
  all request handling.
- **`dbAdmin`** — connects as `app_admin` (`BYPASSRLS`). Reserved for
  explicit, reviewed privileged code paths (e.g. Auth.js's `authorize()`,
  which must read a user's password hash before any session exists to
  scope RLS to).
- **`withRlsContext(userId, fn)`** — runs `fn` inside a transaction that
  first does `SET LOCAL app.current_user_id = $1`, so every RLS policy's
  `auth.uid()` call resolves to `userId` for the duration of the callback.
  **This is the only sanctioned way to run RLS-scoped queries** — Server
  Actions and Route Handlers call it after resolving the session, never
  querying `db` directly outside its callback.

### Calling Postgres functions from Drizzle

Business logic that needs to be atomic and race-safe (FEFO stock
consumption, comprobante numbering) stays in Postgres functions rather than
being re-implemented in TypeScript. Drizzle calls them via its `sql`
escape hatch:

```ts
const [row] = await db.execute<{ resultado: DescontarStockRpcResult } & Record<string, unknown>>(
  sql`select descontar_stock_por_lote(${depositoId}::uuid, ${productoId}::uuid, ${cantidad}::numeric, ${unidadId}::bigint) as resultado`,
);
```

(Note the `& Record<string, unknown>` — Drizzle's `execute<T>` requires it;
a plain `interface` won't satisfy the generic constraint.)

## Authentication

Auth.js v5 (`src/auth.ts`), Credentials provider, **JWT session strategy**
— not database sessions, and no adapter:

> Auth.js's Credentials provider only supports the JWT session strategy; a
> `database` strategy throws `UnsupportedStrategy` at runtime. This was
> confirmed against a live login attempt, not from documentation.

Because there's no adapter, `authorize()` reads directly against the
`users`/`usuarios` tables via `dbAdmin` (no RLS context exists yet at this
point — nobody's authenticated). Two custom `CredentialsSignin` subclasses
(`account-blocked`, `account-deactivated`) let a blocked/deactivated
account get a specific, non-leaky error code back to the client instead of
a generic failure or an error message revealing account existence.

To preserve the pre-migration property that **blocking a user takes effect
on their next request, not their next login**, the JWT itself only carries
a stable user id (stamped once in the `jwt` callback); `rol`/`estado`/
`nombre`/`cedula`/`ruc` are re-read from the database in the `session`
callback on every call.

`trustHost: true` is required for a self-hosted app behind a reverse
proxy whose forwarded `Host` header varies — without it, Auth.js rejects
requests with `UntrustedHost`.

### Route protection

Next.js 16 renamed `middleware.ts` to `proxy.ts` (same mechanism; Node.js
runtime by default now, not Edge). `src/proxy.ts` gates `/admin`,
`/donante`, `/operador`, `/user` route prefixes against the matching role,
redirecting to `/auth/iniciar-sesion?error=unauthorized` (no session) or
`?error=forbidden` (wrong role) before the page ever renders — this
replaces the old app's client-side-only session refresh guard with a real
server-side gate.

## Realtime notifications

Supabase Realtime (`postgres_changes` over its managed websocket
infrastructure) is replaced with Postgres `LISTEN`/`NOTIFY` + Server-Sent
Events:

1. Triggers on `notificaciones`/`notificaciones_usuario`
   (`0009_realtime_notify.sql`) call `pg_notify('notificaciones_channel', ...)`
   with a small JSON pointer payload (Postgres's `NOTIFY` payload is capped
   at 8000 bytes, so this is a pointer, not the full row).
2. `src/lib/realtime/listener.ts` holds **one dedicated, long-lived `LISTEN`
   connection per Node process** — outside the pooled `db`/`dbAdmin`
   clients, since `LISTEN` needs a persistent session incompatible with
   connection pooling — and fans out incoming notifications to subscribers
   in-memory.
3. `src/app/api/notifications/stream/route.ts` exposes that as an SSE
   endpoint; `src/modules/shared/hooks/useNotificaciones.ts` subscribes via
   `EventSource`, with a periodic fallback poll.

**Authorization here is not automatic** the way Supabase RLS-gated
`postgres_changes` was — the SSE route re-implements the visibility rules
by hand (own `destinatario_id`, matching `rol_destinatario`,
`rol_destinatario = 'TODOS'`, own `notificaciones_usuario.usuario_id`).

This design requires a long-running Node process (`next start`), not a
serverless or edge deployment — a request-scoped serverless function can't
hold an open `LISTEN` connection or a long-lived SSE stream.

## Module layout

`src/modules/` groups code by **role/domain**, not by technical layer —
`admin/reportes/solicitudes/` holds that feature's actions, services,
hooks, and components together, rather than splitting them across
`actions/`, `services/`, `hooks/` at the top level. Server Actions
(`actions.ts`) are the entry point from the UI; they resolve the session
via `requireAuth()`/`requireRole()` (`src/lib/server-auth.ts`), then run
their work inside `withRlsContext`.

The request-approval workflow
(`src/modules/admin/reportes/solicitudes/services/use-cases/`) is the
highest-complexity piece: `approveSolicitud`/`processPartialDelivery`
orchestrate FEFO stock consumption by calling `descontar_stock_por_lote`
via dependency-injected services (`inventoryService`, `movementService`,
`notificationService`). That orchestration is DB-heavy enough that it's
tested against real Postgres rather than mocked — see
[`TESTING.md`](TESTING.md).
