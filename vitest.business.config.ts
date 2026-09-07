import { mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default mergeConfig(baseConfig, {
  test: {
    coverage: {
      reportsDirectory: './coverage-business',
      include: [
        'src/app/api/**/route.ts',
        'src/lib/**/*.ts',
        'src/modules/**/services/**/*.ts',
        'src/modules/**/hooks/**/*.{ts,tsx}',
        'src/modules/**/utils/**/*.ts',
      ],
      thresholds: {
        statements: 33.57,
        branches: 32.42,
        functions: 29,
        lines: 34.46,
      },
    },
  },
});
