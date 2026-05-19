import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_DOCS_PAGES_DOMAIN, DOCS_PAGES_DOMAIN_ENV } from './build-docs-pages';
import { DEFAULT_AUTH_ALLOWED_HOSTS, DEFAULT_UPTIME_TARGETS, UPTIME_CHECK_ENV_NAMES } from './check-uptime';

interface VercelConfig {
  framework?: string;
  buildCommand?: string;
  installCommand?: string;
  crons?: Array<{ path?: string; schedule?: string }>;
  headers?: Array<{ source?: string; headers?: Array<{ key?: string; value?: string }> }>;
}

interface PackageJson {
  scripts?: Record<string, string>;
}

async function readJson<T>(rootDir: string, relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), 'utf8')) as T;
}

function requireCondition(failures: string[], condition: boolean, message: string) {
  if (!condition) {
    failures.push(message);
  }
}

function hasCron(vercel: VercelConfig, cronPath: string, schedule: string): boolean {
  return Boolean(vercel.crons?.some((cron) => cron.path === cronPath && cron.schedule === schedule));
}

function hasHeader(vercel: VercelConfig, key: string): boolean {
  return Boolean(vercel.headers?.some((group) => group.headers?.some((header) => header.key?.toLowerCase() === key.toLowerCase())));
}

function hasHeaderValue(vercel: VercelConfig, key: string, valueSnippet: string): boolean {
  return Boolean(vercel.headers?.some((group) => group.headers?.some((header) => (
    header.key?.toLowerCase() === key.toLowerCase() && header.value?.includes(valueSnippet)
  ))));
}

function workflowUsesPinnedAction(workflow: string, actionName: string): boolean {
  return new RegExp(`uses:\\s+${actionName}@[a-f0-9]{40}\\b`, 'u').test(workflow);
}

function includesAll(value: string, snippets: string[]): boolean {
  return snippets.every((snippet) => value.includes(snippet));
}

