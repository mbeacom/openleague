/**
 * Surface ADR `reviewBy` dates that have expired, or are about to.
 *
 * Every record carries a `reviewBy` date, and nothing in adrkit reports it:
 * `adrkit queue` only projects `proposed`-status records, so an `accepted` record
 * never appears there, and `adrkit lint` does not read the field at all. Neither
 * `adrkit lint --json` nor `adrkit graph --format json` emits `reviewBy`, so the CLI
 * cannot be post-processed into a check either. Left alone, a decision quietly
 * outlives its rationale while CI stays green -- the exact failure mode ADR-0001
 * says the corpus exists to prevent.
 *
 * This is a notification, not a gate. It runs on a schedule, never on a pull
 * request, and **always exits 0**: a change to unrelated code must never be
 * blocked because a decision happens to be due for review.
 *
 * The GitHub calls live here rather than in workflow YAML so the create /
 * update / close paths are unit-testable through an injected `fetcher`, the
 * same shape `check-uptime.ts` uses.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { type AdrRecord, CORPUS_DIR, readRecords } from './adr-corpus';

/**
 * Statuses worth nagging about. A `superseded` or `rejected` record has already
 * been retired, so re-reviewing it is noise; `draft` is not yet binding.
 */
export const ACTIONABLE_STATUSES = new Set(['accepted', 'proposed']);

/**
 * The cron runs monthly, so a strictly-expired-only check could surface a
 * decision up to ~30 days after it went stale. Warning a month ahead means the
 * review can be scheduled before it is overdue.
 */
export const DEFAULT_LEAD_TIME_DAYS = 30;

/**
 * Hidden marker identifying this workflow's own tracking issue. Kept in the
 * body rather than inferred from the title so a human retitling the issue does
 * not cause a duplicate to be opened.
 */
export const ISSUE_MARKER = '<!-- managed-by: adr-review-dates -->';

/** Applied on create so the issue can be found again without the search API. */
export const ISSUE_LABEL = 'adr-review';
export const ISSUE_LABEL_COLOR = '0075ca';
export const ISSUE_LABEL_DESCRIPTION =
  'Architecture decisions at or near their reviewBy date';

export const ISSUE_TITLE = 'Architecture decisions are due for review';

const MS_PER_DAY = 86_400_000;

export interface ReviewReport {
  /** `reviewBy` is in the past. */
  expired: AdrRecord[];
  /** `reviewBy` falls within the lead-time window. */
  approaching: AdrRecord[];
  /** Actionable record whose `reviewBy` is missing or unparseable. */
  unreadable: AdrRecord[];
  asOf: string;
  leadTimeDays: number;
}

/** A report needs reporting when any bucket has something in it. */
export function hasFindings(report: ReviewReport): boolean {
  return (
    report.expired.length > 0 ||
    report.approaching.length > 0 ||
    report.unreadable.length > 0
  );
}

/**
 * Parse a `YYYY-MM-DD` date at UTC midnight, or return `null`.
 *
 * The round-trip comparison rejects values the `Date` constructor would happily
 * roll over, such as `2027-02-31`.
 */
export function parseDateOnly(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day] = match;
  const parsed = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );
  return parsed.toISOString().slice(0, 10) === value.trim() ? parsed : null;
}

/** Sort by date first, then id, so the rendered body is stable across runs. */
function byReviewDateThenId(a: AdrRecord, b: AdrRecord): number {
  const dateOrder = (a.reviewBy ?? '').localeCompare(b.reviewBy ?? '');
  return dateOrder !== 0 ? dateOrder : (a.id ?? '').localeCompare(b.id ?? '');
}

