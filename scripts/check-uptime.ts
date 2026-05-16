import { pathToFileURL } from 'node:url';

export interface UptimeTarget {
  name: string;
  url: string;
}

export interface UptimeCheckResult extends UptimeTarget {
  ok: boolean;
  status?: number;
  statusText?: string;
  durationMs: number;
  checkedAt: string;
  error?: string;
}

export interface UptimeCheckOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export const DEFAULT_UPTIME_TIMEOUT_MS = 10_000;

export const DEFAULT_UPTIME_TARGETS: UptimeTarget[] = [
  { name: 'main', url: 'https://openl.app' },
  { name: 'docs', url: 'https://openleague.dev' },
];

function normalizeTargetName(value: string, index: number): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  return normalized || `target-${index + 1}`;
}

function normalizeTargetUrl(value: string): string {
  const parsed = new URL(value.trim());

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Uptime target must use http or https: ${value}`);
  }

  return parsed.toString().replace(/\/$/u, '');
}

export function parseUptimeTargets(value = process.env.UPTIME_CHECK_URLS): UptimeTarget[] {
  if (!value?.trim()) {
    return [...DEFAULT_UPTIME_TARGETS];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const separatorIndex = entry.indexOf('=');

      if (separatorIndex === -1) {
        return {
          name: `target-${index + 1}`,
          url: normalizeTargetUrl(entry),
        };
      }

      return {
        name: normalizeTargetName(entry.slice(0, separatorIndex), index),
        url: normalizeTargetUrl(entry.slice(separatorIndex + 1)),
      };
    });
}

export function parseTimeoutMs(value = process.env.UPTIME_CHECK_TIMEOUT_MS): number {
  const timeoutMs = Number.parseInt(value ?? '', 10);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_UPTIME_TIMEOUT_MS;
}

export async function checkUptimeTarget(
  target: UptimeTarget,
  options: UptimeCheckOptions = {},
): Promise<UptimeCheckResult> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_UPTIME_TIMEOUT_MS;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(target.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'OpenLeague-Uptime-Monitor/1.0',
      },
    });

    const durationMs = Date.now() - startedAt;

    return {
      ...target,
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      statusText: response.statusText,
      durationMs,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ...target,
      ok: false,
      durationMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function checkUptimeTargets(
  targets: UptimeTarget[],
  options: UptimeCheckOptions = {},
): Promise<UptimeCheckResult[]> {
  return Promise.all(targets.map((target) => checkUptimeTarget(target, options)));
}

export function formatUptimeResult(result: UptimeCheckResult): string {
  const status = result.status ? `${result.status} ${result.statusText ?? ''}`.trim() : result.error ?? 'request failed';
  const prefix = result.ok ? '✅' : '❌';
  return `${prefix} ${result.name} ${result.url} - ${status} (${result.durationMs}ms)`;
}

async function main() {
  const targets = parseUptimeTargets();
  const results = await checkUptimeTargets(targets, { timeoutMs: parseTimeoutMs() });

  for (const result of results) {
    console.log(formatUptimeResult(result));
  }

  if (results.some((result) => !result.ok)) {
    console.error('One or more uptime checks failed.');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}