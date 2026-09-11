# Testing

Three layers, each with a different job. See the main
[README](../README.md) for how to get Postgres/Mailpit running locally.

| Layer | Command | Needs | Current size |
|---|---|---|---|
| Unit | `pnpm test` | Nothing (jsdom, no DB) | 69 tests / 12 files |
| Integration | `RUN_DB_INTEGRATION=true pnpm test:integration` | Postgres (`docker compose up -d`) | 29 tests / 6 files |
| E2E | `pnpm test:e2e` | Postgres; Mailpit for one test (`pnpm docker:e2e`) | 5 tests / 1 file |

## Unit tests

Plain Vitest, jsdom environment, colocated with source as `*.test.ts`. No
database, no network. Covers pure functions and logic that's cheap to
isolate: validation schemas (`src/modules/auth/validation.test.ts`),
`server-auth.ts`'s role/status guards, CSRF checks, comprobante/QR
generation, unit conversion, stock-calculation math, and the notification
event dispatcher's pure payload-parsing/role-gating logic.

A module that transitively imports `@/db/client` (even if the specific
function under test never queries anything) needs `DATABASE_URL`/
`DATABASE_ADMIN_URL` to be *set* at import time — `postgres()` connects
lazily, so this is a harmless placeholder, not a real DB dependency.
`src/test/setup.ts` provides one for exactly this reason.

## Integration tests

`tests/integration/*.test.ts`, run under `vitest.integration.config.ts`
(plain Node, not jsdom). Gated behind `RUN_DB_INTEGRATION=true` so a bare
`pnpm test` never needs a live database — each file's `describe` block is
`describe.skip` unless that env var is set.

These exist because a large share of this app's actual risk lives in
**database orchestration** — RLS policies, triggers, and Postgres
functions — which a mocked DB client can't exercise meaningfully. Rather
than reviving the old Supabase-client-mocked tests, these hit a real
Postgres instance directly:

- **`api-admin-usuarios.test.ts`, `api-notificaciones.test.ts`** — Route
  Handler contract tests: auth, CSRF, role gating, payload validation, and
  DB-state assertions, calling the exported `PATCH`/`POST` functions
  directly with constructed `Request` objects (no HTTP server needed).
- **`solicitud-approval.test.ts`** — the highest-risk business logic:
  `approveSolicitud`/`processPartialDelivery`'s FEFO stock consumption,
  exercised through the real `descontar_stock_por_lote` Postgres function.
