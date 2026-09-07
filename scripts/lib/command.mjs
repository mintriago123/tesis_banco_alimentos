import { spawnSync } from 'node:child_process';

export const runCommand = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    shell: false,
    stdio: options.capture ? 'pipe' : 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const capturedError = options.capture
      ? (result.stderr || result.stdout || '').trim()
      : '';
    throw new Error(
      `${command} ${args.join(' ')} terminó con código ${result.status}`
      + (capturedError ? `: ${capturedError}` : '.'),
    );
  }

  return options.capture ? result.stdout : '';
};