/** Split the corpus into expired, approaching, and unreadable buckets. */
export function classifyRecords(
  records: AdrRecord[],
  asOf: Date,
  leadTimeDays: number = DEFAULT_LEAD_TIME_DAYS,
): ReviewReport {
  const expired: AdrRecord[] = [];
  const approaching: AdrRecord[] = [];
  const unreadable: AdrRecord[] = [];

  const horizon = new Date(asOf.getTime() + leadTimeDays * MS_PER_DAY);

  for (const record of records) {
    if (!ACTIONABLE_STATUSES.has((record.status ?? '').toLowerCase())) continue;

    const reviewBy = parseDateOnly(record.reviewBy);
    if (reviewBy === null) {
      // Staying silent here would reintroduce the very hole this check closes.
      unreadable.push(record);
    } else if (reviewBy.getTime() < asOf.getTime()) {
      expired.push(record);
    } else if (reviewBy.getTime() <= horizon.getTime()) {
      approaching.push(record);
    }
  }

  return {
    approaching: approaching.sort(byReviewDateThenId),
    asOf: asOf.toISOString().slice(0, 10),
    expired: expired.sort(byReviewDateThenId),
    leadTimeDays,
    unreadable: unreadable.sort(byReviewDateThenId),
  };
}

function recordLink(record: AdrRecord): string {
  const title = record.title ?? record.file;
  return `[ADR-${record.id ?? '????'}](../../${CORPUS_DIR}/${record.file}) — ${title}`;
}

function recordRows(records: AdrRecord[]): string {
  return records
    .map(
      (record) =>
        `| ${recordLink(record)} | \`${record.reviewBy ?? '—'}\` | ${record.status ?? '—'} |`,
    )
    .join('\n');
}

/**
 * Render the tracking issue body.
 *
 * Deliberately contains no "as of" date or run timestamp: the body is compared
 * against the existing issue to decide whether to PATCH, so a volatile field
 * would rewrite the issue on every run and turn a no-op into notification noise.
 */
export function renderIssueBody(report: ReviewReport): string {
  const sections: string[] = [
    ISSUE_MARKER,
    '',
    'One or more architecture decisions have reached, or are approaching, the ' +
      '`reviewBy` date in their frontmatter. This issue is opened and updated ' +
      'automatically by `.github/workflows/adr-review.yml`; it closes itself ' +
      'once every date below has been revisited.',
  ];

  if (report.expired.length > 0) {
    sections.push(
      '',
      '## Past review date',
      '',
      'These decisions are being presented as current but are past the date ' +
        'their authors set for reconsidering them.',
      '',
      '| Decision | reviewBy | Status |',
      '| --- | --- | --- |',
      recordRows(report.expired),
    );
  }

  if (report.approaching.length > 0) {
    sections.push(
      '',
      `## Due within ${report.leadTimeDays} days`,
      '',
      'Not yet overdue. Listed so the review can be scheduled before it is.',
      '',
      '| Decision | reviewBy | Status |',
      '| --- | --- | --- |',
      recordRows(report.approaching),
    );
  }

  if (report.unreadable.length > 0) {
    sections.push(
      '',
      '## Missing or unreadable `reviewBy`',
      '',
      'These records are binding but carry no date this check can read, so ' +
        'they would never be surfaced by it.',
      '',
      '| Decision | reviewBy | Status |',
      '| --- | --- | --- |',
      recordRows(report.unreadable),
    );
  }

  sections.push(
    '',
    '## What to do',
    '',
    'For each decision, either confirm it still holds and move `reviewBy` ' +
      'forward, or supersede it with a new record (`bun run adr:new`) and set ' +
      '`status: superseded` plus `supersededBy` on the old one. Do not delete ' +
      'records — the graveyard is the valuable part.',
    '',
    'Re-run on demand with the **Architecture Decision Review Dates** workflow, ' +
      'or locally with `bun run adr:review-dates`.',
  );

  return sections.join('\n');
}

