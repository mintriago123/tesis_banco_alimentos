import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runCommand } from './command.mjs';

const supabaseStatusKeys = {
  apiUrl: ['API_URL'],
  publishableKey: ['PUBLISHABLE_KEY', 'ANON_KEY'],
  serviceRoleKey: ['SECRET_KEY', 'SERVICE_ROLE_KEY'],
};

const findPodmanSocket = () => {
  const configuredSocket = process.env.DOCKER_HOST;
  if (configuredSocket) {
    return configuredSocket;
  }

  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  const candidates = [
    process.env.XDG_RUNTIME_DIR
      ? join(process.env.XDG_RUNTIME_DIR, 'podman', 'podman.sock')
      : null,
    uid === null ? null : `/run/user/${uid}/podman/podman.sock`,
  ].filter((candidate) => candidate !== null);
  const socketPath = candidates.find((candidate) => existsSync(candidate));

  return socketPath ? `unix://${socketPath}` : undefined;
};

const requiredStatusValue = (status, keys, label) => {
  for (const key of keys) {
    const value = status[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  throw new Error(`supabase status no devolvió ${label}.`);
};

export const createSupabaseEnvironment = (projectRoot) => {
  const dockerHost = findPodmanSocket();
  const baseEnvironment = {
    ...process.env,
    ...(dockerHost ? { DOCKER_HOST: dockerHost } : {}),
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? 'local-tests-disabled',
    SUPABASE_TELEMETRY_DISABLED: '1',
  };

  const executeSupabase = (args, capture = false) => runCommand(
    'pnpm',
    ['exec', 'supabase', ...args],
    { cwd: projectRoot, env: baseEnvironment, capture },
  );

  const readStatus = () => {
    const output = executeSupabase(['status', '-o', 'json'], true);
    return JSON.parse(output);
  };

  const isRunning = () => {
    try {
      readStatus();
      return true;
    } catch {
      return false;
    }
  };

  const statusToChildEnvironment = (status) => {
    const apiUrl = requiredStatusValue(status, supabaseStatusKeys.apiUrl, 'API_URL');
    const publishableKey = requiredStatusValue(
      status,
      supabaseStatusKeys.publishableKey,
      'PUBLISHABLE_KEY o ANON_KEY',
    );
    const serviceRoleKey = requiredStatusValue(
      status,
      supabaseStatusKeys.serviceRoleKey,
      'SECRET_KEY o SERVICE_ROLE_KEY',
    );

    return {
      ...baseEnvironment,
      RUN_SUPABASE_INTEGRATION: 'true',
      SUPABASE_TEST_URL: apiUrl,
      SUPABASE_TEST_PUBLISHABLE_KEY: publishableKey,
      SUPABASE_TEST_SERVICE_ROLE_KEY: serviceRoleKey,
      NEXT_PUBLIC_SUPABASE_URL: apiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: publishableKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      APP_ORIGIN: 'http://127.0.0.1:3000',
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3000',
      EMAIL_PROVIDER: 'log',
      EMAIL_LOG_ONLY: 'true',
      EMAIL_SUPPRESS_SEND: 'true',
      NEXT_PUBLIC_MAPBOX_API_KEY: 'pk.local-business-tests',
    };
  };

  return {
    environment: baseEnvironment,
    isRunning,
    start: () => executeSupabase(['start']),
    stop: () => executeSupabase(['stop']),
    reset: () => executeSupabase(['db', 'reset', '--local']),
    readStatus,
    statusToChildEnvironment,
  };
};
