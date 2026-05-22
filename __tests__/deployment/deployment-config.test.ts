import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_AUTH_ALLOWED_HOSTS,
  DEFAULT_UPTIME_TARGETS,
  checkUptimeTargets,
  parseAuthAllowedHosts,
  parseAuthTargetNames,
  parseTimeoutMs,
  parseUptimeTargets,
} from '@/scripts/check-uptime';
import { validateDeploymentConfig } from '@/scripts/validate-deployment-config';

const rootDir = process.cwd();

async function readText(relativePath: string) {
  return readFile(path.join(rootDir, relativePath), 'utf8');
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readText(relativePath)) as T;
}

describe('deployment configuration', () => {
  it('passes the deployment readiness validator', async () => {
    await expect(validateDeploymentConfig(rootDir)).resolves.toEqual([]);
  });

  it('configures Vercel for reproducible Next.js production deploys', async () => {
    const vercel = await readJson<{
      framework?: string;
      buildCommand?: string;
      installCommand?: string;
      bunVersion?: string;
      crons?: Array<{ path?: string; schedule?: string }>;
      headers?: Array<{ headers?: Array<{ key?: string }> }>;
    }>('vercel.json');
    const packageJson = await readJson<{ scripts?: Record<string, string> }>('package.json');
    const proxySource = await readText('proxy.ts');

    expect(vercel.framework).toBe('nextjs');
    expect(vercel.buildCommand).toBe('bun run vercel:build');
    expect(vercel.installCommand).toBe('bun install --frozen-lockfile');
    expect(vercel.bunVersion).toBe('1.x');
    expect(packageJson.scripts).toEqual(expect.objectContaining({
      dev: 'bun --bun next dev --turbopack',
      build: 'bun --bun next build',
      'vercel:build': 'bun scripts/vercel-build.mjs',
      start: 'bun --bun next start',
    }));
    expect(proxySource).toContain('export const config');
    expect(proxySource).toContain('matcher');
    expect(proxySource).not.toMatch(/\bruntime\s*[:=]/u);
    expect(vercel.crons).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/api/cron/rsvp-reminders', schedule: '0 * * * *' }),
      expect.objectContaining({ path: '/api/cron/notification-batches', schedule: '0 8 * * *' }),
    ]));

    const headerKeys = vercel.headers?.flatMap((group) => group.headers?.map((header) => header.key) ?? []) ?? [];
    expect(headerKeys).toEqual(expect.arrayContaining([
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'Referrer-Policy',
    ]));
  });

  it('documents the preview migration override environment flag', async () => {
    const envExample = await readText('.env.example');

    expect(envExample).toContain('OPENLEAGUE_RUN_MIGRATIONS_ON_BUILD');
    expect(envExample).toContain('safe, isolated database');
  });

  it('keeps Sport enum value repair separate from column casts and defaults', async () => {
    const enumRepair = await readText('prisma/migrations/20260517000000_repair_public_sport_enum/migration.sql');
    const columnRepair = await readText('prisma/migrations/20260517000001_repair_public_sport_columns/migration.sql');

    expect(enumRepair).toContain('ALTER TYPE public."Sport" ADD VALUE IF NOT EXISTS');
    expect(enumRepair).not.toContain('ALTER TABLE public."Team"');
    expect(enumRepair).not.toContain('ALTER TABLE public."leagues"');

    expect(columnRepair).toContain('ALTER TABLE public."Team"');
    expect(columnRepair).toContain('ALTER TABLE public."leagues"');
    expect(columnRepair).not.toContain('ADD VALUE IF NOT EXISTS');
  });

  it('publishes documentation to GitHub Pages with the custom domain artifact', async () => {
    const docsWorkflow = await readText('.github/workflows/docs-pages.yml');
    const docsBuilder = await readText('scripts/build-docs-pages.ts');

    expect(docsWorkflow).toContain('bun run docs:build-pages');
    expect(docsWorkflow).toContain('actions/configure-pages');
    expect(docsWorkflow).toContain('actions/upload-pages-artifact');
    expect(docsWorkflow).toContain('actions/deploy-pages');
    expect(docsBuilder).toContain('openleague.dev');
    expect(docsBuilder).toContain('CNAME');
  });

  it('runs scheduled uptime monitoring for the main and docs sites', async () => {
    const packageJson = await readJson<{ scripts?: Record<string, string> }>('package.json');
    const deploymentChecksWorkflow = await readText('.github/workflows/deployment-checks.yml');
    const uptimeWorkflow = await readText('.github/workflows/uptime-monitoring.yml');

    expect(packageJson.scripts?.['uptime:check']).toBe('tsx scripts/check-uptime.ts');
    expect(deploymentChecksWorkflow).toContain('scripts/check-uptime.ts');
    expect(deploymentChecksWorkflow).toContain('.github/workflows/uptime-monitoring.yml');
    expect(uptimeWorkflow).toContain('schedule:');
    expect(uptimeWorkflow).toContain('workflow_dispatch');
    expect(uptimeWorkflow).toContain('bun run uptime:check');
    expect(uptimeWorkflow).toContain('UPTIME_CHECK_URLS');
    expect(uptimeWorkflow).toContain('UPTIME_CHECK_AUTH_TARGETS');
    expect(uptimeWorkflow).toContain('UPTIME_CHECK_AUTH_ALLOWED_HOSTS');
    expect(uptimeWorkflow).toContain('secrets.UPTIME_CHECK_TOKEN');
    expect(uptimeWorkflow).toContain('/api/health');
    expect(DEFAULT_UPTIME_TARGETS).toEqual([
      { name: 'main', url: 'https://openl.app' },
      { name: 'docs', url: 'https://openleague.dev' },
    ]);
  });
});