/** Human-readable console output. Mirrors the issue, minus the markdown. */
export function formatConsoleReport(report: ReviewReport): string {
  const lines = [
    `ADR review dates as of ${report.asOf} (lead time ${report.leadTimeDays} days):`,
  ];

  const describe = (label: string, records: AdrRecord[]) => {
    if (records.length === 0) return;
    lines.push(`\n${label}:`);
    for (const record of records) {
      lines.push(
        `  - ADR-${record.id ?? '????'} ${record.title ?? record.file} (reviewBy ${record.reviewBy ?? 'unset'})`,
      );
    }
  };

  describe(`❌ past review date (${report.expired.length})`, report.expired);
  describe(
    `⚠️  due within ${report.leadTimeDays} days (${report.approaching.length})`,
    report.approaching,
  );
  describe(
    `⚠️  missing or unreadable reviewBy (${report.unreadable.length})`,
    report.unreadable,
  );

  if (!hasFindings(report)) {
    lines.push('✅ every actionable decision is within its review window.');
  }

  return lines.join('\n');
}

// --- GitHub upsert -------------------------------------------------------

export interface GitHubIssue {
  number: number;
  title: string;
  body?: string | null;
  /** Present when the entry is actually a pull request. */
  pull_request?: unknown;
}

export interface UpsertOptions {
  owner: string;
  repo: string;
  token: string;
  fetcher?: typeof fetch;
  apiBase?: string;
}

export type UpsertAction =
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'closed'
  | 'noop';

export interface UpsertResult {
  action: UpsertAction;
  issueNumber?: number;
}

const API_BASE = 'https://api.github.com';

async function request(
  options: UpsertOptions,
  method: string,
  route: string,
  body?: unknown,
): Promise<Response> {
  const fetcher = options.fetcher ?? fetch;
  return fetcher(`${options.apiBase ?? API_BASE}${route}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${options.token}`,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
    },
    method,
  });
}

async function assertOk(response: Response, what: string): Promise<void> {
  if (response.ok) return;
  const detail = await response.text().catch(() => '');
  throw new Error(
    `${what} failed: ${response.status} ${response.statusText} ${detail}`.trim(),
  );
}

/**
 * Create the tracking label if it is missing.
 *
 * A 422 means another run created it in between the check and the create, which
 * is the desired end state either way.
 */
export async function ensureLabel(options: UpsertOptions): Promise<void> {
  const { owner, repo } = options;
  const existing = await request(
    options,
    'GET',
    `/repos/${owner}/${repo}/labels/${encodeURIComponent(ISSUE_LABEL)}`,
  );
  if (existing.ok) return;
  if (existing.status !== 404) {
    await assertOk(existing, 'Looking up the adr-review label');
  }

  const created = await request(
    options,
    'POST',
    `/repos/${owner}/${repo}/labels`,
    {
      color: ISSUE_LABEL_COLOR,
      description: ISSUE_LABEL_DESCRIPTION,
      name: ISSUE_LABEL,
    },
  );
  if (created.status === 422) return;
  await assertOk(created, 'Creating the adr-review label');
}

/**
 * Find this workflow's own open tracking issue.
 *
 * Listing by label rather than hitting the search API is deliberate: search is
 * eventually consistent, so a query issued shortly after an issue is created
 * can miss it and open a duplicate. `GET /issues` is read-after-write
 * consistent. The marker is still what confirms identity, so a human adding the
 * label to an unrelated issue cannot hijack it.
 */
export async function findTrackingIssue(
  options: UpsertOptions,
): Promise<GitHubIssue | null> {
  const { owner, repo } = options;
  const response = await request(
    options,
    'GET',
    `/repos/${owner}/${repo}/issues?state=open&per_page=100&labels=${encodeURIComponent(ISSUE_LABEL)}`,
  );
  await assertOk(response, 'Listing open adr-review issues');

  const issues = (await response.json()) as GitHubIssue[];
  return (
    issues.find(
      // `GET /issues` returns pull requests too; they are never our issue.
      (issue) => !issue.pull_request && (issue.body ?? '').includes(ISSUE_MARKER),
    ) ?? null
  );
}

/**
 * Open, update, or close the single tracking issue so it always reflects the
 * current report. Never opens a second issue, and never leaves a stale one open
 * after the dates are bumped.
 */
