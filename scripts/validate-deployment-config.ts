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
  bunVersion?: string;
  crons?: Array<{ path?: string; schedule?: string }>;
  headers?: Array<{ source?: string; headers?: Array<{ key?: string; value?: string }> }>;
}

interface PackageJson {
  scripts?: Record<string, string>;
}

const PRISMA_CONFIG_PATH = 'prisma/prisma.config.ts';
const CI_DATABASE_URL_FALLBACK = "DATABASE_URL: ${{ secrets.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/openleague_ci' }}";

const REQUIRED_PRISMA_CONFIG_SCRIPTS: Record<string, string> = {
  postinstall: `prisma generate --config ${PRISMA_CONFIG_PATH}`,
  'db:studio': `prisma studio --config ${PRISMA_CONFIG_PATH}`,
  'db:push': `prisma db push --config ${PRISMA_CONFIG_PATH}`,
  'db:migrate': `prisma migrate dev --config ${PRISMA_CONFIG_PATH}`,
  'db:migrate:deploy': `prisma migrate deploy --config ${PRISMA_CONFIG_PATH}`,
  'db:migrate:reset': `prisma migrate reset --config ${PRISMA_CONFIG_PATH}`,
  'db:generate': `prisma generate --config ${PRISMA_CONFIG_PATH}`,
};

const REQUIRED_BUN_RUNTIME_SCRIPTS: Record<string, string> = {
  dev: 'bun --bun next dev --turbopack',
  build: 'next build',
  'vercel:build': 'bun scripts/vercel-build.mjs',
  start: 'bun --bun next start',
};

const REQUIRED_GENERAL_SCRIPTS = ['type-check', 'lint', 'test', 'validate-env', 'docs:build-pages', 'uptime:check'];

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

function hasCiDatabaseUrlFallback(workflow: string): boolean {
  return workflow.includes(CI_DATABASE_URL_FALLBACK);
}

/** The planner's cloud connector variables (storage connectors spec R9) and where the Pages workflow reads each from. */
export const PLANNER_CLOUD_ENV: ReadonlyArray<{ name: string; source: 'vars' | 'secrets' }> = [
  { name: 'OPENLEAGUE_GOOGLE_CLIENT_ID', source: 'vars' },
  { name: 'OPENLEAGUE_GOOGLE_APP_ID', source: 'vars' },
  { name: 'OPENLEAGUE_GOOGLE_API_KEY', source: 'secrets' },
  { name: 'OPENLEAGUE_MICROSOFT_CLIENT_ID', source: 'vars' },
];

const PLANNER_CLOUD_STEPS = ['Build the static planner', 'Check the static planner bundle'];

