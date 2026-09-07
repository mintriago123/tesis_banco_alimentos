import { resolve } from 'node:path';
import { runCommand } from './lib/command.mjs';
import { createSupabaseEnvironment } from './lib/supabase-local.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const localSupabase = createSupabaseEnvironment(projectRoot);
const didStartSupabase = !localSupabase.isRunning();
let childEnvironment = localSupabase.environment;

const runPnpmScript = (script) => {
  console.log(`\n==> pnpm ${script}`);
  runCommand('pnpm', [script], {
    cwd: projectRoot,
    env: childEnvironment,
  });
};

try {
  if (didStartSupabase) {
    console.log('==> Iniciando Supabase local');
    localSupabase.start();
  } else {
    console.log('==> Reutilizando Supabase local activo');
  }

  console.log('\n==> Restableciendo la base local');
  localSupabase.reset();
  childEnvironment = localSupabase.statusToChildEnvironment(localSupabase.readStatus());

  const e2eScript = childEnvironment.BUSINESS_TEST_E2E_SCRIPT ?? 'test:e2e';
  const scripts = [
    'test:traceability',
    'lint',
    'test',
    'test:coverage:critical',
    'test:coverage:business',
    'test:db',
    'test:integration:local',
    'build',
    e2eScript,
  ];

  for (const script of scripts) {
    if (
      script.startsWith('test:e2e')
      && childEnvironment.BUSINESS_TEST_SKIP_E2E === 'true'
    ) {
      console.log('\n==> E2E omitido por BUSINESS_TEST_SKIP_E2E=true');
      continue;
    }
    runPnpmScript(script);
  }
} finally {
  if (didStartSupabase) {
    console.log('\n==> Deteniendo Supabase local iniciado por el runner');
    localSupabase.stop();
  }
}