export async function upsertTrackingIssue(
  report: ReviewReport,
  options: UpsertOptions,
): Promise<UpsertResult> {
  const { owner, repo } = options;
  const existing = await findTrackingIssue(options);

  if (!hasFindings(report)) {
    if (!existing) return { action: 'noop' };

    await assertOk(
      await request(
        options,
        'POST',
        `/repos/${owner}/${repo}/issues/${existing.number}/comments`,
        {
          body:
            'Every architecture decision is back inside its review window. ' +
            'Closing automatically.',
        },
      ),
      'Commenting before close',
    );
    await assertOk(
      await request(
        options,
        'PATCH',
        `/repos/${owner}/${repo}/issues/${existing.number}`,
        { state: 'closed', state_reason: 'completed' },
      ),
      'Closing the tracking issue',
    );
    return { action: 'closed', issueNumber: existing.number };
  }

  const body = renderIssueBody(report);

  if (existing) {
    // Skip the write when nothing changed, so a monthly no-op run does not
    // bump the issue and re-notify every subscriber.
    if ((existing.body ?? '') === body && existing.title === ISSUE_TITLE) {
      return { action: 'unchanged', issueNumber: existing.number };
    }
    await assertOk(
      await request(
        options,
        'PATCH',
        `/repos/${owner}/${repo}/issues/${existing.number}`,
        { body, title: ISSUE_TITLE },
      ),
      'Updating the tracking issue',
    );
    return { action: 'updated', issueNumber: existing.number };
  }

  await ensureLabel(options);
  const created = await request(
    options,
    'POST',
    `/repos/${owner}/${repo}/issues`,
    { body, labels: [ISSUE_LABEL], title: ISSUE_TITLE },
  );
  await assertOk(created, 'Creating the tracking issue');
  const issue = (await created.json()) as GitHubIssue;
  return { action: 'created', issueNumber: issue.number };
}

// --- CLI -----------------------------------------------------------------

export interface CliOptions {
  asOf: Date;
  leadTimeDays: number;
  dryRun: boolean;
}

export function parseArgs(argv: string[], now: Date = new Date()): CliOptions {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };

  const asOfRaw = value('--as-of');
  const asOf = asOfRaw
    ? parseDateOnly(asOfRaw)
    : parseDateOnly(now.toISOString().slice(0, 10));
  if (asOf === null) {
    throw new Error(`--as-of must be a valid YYYY-MM-DD date, got "${asOfRaw}"`);
  }

  const leadRaw = value('--lead-days');
  const leadTimeDays = leadRaw === undefined ? DEFAULT_LEAD_TIME_DAYS : Number(leadRaw);
  if (!Number.isInteger(leadTimeDays) || leadTimeDays < 0) {
    throw new Error(`--lead-days must be a non-negative integer, got "${leadRaw}"`);
  }

  return { asOf, dryRun: argv.includes('--dry-run'), leadTimeDays };
}

async function main(): Promise<void> {
  const { asOf, dryRun, leadTimeDays } = parseArgs(process.argv.slice(2));
  const corpusDir = path.join(
    path.resolve(import.meta.dirname, '..'),
    CORPUS_DIR,
  );

  const report = classifyRecords(readRecords(corpusDir), asOf, leadTimeDays);
  console.log(formatConsoleReport(report));

  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;

  if (dryRun || !token || !repository) {
    console.log(
      `\nNot syncing a tracking issue (${
        dryRun
          ? '--dry-run'
          : !token
            ? 'GITHUB_TOKEN is unset'
            : 'GITHUB_REPOSITORY is unset'
      }).`,
    );
    if (hasFindings(report)) {
      console.log(`\n--- issue body preview ---\n${renderIssueBody(report)}`);
    }
    return;
  }

  const [owner, repo] = repository.split('/');
  const result = await upsertTrackingIssue(report, { owner, repo, token });
  console.log(
    `\nTracking issue ${result.action}${
      result.issueNumber ? ` (#${result.issueNumber})` : ''
    }.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // Report loudly, but never fail: this is a notification, and a GitHub API
    // hiccup must not turn into a red X on an unrelated schedule.
    console.error('ADR review-date check could not complete:', error);
  });
}