/** A job's text, from its `  <name>:` line to the next top-level job. */
function workflowJob(workflow: string, job: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex((line) => line === `  ${job}:`);
  if (start < 0) return '';
  const end = lines.findIndex((line, index) => index > start && /^ {2}\S/.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

/** A job's steps, each from its `- name:` line, keyed by name. */
function workflowSteps(job: string): Map<string, string> {
  const steps = new Map<string, string>();
  for (const chunk of job.split(/\n(?= {6}- name: )/).slice(1)) {
    const name = /^ {6}- name: (.+)$/m.exec(chunk)?.[1]?.trim();
    if (name) steps.set(name, chunk);
  }
  return steps;
}

/**
 * The Pages workflow's wiring of the planner's cloud connector identifiers:
 * the build job reads the github-pages environment (whose variables and
 * secret only a job naming it can see) without recording a deployment, and
 * passes each value to the planner's build and bundle check only.
 */
export function docsWorkflowCloudProblems(workflow: string): string[] {
  const problems: string[] = [];
  const build = workflowJob(workflow, 'build');
  if (!/\n {4}environment:\n {6}name: github-pages\n {6}deployment: false\n/.test(`${build}\n`)) {
    problems.push('GitHub Pages build job must name the github-pages environment with deployment: false, so it can read the planner\'s cloud connector variables without recording a deployment.');
  }
  const steps = workflowSteps(build);
  for (const stepName of PLANNER_CLOUD_STEPS) {
    const step = steps.get(stepName);
    if (!step) {
      problems.push(`GitHub Pages build job must have a "${stepName}" step.`);
      continue;
    }
    for (const { name, source } of PLANNER_CLOUD_ENV) {
      if (!step.includes(`${name}: \${{ ${source}.${name} }}`)) {
        problems.push(`GitHub Pages "${stepName}" step must set ${name} from ${source}.${name}.`);
      }
    }
  }
  // Only those steps see the values: never the job's env, nor any other step.
  for (const { name } of PLANNER_CLOUD_ENV) {
    const outside = [...steps].filter(([stepName, step]) => !PLANNER_CLOUD_STEPS.includes(stepName) && step.includes(name)).map(([stepName]) => stepName);
    const beforeSteps = build.split(/\n {4}steps:\n/)[0] ?? '';
    if (beforeSteps.includes(name)) outside.unshift('the job env');
    if (outside.length > 0) problems.push(`${name} must reach only the planner build and check steps, not ${outside.join(', ')}.`);
  }
  return problems;
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
  requireCondition(failures, vercel.bunVersion === '1.x', 'vercel.json must set bunVersion to `1.x` so Vercel runs functions with Bun.');
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

  for (const script of REQUIRED_GENERAL_SCRIPTS) {
    requireCondition(failures, Boolean(packageJson.scripts?.[script]), `package.json must define a ${script} script.`);
  }

  for (const [scriptName, expectedCommand] of Object.entries(REQUIRED_BUN_RUNTIME_SCRIPTS)) {
    const actualCommand = packageJson.scripts?.[scriptName];

    requireCondition(failures, Boolean(actualCommand), `package.json must define a ${scriptName} script.`);
    if (actualCommand) {
      requireCondition(
        failures,
        actualCommand === expectedCommand,
        `package.json ${scriptName} must be \`${expectedCommand}\` so Next.js commands run under the Bun runtime.`,
      );
    }
  }

  for (const [scriptName, expectedCommand] of Object.entries(REQUIRED_PRISMA_CONFIG_SCRIPTS)) {
    const actualCommand = packageJson.scripts?.[scriptName];

    requireCondition(failures, Boolean(actualCommand), `package.json must define a ${scriptName} script.`);
    if (actualCommand) {
      requireCondition(
        failures,
        actualCommand === expectedCommand,
        `package.json ${scriptName} must be \`${expectedCommand}\` so Prisma uses the nested config at ${PRISMA_CONFIG_PATH}.`,
      );
    }
  }

  for (const envName of ['DATABASE_URL', 'NEXTAUTH_URL', 'NEXTAUTH_SECRET', 'EMAIL_PROVIDER', 'MAILCHIMP_API_KEY', 'EMAIL_FROM', 'CRON_SECRET']) {
    requireCondition(failures, envExample.includes(`${envName}=`), `.env.example must document ${envName}.`);
  }

  for (const envName of ['OPENLEAGUE_RUN_MIGRATIONS_ON_BUILD', DOCS_PAGES_DOMAIN_ENV, ...Object.values(UPTIME_CHECK_ENV_NAMES)]) {
    requireCondition(failures, envExample.includes(envName), `.env.example must document optional ${envName}.`);
  }

  const docsWorkflowPath = path.join(rootDir, '.github', 'workflows', 'docs-pages.yml');
  const deploymentChecksWorkflowPath = path.join(rootDir, '.github', 'workflows', 'deployment-checks.yml');
  const uptimeWorkflowPath = path.join(rootDir, '.github', 'workflows', 'uptime-monitoring.yml');
  const releaseWorkflowPath = path.join(rootDir, '.github', 'workflows', 'release.yml');
  const tagReleaseWorkflowPath = path.join(rootDir, '.github', 'workflows', 'tag-release.yml');
  const docsBuildScriptPath = path.join(rootDir, 'scripts', 'build-docs-pages.ts');
  const uptimeCheckScriptPath = path.join(rootDir, 'scripts', 'check-uptime.ts');
  const healthRoutePath = path.join(rootDir, 'app', 'api', 'health', 'route.ts');
  const proxyPath = path.join(rootDir, 'proxy.ts');

  requireCondition(failures, existsSync(deploymentChecksWorkflowPath), 'Deployment checks workflow is required.');
  requireCondition(failures, existsSync(docsWorkflowPath), 'GitHub Pages docs workflow is required.');
  requireCondition(failures, existsSync(releaseWorkflowPath), 'Release workflow is required.');
  requireCondition(failures, existsSync(tagReleaseWorkflowPath), 'Tag release workflow is required.');
  requireCondition(failures, existsSync(docsBuildScriptPath), 'Documentation Pages build script is required.');
  requireCondition(failures, existsSync(uptimeWorkflowPath), 'Scheduled uptime monitoring workflow is required.');
  requireCondition(failures, existsSync(uptimeCheckScriptPath), 'Uptime monitoring check script is required.');
  requireCondition(failures, existsSync(healthRoutePath), 'Protected application health endpoint is required.');
  requireCondition(failures, existsSync(proxyPath), 'Next.js proxy.ts is required for security headers, HTTPS enforcement, and rate limiting.');

  for (const workflowPath of [docsWorkflowPath, deploymentChecksWorkflowPath, uptimeWorkflowPath, releaseWorkflowPath, tagReleaseWorkflowPath]) {
    if (existsSync(workflowPath)) {
      const workflow = await readFile(workflowPath, 'utf8');
      requireCondition(
        failures,
        hasCiDatabaseUrlFallback(workflow),
        `${path.relative(rootDir, workflowPath)} must provide DATABASE_URL during install so Prisma postinstall generation works in CI.`,
      );
    }
  }

  if (existsSync(docsWorkflowPath)) {
    const docsWorkflow = await readFile(docsWorkflowPath, 'utf8');
    requireCondition(
      failures,
      includesAll(docsWorkflow, ['actions/configure-pages', 'actions/upload-pages-artifact', 'actions/deploy-pages', 'bun run docs:build-pages']),
      'GitHub Pages workflow must build, upload, and deploy the documentation artifact.',
    );

    failures.push(...docsWorkflowCloudProblems(docsWorkflow));

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

  if (existsSync(proxyPath)) {
    const proxySource = await readFile(proxyPath, 'utf8');
    requireCondition(failures, includesAll(proxySource, ['export const config', 'matcher']), 'proxy.ts must export matcher config for route coverage.');
    requireCondition(
      failures,
      !/\bruntime\s*[:=]/u.test(proxySource),
      'proxy.ts must not export a runtime config; Next.js 16 proxy always runs on Node.js and route segment runtime config breaks builds.',
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