describe('uptime checker', () => {
  it('uses the production main and docs sites by default', () => {
    expect(parseUptimeTargets('')).toEqual(DEFAULT_UPTIME_TARGETS);
  });

  it('parses named target overrides', () => {
    expect(parseUptimeTargets('main=https://openl.app,docs=https://openleague.dev/status')).toEqual([
      { name: 'main', url: 'https://openl.app' },
      { name: 'docs', url: 'https://openleague.dev/status' },
    ]);
  });

  it('falls back to the default timeout for invalid values', () => {
    expect(parseTimeoutMs('not-a-number')).toBe(10_000);
    expect(parseTimeoutMs('-1')).toBe(10_000);
    expect(parseTimeoutMs('2500')).toBe(2500);
  });

  it('parses authenticated target names', () => {
    expect([...parseAuthTargetNames('')]).toEqual([]);
    expect([...parseAuthTargetNames('health, Protected Readiness')]).toEqual(['health', 'protected-readiness']);
  });

  it('uses app domains as default authenticated target host allowlist', () => {
    expect([...parseAuthAllowedHosts('')]).toEqual([...DEFAULT_AUTH_ALLOWED_HOSTS]);
    expect([...parseAuthAllowedHosts('OPENL.APP.,docs.example.com')]).toEqual(['openl.app', 'docs.example.com']);
  });

  it('marks healthy responses as passing', async () => {
    const fetcher = vi.fn(async () => new Response('ok', { status: 200, statusText: 'OK' })) as unknown as typeof fetch;

    const [result] = await checkUptimeTargets([{ name: 'main', url: 'https://openl.app' }], {
      fetcher,
      timeoutMs: 1_000,
    });

    expect(result).toMatchObject({
      name: 'main',
      url: 'https://openl.app',
      ok: true,
      status: 200,
      statusText: 'OK',
    });
    expect(fetcher).toHaveBeenCalledWith('https://openl.app', expect.objectContaining({ method: 'GET' }));
  });

  it('sends the uptime token only to explicitly authenticated targets', async () => {
    const fetcher = vi.fn(async () => new Response('ok', { status: 200, statusText: 'OK' })) as unknown as typeof fetch;

    await checkUptimeTargets([
      { name: 'main', url: 'https://openl.app' },
      { name: 'health', url: 'https://openl.app/api/health' },
    ], {
      authTargetNames: parseAuthTargetNames('health'),
      authAllowedHosts: parseAuthAllowedHosts('openl.app'),
      authToken: 'super-secret-token',
      fetcher,
      timeoutMs: 1_000,
    });

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      'https://openl.app',
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'https://openl.app/api/health',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer super-secret-token' }),
      }),
    );
  });

  it('fails authenticated targets before fetch when the token is missing', async () => {
    const fetcher = vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch;

    const [result] = await checkUptimeTargets([{ name: 'health', url: 'https://openl.app/api/health' }], {
      authTargetNames: parseAuthTargetNames('health'),
      authAllowedHosts: parseAuthAllowedHosts('openl.app'),
      fetcher,
      timeoutMs: 1_000,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      error: 'missing uptime check token',
    });
  });

  it('does not send the uptime token to authenticated target names on unapproved hosts', async () => {
    const fetcher = vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch;

    const [result] = await checkUptimeTargets([{ name: 'health', url: 'https://example.com/api/health' }], {
      authAllowedHosts: parseAuthAllowedHosts('openl.app'),
      authTargetNames: parseAuthTargetNames('health'),
      authToken: 'super-secret-token',
      fetcher,
      timeoutMs: 1_000,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      error: 'authenticated target host is not allowed',
    });
  });

  it('marks non-success responses as failing', async () => {
    const fetcher = vi.fn(async () => new Response('down', { status: 503, statusText: 'Service Unavailable' })) as unknown as typeof fetch;

    const [result] = await checkUptimeTargets([{ name: 'main', url: 'https://openl.app' }], {
      fetcher,
      timeoutMs: 1_000,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });
  });

  it('marks network errors as failing', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('network unavailable');
    }) as unknown as typeof fetch;

    const [result] = await checkUptimeTargets([{ name: 'docs', url: 'https://openleague.dev' }], {
      fetcher,
      timeoutMs: 1_000,
    });

    expect(result).toMatchObject({
      name: 'docs',
      ok: false,
      error: 'network unavailable',
    });
  });
});