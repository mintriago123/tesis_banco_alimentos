import { mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

export default mergeConfig(baseConfig, {
  test: {
    coverage: {
      reportsDirectory: './coverage-business',
      include: ['src/app/api/**/route.ts', 'src/lib/**/*.ts', 'src/modules/**/services/**/*.ts', 'src/modules/**/hooks/**/*.{ts,tsx}', 'src/modules/**/utils/**/*.ts'],
      thresholds: {
        statements: 25,
        branches: 25,
        functions: 20,
        lines: 25,
      },
    },
  },
});
