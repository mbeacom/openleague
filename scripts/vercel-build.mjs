#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const MIGRATION_OVERRIDE_ENV = 'OPENLEAGUE_RUN_MIGRATIONS_ON_BUILD';

export function shouldRunMigrations(env = process.env) {
  return env.VERCEL_ENV === 'production' || env[MIGRATION_OVERRIDE_ENV] === 'true';
}

export function getMigrationOverrideWarning(env = process.env) {
  const value = env[MIGRATION_OVERRIDE_ENV];

  if (value && value !== 'true' && value !== 'false') {
    return `Warning: ${MIGRATION_OVERRIDE_ENV}=${JSON.stringify(value)} is not "true". Migrations will be skipped unless VERCEL_ENV=production.`;
  }

  return null;
}

export function runCommand(command, args, { env = process.env, logger = console, spawn = spawnSync } = {}) {
  const result = spawn(command, args, {
    stdio: 'inherit',
    env,
  });

  if (result.error) {
    logger.error(result.error);
    return 1;
  }

  if (result.status !== 0) {
    return result.status ?? 1;
  }

  return 0;
}

export function runVercelBuild({ env = process.env, logger = console, spawn = spawnSync } = {}) {
  const migrationOverrideWarning = getMigrationOverrideWarning(env);

  if (migrationOverrideWarning) {
    logger.warn(migrationOverrideWarning);
  }

  if (shouldRunMigrations(env)) {
    logger.log('Applying Prisma migrations before build...');
    const migrationStatus = runCommand('bun', ['run', 'db:migrate:deploy'], { env, logger, spawn });

    if (migrationStatus !== 0) {
      return migrationStatus;
    }
  } else {
    logger.log(
      `Skipping Prisma migrations for VERCEL_ENV=${env.VERCEL_ENV ?? 'local'}. ` +
        `Set ${MIGRATION_OVERRIDE_ENV}=true to force migration deployment.`,
    );
  }

  return runCommand('bun', ['run', 'build'], { env, logger, spawn });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const status = runVercelBuild();

  if (status !== 0) {
    process.exit(status);
  }
}