export async function validateDeploymentConfig(rootDir = process.cwd()): Promise<string[]> {
  const failures: string[] = [];
  const [packageJson, vercel, envExample] = await Promise.all([
    readJson<PackageJson>(rootDir, 'package.json'),
    readJson<VercelConfig>(rootDir, 'vercel.json'),
    readFile(path.join(rootDir, '.env.example'), 'utf8'),
  ]);

  requireCondition(failures, vercel.framework === 'nextjs', 'vercel.json must declare the Next.js framework preset.');
  requireCondition(failures, vercel.buildCommand === 'bun run vercel:build', 'vercel.json buildCommand must be `bun run vercel:build`.');
  requireCondition(
    failures,
    vercel.installCommand === 'bun install --frozen-lockfile',
    'vercel.json installCommand must use `bun install --frozen-lockfile` for reproducible deploys.',
  );
  requireCondition(failures, hasCron(vercel, '/api/cron/rsvp-reminders', '0 * * * *'), 'Vercel cron must run RSVP reminders hourly.');
  requireCondition(
    failures,
    hasCron(vercel, '/api/cron/notification-batches', '0 8 * * *'),
    'Vercel cron must process notification batches daily.',
  );

  for (const header of ['Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy', 'Content-Security-Policy']) {
    requireCondition(failures, hasHeader(vercel, header), `vercel.json must configure ${header}.`);
  }

  requireCondition(
    failures,
    hasHeaderValue(vercel, 'Content-Security-Policy', "frame-ancestors 'self'"),
    'vercel.json Content-Security-Policy must explicitly restrict frame ancestors.',
  );

  for (const script of ['build', 'vercel:build', 'start', 'type-check', 'lint', 'test', 'validate-env', 'docs:build-pages', 'uptime:check']) {
    requireCondition(failures, Boolean(packageJson.scripts?.[script]), `package.json must define a ${script} script.`);
  }

  requireCondition(
    failures,
    packageJson.scripts?.['db:migrate:deploy'] === 'prisma migrate deploy --config prisma/prisma.config.ts',
    'package.json db:migrate:deploy must pass the nested Prisma config path.',
  );

  for (const envName of ['DATABASE_URL', 'NEXTAUTH_URL', 'NEXTAUTH_SECRET', 'MAILCHIMP_API_KEY', 'EMAIL_FROM', 'CRON_SECRET']) {
    requireCondition(failures, envExample.includes(`${envName}=`), `.env.example must document ${envName}.`);
  }

  for (const envName of ['OPENLEAGUE_RUN_MIGRATIONS_ON_BUILD', DOCS_PAGES_DOMAIN_ENV, ...Object.values(UPTIME_CHECK_ENV_NAMES)]) {
    requireCondition(failures, envExample.includes(envName), `.env.example must document optional ${envName}.`);
  }

  const docsWorkflowPath = path.join(rootDir, '.github', 'workflows', 'docs-pages.yml');
  const deploymentChecksWorkflowPath = path.join(rootDir, '.github', 'workflows', 'deployment-checks.yml');
  const uptimeWorkflowPath = path.join(rootDir, '.github', 'workflows', 'uptime-monitoring.yml');
  const docsBuildScriptPath = path.join(rootDir, 'scripts', 'build-docs-pages.ts');
  const uptimeCheckScriptPath = path.join(rootDir, 'scripts', 'check-uptime.ts');
  const healthRoutePath = path.join(rootDir, 'app', 'api', 'health', 'route.ts');

  requireCondition(failures, existsSync(deploymentChecksWorkflowPath), 'Deployment checks workflow is required.');
  requireCondition(failures, existsSync(docsWorkflowPath), 'GitHub Pages docs workflow is required.');
  requireCondition(failures, existsSync(docsBuildScriptPath), 'Documentation Pages build script is required.');
  requireCondition(failures, existsSync(uptimeWorkflowPath), 'Scheduled uptime monitoring workflow is required.');
  requireCondition(failures, existsSync(uptimeCheckScriptPath), 'Uptime monitoring check script is required.');
  requireCondition(failures, existsSync(healthRoutePath), 'Protected application health endpoint is required.');

  if (existsSync(docsWorkflowPath)) {
    const docsWorkflow = await readFile(docsWorkflowPath, 'utf8');
    requireCondition(
      failures,
      includesAll(docsWorkflow, ['actions/configure-pages', 'actions/upload-pages-artifact', 'actions/deploy-pages', 'bun run docs:build-pages']),
      'GitHub Pages workflow must build, upload, and deploy the documentation artifact.',
    );

    for (const actionName of ['actions/configure-pages', 'actions/upload-pages-artifact', 'actions/deploy-pages']) {
      requireCondition(
        failures,
        workflowUsesPinnedAction(docsWorkflow, actionName),
        `GitHub Pages workflow must pin ${actionName} to an immutable commit SHA.`,
      );
    }
  }

  if (existsSync(deploymentChecksWorkflowPath)) {
    const deploymentChecksWorkflow = await readFile(deploymentChecksWorkflowPath, 'utf8');
    requireCondition(
      failures,
      includesAll(deploymentChecksWorkflow, ['scripts/check-uptime.ts', '.github/workflows/uptime-monitoring.yml', 'bun run deployment:check']),
      'Deployment checks workflow must run readiness checks when uptime monitoring files change.',
    );
  }

  if (existsSync(docsBuildScriptPath)) {
    const docsBuildScript = await readFile(docsBuildScriptPath, 'utf8');
    requireCondition(failures, DEFAULT_DOCS_PAGES_DOMAIN === 'openleague.dev', 'Documentation build script must configure the openleague.dev custom domain.');
    requireCondition(failures, docsBuildScript.includes('CNAME'), 'Documentation build script must emit a CNAME file for GitHub Pages.');
  }

  if (existsSync(uptimeWorkflowPath)) {
    const uptimeWorkflow = await readFile(uptimeWorkflowPath, 'utf8');
    requireCondition(
      failures,
      includesAll(uptimeWorkflow, ['schedule:', 'bun run uptime:check', 'workflow_dispatch', 'UPTIME_CHECK_URLS', 'UPTIME_CHECK_AUTH_TARGETS', 'UPTIME_CHECK_AUTH_ALLOWED_HOSTS', 'secrets.UPTIME_CHECK_TOKEN', '/api/health']),
      'Uptime monitoring workflow must run on a schedule, support manual target overrides, and check the protected health endpoint.',
    );
  }

  requireCondition(
    failures,
    DEFAULT_UPTIME_TARGETS.some((target) => target.url === 'https://openl.app')
      && DEFAULT_UPTIME_TARGETS.some((target) => target.url === 'https://openleague.dev')
      && DEFAULT_AUTH_ALLOWED_HOSTS.has('openl.app')
      && DEFAULT_AUTH_ALLOWED_HOSTS.has('openhockey.app')
      && Object.values(UPTIME_CHECK_ENV_NAMES).includes('UPTIME_CHECK_TOKEN'),
    'Uptime monitoring script must default to public domains and support scoped authenticated checks.',
  );

  if (existsSync(healthRoutePath)) {
    const healthRoute = await readFile(healthRoutePath, 'utf8');
    requireCondition(
      failures,
      includesAll(healthRoute, ['UPTIME_CHECK_TOKEN', 'timingSafeEqual', 'SELECT 1']),
      'Protected application health endpoint must require a token and verify database readiness.',
    );
  }

  return failures;
}

async function main() {
  const failures = await validateDeploymentConfig();

  if (failures.length > 0) {
    console.error('Deployment configuration validation failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('Deployment configuration validation passed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