- **`donaciones-actions.test.ts`** — donation approve/cancel through the
  real `crear_producto_desde_donacion` and `validar_cancelacion_donacion`
  triggers, including the immutable audit trail (`auditoria_donaciones`
  rejects any mutation and FK-restricts deleting the rows it audits — test
  cleanup tolerates that by design, it's the feature working correctly).
- **`db-security.test.ts`** — RLS ownership isolation and privileged-RPC
  gating, verified directly against Postgres via `withRlsContext`.
- **`registration-security.test.ts`** — no-privilege-escalation-at-signup,
  now enforced by `rolRegistrableSchema` rejecting anything outside
  `DONANTE`/`SOLICITANTE` outright (stronger than the old app's behavior,
  which *degraded* an invalid role to `SOLICITANTE` via a DB trigger
  reading Supabase's client-controlled user metadata — that metadata
  channel doesn't exist anymore, so there's nothing left to degrade from).

Each test seeds its own throwaway rows (suffixed with a timestamp) and
cleans them up in `afterAll`, using a superuser `postgres()` client
alongside `vi.mock('@/auth')` to stand in for the session.

## Coverage

Two separate coverage configs, both Vitest, both including
`tests/integration/**` (started as a unit-only run, which — since that
means the bulk of the DB-orchestration logic never executed — silently
understated real coverage; extending it to unit + integration together
moved the number from ~10% to ~22%):

- **`pnpm test:coverage:critical`** — fixed thresholds (80% statements/
  functions/lines, 70% branches) over a short, explicit list of the
  highest-risk files (auth, CSRF, the FEFO use-cases, the donation
  actions). **Currently fails**: `server-auth.ts`, `csrf.ts`, and
  `comprobanteService.ts` clear the bar comfortably, but
  `rejectSolicitud.ts`, `deliverSolicitud.ts`, the
  `cancelaciones-donaciones`/`catalogo-solicitudes/aprobar`/`comprobante/
  [codigo]`/`operador/bajas` route handlers, and the
  `useIdentityValidation`/`useProfileUpdate` hooks have no dedicated tests
  yet (unlike `approveSolicitud`/`processPartialDelivery`/the donaciones
  actions, which the integration suite already covers well past 60%).
  Closing that gap means writing tests targeting those specific files, not
  a config change.
- **`pnpm test:coverage:business`** — broader include glob (API routes,
  `lib/`, module services/hooks/utils). No static threshold — see below.

Run either with `RUN_DB_INTEGRATION=true` set (and Postgres up) for the
full picture; without it, only unit coverage is measured and the number
will look lower than it really is.

### The coverage ratchet

`vitest.business.config.ts` has no fixed pass/fail threshold — this
codebase is mid-buildout, and a static bar is either too strict (blocking
unrelated work) or too loose (never moves). Instead,
`tests/coverage-baseline.json` records the current floor per metric
(`total`/`covered`/`pct`), and `scripts/check-coverage-ratchet.mjs`
compares a fresh run against it:

```bash
pnpm test:coverage:business:ratchet
```

Fails only if coverage **drops** below the committed baseline — either the
percentage falls, or the measurable scope (`total`) shrinks (which would
otherwise mask a regression by simply deleting instrumented code). It has
no opinion on whether coverage is *high enough*; `target` in the baseline
file is an aspirational number, printed for visibility, not enforced.

To raise the floor after genuinely improving coverage:

```bash
RUN_DB_INTEGRATION=true pnpm test:coverage:business
node scripts/generate-coverage-baseline.mjs
```

This regenerates `minimum` from the fresh report while preserving `target`
— never hand-edit `minimum` upward to "fix" a failing ratchet without an
actual coverage improvement backing it.

## End-to-end tests

Playwright, `tests/e2e/`. `global-setup.ts` seeds real accounts (one per
role, plus a blocked one) directly via bcrypt + SQL — mirroring what
`registrarAction` does — and logs each in through the real UI once to
capture a `storageState`, which most tests reuse instead of re-authenticating.

`playwright.config.ts` loads `.env.local` itself (Playwright doesn't
auto-load it the way Next.js does) and resolves `appOrigin` from it before
anything else runs — this matters because a mismatched `localhost` vs
`127.0.0.1` between the app and the test runner silently breaks cookie
matching (`AUTH-P0-003` was fixed exactly this way, found only by running
the test live, not from a type or build check).

### PROFILE-P1-001 and Mailpit

The password-recovery e2e test is the one exception to "no external
services needed": it needs real outbound email to assert against. Rather
than mocking `sendEmail`, `playwright.config.ts`'s `webServer.env`
redirects *only the spawned test server's* email provider to a local
[Mailpit](https://mailpit.axllent.org/) instance:

```ts
env: {
  EMAIL_PROVIDER: 'smtp',
  EMAIL_SUPPRESS_SEND: 'false',
  EMAIL_SMTP_HOST: '127.0.0.1',
  EMAIL_SMTP_PORT: '1025',
},
```

`.env.local`'s own `EMAIL_SUPPRESS_SEND=true` is untouched for `pnpm dev`/
`pnpm start` run by hand — this override only applies to the process
Playwright itself spawns.

Start Mailpit before running the suite for full coverage:

```bash
pnpm docker:e2e   # docker compose --profile e2e up -d
pnpm test:e2e
```

The test self-skips (not fails) if Mailpit isn't reachable
(`tests/e2e/helpers/mailpit.ts`'s `isMailpitReachable`), the same gating
pattern integration tests use for `RUN_DB_INTEGRATION` — nobody's plain
`pnpm test:e2e` breaks just because they didn't start Mailpit.

**Gotcha:** Playwright's `reuseExistingServer: !process.env.CI` means that
if a `next start` process from an earlier session is still holding port
3000, Playwright reuses it silently — including its *original* environment,
without the `webServer.env` override. If PROFILE-P1-001 fails with "no
email arrived" but everything else looks right, check for and kill a stale
`next start` process first before assuming the test itself is broken.
