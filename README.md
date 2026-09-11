# Banco de Alimentos

A food-bank management platform — donation intake, inventory (FEFO stock
consumption), beneficiary requests, and role-based dashboards for donors,
requesters, warehouse operators, and administrators.

Originally built on Supabase (managed Postgres + PostgREST + GoTrue Auth +
Realtime). This branch is a full migration to a **standalone, self-hosted
PostgreSQL** stack: Drizzle ORM for data access, Auth.js (Credentials/JWT)
for authentication, and Postgres `LISTEN`/`NOTIFY` + Server-Sent Events for
realtime notifications — while keeping the original "thin app / fat
database" design, with authorization enforced by **Row-Level Security**
policies at the database layer, not just in application code.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the pieces fit
together, and [`docs/TESTING.md`](docs/TESTING.md) for the test suite and
how to run each layer.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions, Route Handlers) |
| UI | React 19, Tailwind CSS 4 |
| Database | PostgreSQL 17, self-hosted (Docker Compose for local dev) |
| Data access | Drizzle ORM (`postgres.js` driver), raw `sql` for calling Postgres functions |
| Authorization | Row-Level Security policies + two Postgres roles (`app_user`, `app_admin`) |
| Auth | Auth.js v5 (Credentials provider, JWT sessions, bcrypt) |
| Realtime | Postgres `LISTEN`/`NOTIFY` → Server-Sent Events |
| Email | Nodemailer — Gmail SMTP in production, generic SMTP (Mailpit) for e2e |
| Testing | Vitest (unit + integration), Playwright (e2e) |

## Prerequisites

- Node.js 20+
- pnpm (`packageManager` pinned in `package.json`)
- Docker (for local Postgres, and optionally Mailpit for e2e)

## Getting started

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env.local
   ```

   Fill in `AUTH_SECRET` (`npx auth secret`) and, if you need real outbound
   email locally, `EMAIL_GMAIL_USER`/`EMAIL_GMAIL_PASS` — otherwise leave
   `EMAIL_SUPPRESS_SEND=true` (dev default) so nothing actually sends.

3. **Start Postgres**

   ```bash
   docker compose up -d
   ```

   This starts only the `db` service (Postgres 17, exposed on `5432`, matching
   `.env.example`'s connection strings). Mailpit is intentionally **not**
   started by this command — see [Email & Mailpit](#email--mailpit) below.

4. **Apply the database migrations**

   The schema, roles, RLS policies, and Postgres functions/triggers live as
   plain SQL under `src/db/migrations/`, applied in order. There's no
   automated runner yet (see [Known gaps](#known-gaps)) — apply them by hand
   against the superuser connection (`DATABASE_MIGRATE_URL`):

   ```bash
   for f in src/db/migrations/*.sql; do
     psql "$DATABASE_MIGRATE_URL" -v ON_ERROR_STOP=1 -f "$f"
   done
   ```

   This creates the `app_user`/`app_admin` roles referenced in
   `.env.example`'s `DATABASE_URL`/`DATABASE_ADMIN_URL` — change their
   passwords from the `changeme_*` placeholders before using this anywhere
   but a throwaway local database.

5. **Run the dev server**

   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start the Next.js dev server |
| `pnpm build` / `pnpm start` | Production build / start |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests (Vitest, jsdom, no DB) |
| `pnpm test:integration` | Integration tests against real Postgres — see [Testing](docs/TESTING.md) |
| `pnpm test:coverage:business` | Coverage over business logic (services/hooks/routes), unit + integration combined |
| `pnpm test:coverage:business:ratchet` | Same, then fails if coverage regressed below the committed baseline |
| `pnpm test:coverage:critical` | Coverage over the highest-risk files (auth, CSRF, FEFO use-cases), fixed 80% thresholds |
| `pnpm test:e2e` | Playwright end-to-end suite |
| `pnpm docker:e2e` | Start Mailpit (`--profile e2e`) for the e2e mail-capture test |

## Project structure

```
src/
  app/                  Next.js App Router: pages, layouts, Route Handlers,
                         proxy.ts (role-gated route protection)
  modules/
    admin/ auth/ donante/ operador/ user/ shared/ catalogo-solicitudes/
                         Feature modules: actions (Server Actions), services,
                         hooks, components — grouped by role/domain, not by
                         technical layer
  db/
    schema/              Drizzle table definitions (31 tables)
    migrations/           Raw SQL: extensions, roles, RLS policies, functions,
                         triggers, views, realtime NOTIFY triggers
    client.ts             db (RLS-enforced) / dbAdmin (BYPASSRLS) / withRlsContext()
  lib/
    email/                Provider-agnostic email sending (Gmail / SMTP)
    realtime/             LISTEN connection singleton
    comprobante/           Receipt/QR generation
  auth.ts                 Auth.js v5 config
  proxy.ts                 Role-based route gate (Next.js 16's middleware.ts successor)
tests/
  unit + component tests live alongside their source as *.test.ts(x)
  integration/            DB-backed tests (RUN_DB_INTEGRATION=true)
  e2e/                    Playwright specs, global-setup/teardown, helpers
```

## Email & Mailpit

Outbound email (password reset, notifications) goes through a provider
interface (`src/lib/email/`):

- **`EMAIL_PROVIDER=gmail`** (default) — real Gmail SMTP, used in
  production and available in dev if you fill in credentials.
- **`EMAIL_PROVIDER=smtp`** — generic SMTP transport with no vendor host
  baked in. Used only by the Playwright e2e run, which points it at a local
  [Mailpit](https://mailpit.axllent.org/) instance so the password-recovery
  test can assert against a real captured email instead of mocking the send.

Mailpit is **not** part of the default `docker compose up -d` — start it
only when running e2e:

```bash
pnpm docker:e2e          # docker compose --profile e2e up -d
pnpm test:e2e
```

Mailpit's web UI is at [http://localhost:8025](http://localhost:8025) if
you want to inspect captured mail by hand.

## Realtime notifications

Notifications use Postgres `LISTEN`/`NOTIFY` instead of a managed realtime
service: triggers on `notificaciones`/`notificaciones_usuario` call
`pg_notify`, one dedicated long-lived connection per app instance listens
and fans out to open connections, and the client subscribes over
Server-Sent Events (`/api/notifications/stream`). This requires a
long-running Node process (`next start`), not a serverless/edge deployment.

## Known gaps

- **No automated migration runner.** `src/db/migrations/*.sql` must be
  applied by hand (step 4 above) in order. A `pnpm db:migrate` script
  wrapping that loop would be a reasonable follow-up.
- **No CI workflow yet.** Tests are run locally; nothing in `.github/`
  currently gates PRs.
- **`pnpm test:coverage:critical` currently fails against its own 80%
  thresholds.** Several of the files it targets — the
  `cancelaciones-donaciones`/`catalogo-solicitudes/aprobar`/`comprobante/
  [codigo]`/`operador/bajas` route handlers, `rejectSolicitud.ts`,
  `deliverSolicitud.ts`, and the two `useIdentityValidation`/
  `useProfileUpdate` hooks — have no dedicated tests yet (unlike
  `approveSolicitud`/`processPartialDelivery`/donation actions, which are
  covered by `tests/integration/`). See [`docs/TESTING.md`](docs/TESTING.md).

## Further reading

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — database/RLS design,
  auth, realtime, module layout in more depth.
- [`docs/TESTING.md`](docs/TESTING.md) — the test pyramid, how to run each
  layer, and the coverage ratchet.
