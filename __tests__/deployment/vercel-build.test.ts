import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const rootDir = process.cwd();

interface SpawnResult {
  error?: Error;
  status?: number | null;
}

interface TestLogger {
  error: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
}

interface VercelBuildModule {
  MIGRATION_OVERRIDE_ENV: string;
  shouldRunMigrations: (env: NodeJS.ProcessEnv) => boolean;
  runVercelBuild: (options: {
    env: NodeJS.ProcessEnv;
    logger: TestLogger;
    spawn: (command: string, args: string[], options: unknown) => SpawnResult;
  }) => number;
}

async function loadVercelBuildModule(): Promise<VercelBuildModule> {
  return import(pathToFileURL(path.join(rootDir, 'scripts', 'vercel-build.mjs')).href) as Promise<VercelBuildModule>;
}

function createLogger(): TestLogger {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

function createEnv(values: Record<string, string>): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    ...values,
  };
}

describe('Vercel build wrapper', () => {
  it('runs migrations before the build for production deployments', async () => {
    const { runVercelBuild } = await loadVercelBuildModule();
    const env = createEnv({ VERCEL_ENV: 'production' });
    const logger = createLogger();
    const spawn = vi.fn(() => ({ status: 0 }));

    expect(runVercelBuild({ env, logger, spawn })).toBe(0);

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn).toHaveBeenNthCalledWith(1, 'bun', ['run', 'db:migrate:deploy'], { stdio: 'inherit', env });
    expect(spawn).toHaveBeenNthCalledWith(2, 'bun', ['run', 'build'], { stdio: 'inherit', env });
    expect(logger.log).toHaveBeenCalledWith('Applying Prisma migrations before build...');
  });

  it('runs migrations for previews only when the explicit override is enabled', async () => {
    const { MIGRATION_OVERRIDE_ENV, runVercelBuild, shouldRunMigrations } = await loadVercelBuildModule();
    const env = createEnv({ VERCEL_ENV: 'preview', [MIGRATION_OVERRIDE_ENV]: 'true' });
    const logger = createLogger();
    const spawn = vi.fn(() => ({ status: 0 }));

    expect(shouldRunMigrations(env)).toBe(true);
    expect(runVercelBuild({ env, logger, spawn })).toBe(0);

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn).toHaveBeenNthCalledWith(1, 'bun', ['run', 'db:migrate:deploy'], { stdio: 'inherit', env });
    expect(spawn).toHaveBeenNthCalledWith(2, 'bun', ['run', 'build'], { stdio: 'inherit', env });
  });

  it('skips migrations outside production by default', async () => {
    const { runVercelBuild, shouldRunMigrations } = await loadVercelBuildModule();
    const env = createEnv({ VERCEL_ENV: 'preview' });
    const logger = createLogger();
    const spawn = vi.fn(() => ({ status: 0 }));

    expect(shouldRunMigrations(env)).toBe(false);
    expect(runVercelBuild({ env, logger, spawn })).toBe(0);

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith('bun', ['run', 'build'], { stdio: 'inherit', env });
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('Skipping Prisma migrations for VERCEL_ENV=preview'));
  });

  it('warns and safely skips migrations for invalid override values', async () => {
    const { MIGRATION_OVERRIDE_ENV, runVercelBuild } = await loadVercelBuildModule();
    const env = createEnv({ VERCEL_ENV: 'preview', [MIGRATION_OVERRIDE_ENV]: 'yes' });
    const logger = createLogger();
    const spawn = vi.fn(() => ({ status: 0 }));

    expect(runVercelBuild({ env, logger, spawn })).toBe(0);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`${MIGRATION_OVERRIDE_ENV}="yes" is not "true"`));
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith('bun', ['run', 'build'], { stdio: 'inherit', env });
  });

  it('stops the build and propagates a migration failure exit code', async () => {
    const { runVercelBuild } = await loadVercelBuildModule();
    const env = createEnv({ VERCEL_ENV: 'production' });
    const logger = createLogger();
    const spawn = vi.fn(() => ({ status: 2 }));

    expect(runVercelBuild({ env, logger, spawn })).toBe(2);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('logs spawn errors and returns a failing exit code', async () => {
    const { runVercelBuild } = await loadVercelBuildModule();
    const env = createEnv({ VERCEL_ENV: 'production' });
    const logger = createLogger();
    const error = new Error('bun executable missing');
    const spawn = vi.fn(() => ({ error, status: null }));

    expect(runVercelBuild({ env, logger, spawn })).toBe(1);

    expect(logger.error).toHaveBeenCalledWith(error);
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});