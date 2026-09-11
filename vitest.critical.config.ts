import { mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default mergeConfig(baseConfig, {
  test: {
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
