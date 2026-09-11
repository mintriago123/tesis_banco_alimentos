import { mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

// Several of the files in this list (the FEFO use-cases, donaciones
// actions.ts) are DB orchestration only covered by tests/integration/**,
// not the jsdom unit suite — without this, their coverage reads as a flat
// 0% and the thresholds below fail unconditionally, regardless of the real
// integration coverage. Same fix as vitest.business.config.ts. Run with
// `RUN_DB_INTEGRATION=true pnpm test:coverage:critical` (docker compose db
// up) for real numbers; without it, only unit coverage is measured and
// these thresholds will fail.
try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local (e.g. CI with real env vars already set) — fine.
}

export default mergeConfig(baseConfig, {
  test: {
    testTimeout: 20000,
    include: ['tests/integration/**/*.test.ts'],
    coverage: {
      reportsDirectory: './coverage-critical',
      include: [
        'src/app/api/admin/cancelaciones-donaciones/route.ts',
        'src/app/api/admin/catalogo-solicitudes/aprobar/route.ts',
        'src/app/api/admin/usuarios/route.ts',
        'src/app/api/comprobante/[codigo]/route.ts',
        'src/app/api/operador/bajas/route.ts',
        'src/lib/comprobante/comprobanteService.ts',
        'src/lib/csrf.ts',
        'src/lib/server-auth.ts',
        'src/modules/admin/reportes/donaciones/actions.ts',
        'src/modules/admin/reportes/solicitudes/services/use-cases/approveSolicitud.ts',
        'src/modules/admin/reportes/solicitudes/services/use-cases/deliverSolicitud.ts',
        'src/modules/admin/reportes/solicitudes/services/use-cases/processPartialDelivery.ts',
        'src/modules/admin/reportes/solicitudes/services/use-cases/rejectSolicitud.ts',
        'src/modules/shared/hooks/useIdentityValidation.ts',
        'src/modules/shared/hooks/useProfileUpdate.ts',
        'src/modules/shared/services/notificationService.ts',
        'src/modules/user/services/stockCalculations.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});
