/**
 * Tests for `scripts/check-adr-review-dates.ts`.
 *
 * These stand in for a live `workflow_dispatch` run: GitHub only exposes
 * `workflow_dispatch` for workflows present on the default branch, so the
 * create / update / close paths cannot be exercised against the real API from a
 * pull request branch. The injected fetcher covers them instead.
 */
import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { type AdrRecord, parseFrontmatter, readRecords } from '@/scripts/adr-corpus';
import {
  ACTIONABLE_STATUSES,
  DEFAULT_LEAD_TIME_DAYS,
  ISSUE_LABEL,
  ISSUE_MARKER,
  ISSUE_TITLE,
  classifyRecords,
  findTrackingIssue,
  formatConsoleReport,
  hasFindings,
  parseArgs,
  parseDateOnly,
  renderIssueBody,
  upsertTrackingIssue,
} from '@/scripts/check-adr-review-dates';

const UTC = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function record(
  overrides: Partial<AdrRecord> & { id: string },
): AdrRecord {
  return {
    file: `${overrides.id}-fixture.md`,
    reviewBy: '2027-08-09',
    status: 'accepted',
    title: `Decision ${overrides.id}`,
    ...overrides,
  };
}

// --- frontmatter ---------------------------------------------------------

describe('parseFrontmatter', () => {
  it('reads the fields the checks depend on', () => {
    const parsed = parseFrontmatter(
      ['---', 'id: "0007"', 'title: A decision', 'status: accepted', 'reviewBy: 2027-08-09', '---', '', '# body'].join('\n'),
    );
    expect(parsed).toEqual({
      id: '0007',
      reviewBy: '2027-08-09',
      status: 'accepted',
      title: 'A decision',
    });
  });

  it('is not fooled by nested keys under affects/provenance/review', () => {
    // The reason this uses a real YAML parser instead of a per-line regex.
    const parsed = parseFrontmatter(
      [
        '---',
        'id: "0007"',
        'status: accepted',
        'affects:',
        '  - type: path',
        '    pattern: "lib/**"',
        '    status: ignored-nested-value',
        '    reviewBy: 1999-01-01',
        'review:',
        '  tier: auto',
        'reviewBy: 2030-01-01',
        '---',
      ].join('\n'),
    );
    expect(parsed.reviewBy).toBe('2030-01-01');
    expect(parsed.status).toBe('accepted');
  });

  it('normalises an unquoted date, which YAML resolves to a Date', () => {
    expect(parseFrontmatter('---\nreviewBy: 2027-08-09\n---').reviewBy).toBe(
      '2027-08-09',
    );
  });

  it('normalises a numeric id back to a string', () => {
    expect(parseFrontmatter('---\nid: 0007\n---').id).toBe('7');
  });

  it('returns nothing for a file with no frontmatter', () => {
    expect(parseFrontmatter('# just a heading\n')).toEqual({});
  });

  it('returns nothing rather than throwing on unparseable YAML', () => {
    expect(parseFrontmatter('---\n\tid: "bad\n  - [\n---')).toEqual({});
  });

  it('ignores a --- separator that appears in the body', () => {
    const parsed = parseFrontmatter(
      '---\nreviewBy: 2027-08-09\n---\n\n# Title\n\n---\n\nreviewBy: 1999-01-01\n',
    );
    expect(parsed.reviewBy).toBe('2027-08-09');
  });
});

describe('readRecords', () => {
  it('excludes README.md and 0000-template.md', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'adr-records-'));
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'README.md'), '---\nstatus: accepted\n---', 'utf8');
      writeFileSync(
        path.join(dir, '0000-template.md'),
        '---\nstatus: draft\nreviewBy: 1999-01-01\n---',
        'utf8',
      );
      writeFileSync(
        path.join(dir, '0001-real.md'),
        '---\nid: "0001"\nstatus: accepted\nreviewBy: 2027-08-09\n---',
        'utf8',
      );
      writeFileSync(path.join(dir, 'notes.txt'), 'ignored', 'utf8');

      const records = readRecords(dir);
      expect(records.map((r) => r.file)).toEqual(['0001-real.md']);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it('returns an empty list when the directory is missing', () => {
    expect(readRecords(path.join(tmpdir(), 'definitely-not-here-9271'))).toEqual([]);
  });
});

// --- dates and classification -------------------------------------------

describe('parseDateOnly', () => {
  it('parses a valid date at UTC midnight', () => {
    expect(parseDateOnly('2027-08-09')?.toISOString()).toBe('2027-08-09T00:00:00.000Z');
  });

  it.each(['2027-02-31', '2027-13-01', 'not-a-date', '2027-8-9', '', undefined])(
    'rejects %s',
    (value) => {
      expect(parseDateOnly(value as string | undefined)).toBeNull();
    },
  );
});

describe('classifyRecords', () => {
  const asOf = UTC('2027-08-09');

  it('treats a date strictly in the past as expired', () => {
    const report = classifyRecords([record({ id: '0001', reviewBy: '2027-08-08' })], asOf);
    expect(report.expired.map((r) => r.id)).toEqual(['0001']);
    expect(report.approaching).toEqual([]);
  });

  it('treats the boundary date itself as not yet expired', () => {
    const report = classifyRecords([record({ id: '0001', reviewBy: '2027-08-09' })], asOf);
    expect(report.expired).toEqual([]);
    expect(report.approaching.map((r) => r.id)).toEqual(['0001']);
  });

  it('includes the last day of the lead-time window', () => {
    const report = classifyRecords([record({ id: '0001', reviewBy: '2027-09-08' })], asOf);
    expect(report.approaching.map((r) => r.id)).toEqual(['0001']);
  });

  it('excludes the day after the lead-time window', () => {
    const report = classifyRecords([record({ id: '0001', reviewBy: '2027-09-09' })], asOf);
    expect(hasFindings(report)).toBe(false);
  });

  it.each(['superseded', 'rejected', 'draft', 'deprecated'])(
    'ignores %s records even when long expired',
    (status) => {
      const report = classifyRecords(
        [record({ id: '0001', reviewBy: '1999-01-01', status })],
        asOf,
      );
      expect(hasFindings(report)).toBe(false);
    },
  );

  it.each([...ACTIONABLE_STATUSES])('reports %s records', (status) => {
    const report = classifyRecords(
      [record({ id: '0001', reviewBy: '1999-01-01', status })],
      asOf,
    );
    expect(report.expired).toHaveLength(1);
  });

  it('matches the status case-insensitively', () => {
    const report = classifyRecords(
      [record({ id: '0001', reviewBy: '1999-01-01', status: 'Accepted' })],
      asOf,
    );
    expect(report.expired).toHaveLength(1);
  });

  it('surfaces an actionable record whose reviewBy is missing or unreadable', () => {
    const report = classifyRecords(
      [
        record({ id: '0001', reviewBy: undefined }),
        record({ id: '0002', reviewBy: 'sometime next year' }),
      ],
      asOf,
    );
    expect(report.unreadable.map((r) => r.id)).toEqual(['0001', '0002']);
    expect(hasFindings(report)).toBe(true);
  });

  it('does not chase a missing reviewBy on a retired record', () => {
    const report = classifyRecords(
      [record({ id: '0001', reviewBy: undefined, status: 'superseded' })],
      asOf,
    );
    expect(hasFindings(report)).toBe(false);
  });

  it('honours a custom lead time', () => {
    const report = classifyRecords(
      [record({ id: '0001', reviewBy: '2027-10-01' })],
      asOf,
      120,
    );
    expect(report.approaching).toHaveLength(1);
  });

  it('sorts by review date then id so the body is stable', () => {
    const report = classifyRecords(
      [
        record({ id: '0003', reviewBy: '1999-01-02' }),
        record({ id: '0001', reviewBy: '1999-01-03' }),
        record({ id: '0002', reviewBy: '1999-01-02' }),
      ],
      asOf,
    );
    expect(report.expired.map((r) => r.id)).toEqual(['0002', '0003', '0001']);
  });

  it('reports nothing for a clean corpus', () => {
    const report = classifyRecords([record({ id: '0001', reviewBy: '2030-01-01' })], asOf);
    expect(hasFindings(report)).toBe(false);
    expect(formatConsoleReport(report)).toContain('within its review window');
  });
});

// --- issue body ----------------------------------------------------------

describe('renderIssueBody', () => {
  const asOf = UTC('2027-08-09');

  it('carries the marker used to find the issue again', () => {
    const body = renderIssueBody(
      classifyRecords([record({ id: '0001', reviewBy: '1999-01-01' })], asOf),
    );
    expect(body).toContain(ISSUE_MARKER);
  });

  it('separates expired records from approaching ones', () => {
    const body = renderIssueBody(
      classifyRecords(
        [
          record({ id: '0001', reviewBy: '1999-01-01', title: 'Long overdue' }),
          record({ id: '0002', reviewBy: '2027-08-20', title: 'Coming up' }),
        ],
        asOf,
      ),
    );
    const expiredAt = body.indexOf('## Past review date');
    const approachingAt = body.indexOf(`## Due within ${DEFAULT_LEAD_TIME_DAYS} days`);
    expect(expiredAt).toBeGreaterThan(-1);
    expect(approachingAt).toBeGreaterThan(expiredAt);
    expect(body.slice(expiredAt, approachingAt)).toContain('Long overdue');
    expect(body.slice(approachingAt)).toContain('Coming up');
  });

  it('omits a section that has no records', () => {
    const body = renderIssueBody(
      classifyRecords([record({ id: '0001', reviewBy: '1999-01-01' })], asOf),
    );
    expect(body).not.toContain('Due within');
    expect(body).not.toContain('Missing or unreadable');
  });

  it('contains no volatile date, so an unchanged corpus renders identically', () => {
    // If the body embedded "as of <today>" every scheduled run would PATCH the
    // issue and re-notify subscribers for no reason.
    const records = [record({ id: '0001', reviewBy: '1999-01-01' })];
    const first = renderIssueBody(classifyRecords(records, UTC('2027-08-09')));
    const second = renderIssueBody(classifyRecords(records, UTC('2027-11-30')));
    expect(first).toBe(second);
  });

  it('links each record relative to the issue', () => {
    const body = renderIssueBody(
      classifyRecords(
        [record({ file: '0001-a-decision.md', id: '0001', reviewBy: '1999-01-01' })],
        asOf,
      ),
    );
    expect(body).toContain('docs/adr/0001-a-decision.md');
  });
});

// --- GitHub upsert -------------------------------------------------------

interface StubCall {
  method: string;
  url: string;
  body: Record<string, unknown> | undefined;
}

function stubGitHub(routes: {
  issues?: unknown[];
  labelExists?: boolean;
  createdNumber?: number;
}) {
  const calls: StubCall[] = [];
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status });

  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    const method = init?.method ?? 'GET';
    calls.push({
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
      method,
      url: href,
    });

    if (method === 'GET' && href.includes('/issues?')) return json(routes.issues ?? []);
    if (method === 'GET' && href.includes('/labels/')) {
      return routes.labelExists === false
        ? json({ message: 'Not Found' }, 404)
        : json({ name: ISSUE_LABEL });
    }
    if (method === 'POST' && href.endsWith('/labels')) return json({ name: ISSUE_LABEL }, 201);
    if (method === 'POST' && href.endsWith('/issues')) {
      return json({ number: routes.createdNumber ?? 42 }, 201);
    }
    return json({});
  });

  return { calls, fetcher: fetcher as unknown as typeof fetch };
}

const options = (fetcher: typeof fetch) => ({
  fetcher,
  owner: 'mbeacom',
  repo: 'openleague',
  token: 'test-token',
});

const expiredReport = () =>
  classifyRecords([record({ id: '0001', reviewBy: '1999-01-01' })], UTC('2027-08-09'));

const cleanReport = () =>
  classifyRecords([record({ id: '0001', reviewBy: '2030-01-01' })], UTC('2027-08-09'));

describe('upsertTrackingIssue', () => {
  it('creates one labelled issue when none exists', async () => {
    const { calls, fetcher } = stubGitHub({ issues: [] });
    const result = await upsertTrackingIssue(expiredReport(), options(fetcher));

    expect(result).toEqual({ action: 'created', issueNumber: 42 });
    const created = calls.find((c) => c.method === 'POST' && c.url.endsWith('/issues'));
    expect(created?.body).toMatchObject({ labels: [ISSUE_LABEL], title: ISSUE_TITLE });
    expect(String(created?.body?.body)).toContain(ISSUE_MARKER);
  });

  it('updates the existing issue instead of opening a second one', async () => {
    const { calls, fetcher } = stubGitHub({
      issues: [{ body: `${ISSUE_MARKER}\n\nstale content`, number: 7, title: ISSUE_TITLE }],
    });
    const result = await upsertTrackingIssue(expiredReport(), options(fetcher));

    expect(result).toEqual({ action: 'updated', issueNumber: 7 });
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/issues'))).toBe(false);
    expect(calls.some((c) => c.method === 'PATCH' && c.url.endsWith('/issues/7'))).toBe(true);
  });

  it('writes nothing at all when the rendered body is unchanged', async () => {
    const report = expiredReport();
    const { calls, fetcher } = stubGitHub({
      issues: [{ body: renderIssueBody(report), number: 7, title: ISSUE_TITLE }],
    });
    const result = await upsertTrackingIssue(report, options(fetcher));

    expect(result).toEqual({ action: 'unchanged', issueNumber: 7 });
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('closes the issue once every date is back inside its window', async () => {
    const { calls, fetcher } = stubGitHub({
      issues: [{ body: `${ISSUE_MARKER}\n\nold`, number: 7, title: ISSUE_TITLE }],
    });
    const result = await upsertTrackingIssue(cleanReport(), options(fetcher));

    expect(result).toEqual({ action: 'closed', issueNumber: 7 });
    expect(calls.some((c) => c.url.endsWith('/issues/7/comments'))).toBe(true);
    expect(
      calls.find((c) => c.method === 'PATCH' && c.url.endsWith('/issues/7'))?.body,
    ).toMatchObject({ state: 'closed' });
  });

  it('does nothing when the corpus is clean and no issue is open', async () => {
    const { calls, fetcher } = stubGitHub({ issues: [] });
    const result = await upsertTrackingIssue(cleanReport(), options(fetcher));

    expect(result).toEqual({ action: 'noop' });
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('creates the label when it does not exist yet', async () => {
    const { calls, fetcher } = stubGitHub({ issues: [], labelExists: false });
    await upsertTrackingIssue(expiredReport(), options(fetcher));
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/labels'))).toBe(true);
  });

  it('does not recreate a label that already exists', async () => {
    const { calls, fetcher } = stubGitHub({ issues: [], labelExists: true });
    await upsertTrackingIssue(expiredReport(), options(fetcher));
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/labels'))).toBe(false);
  });

  it('surfaces an API failure rather than silently opening a duplicate', async () => {
    const fetcher = vi.fn(async () =>
      new Response('boom', { status: 500, statusText: 'Server Error' }),
    ) as unknown as typeof fetch;
    await expect(upsertTrackingIssue(expiredReport(), options(fetcher))).rejects.toThrow(
      /Listing open adr-review issues failed: 500/,
    );
  });
});

describe('findTrackingIssue', () => {
  it('ignores a labelled issue that lacks the marker', async () => {
    const { fetcher } = stubGitHub({
      issues: [{ body: 'a human opened this', number: 3, title: 'Unrelated' }],
    });
    expect(await findTrackingIssue(options(fetcher))).toBeNull();
  });

  it('ignores a pull request returned by the issues endpoint', async () => {
    // GET /issues returns PRs too; treating one as the tracking issue would
    // make the workflow PATCH a pull request body.
    const { fetcher } = stubGitHub({
      issues: [{ body: ISSUE_MARKER, number: 3, pull_request: { url: 'x' }, title: 'PR' }],
    });
    expect(await findTrackingIssue(options(fetcher))).toBeNull();
  });

  it('matches on the marker even when the title was edited by a human', async () => {
    const { fetcher } = stubGitHub({
      issues: [{ body: `${ISSUE_MARKER}\n\nx`, number: 3, title: 'Renamed by hand' }],
    });
    expect((await findTrackingIssue(options(fetcher)))?.number).toBe(3);
  });

  it('requests only open issues carrying the tracking label', async () => {
    const { calls, fetcher } = stubGitHub({ issues: [] });
    await findTrackingIssue(options(fetcher));
    expect(calls[0].url).toContain('state=open');
    expect(calls[0].url).toContain(`labels=${ISSUE_LABEL}`);
  });
});

// --- CLI -----------------------------------------------------------------

describe('parseArgs', () => {
  it('defaults to today and the standard lead time', () => {
    const parsed = parseArgs([], UTC('2027-08-09'));
    expect(parsed.asOf.toISOString().slice(0, 10)).toBe('2027-08-09');
    expect(parsed.leadTimeDays).toBe(DEFAULT_LEAD_TIME_DAYS);
    expect(parsed.dryRun).toBe(false);
  });

  it('accepts --as-of, --lead-days and --dry-run', () => {
    const parsed = parseArgs(['--as-of', '2028-01-01', '--lead-days', '7', '--dry-run']);
    expect(parsed.asOf.toISOString().slice(0, 10)).toBe('2028-01-01');
    expect(parsed.leadTimeDays).toBe(7);
    expect(parsed.dryRun).toBe(true);
  });

  it.each(['nonsense', '2027-02-31'])('rejects --as-of %s', (value) => {
    expect(() => parseArgs(['--as-of', value])).toThrow(/valid YYYY-MM-DD/);
  });

  it.each(['-1', 'abc', '1.5'])('rejects --lead-days %s', (value) => {
    expect(() => parseArgs(['--lead-days', value])).toThrow(/non-negative integer/);
  });
});

// --- workflow wiring -----------------------------------------------------

describe('adr-review workflow', () => {
  const workflowPath = path.join(process.cwd(), '.github/workflows/adr-review.yml');
  const workflow = readFileSync(workflowPath, 'utf8');

  interface WorkflowStep {
    uses?: string;
    run?: string;
    env?: Record<string, string>;
  }
  interface WorkflowJob {
    permissions?: Record<string, string>;
    steps?: WorkflowStep[];
  }

  const doc = parseYaml(workflow) as Record<string, unknown> & {
    permissions?: Record<string, string>;
    jobs?: Record<string, WorkflowJob>;
  };
  // YAML 1.1 resolves a bare `on:` key to boolean true; the 1.2 core schema
  // keeps it a string. Accept whichever the parser produced.
  const triggers = (doc.on ?? (doc as Record<string, unknown>)['true']) as Record<
    string,
    unknown
  >;
  const jobs = Object.values(doc.jobs ?? {});
  const steps = jobs.flatMap((job) => job.steps ?? []);

  it('never runs on a pull request, so it cannot block one', () => {
    expect(Object.keys(triggers)).not.toContain('pull_request');
    expect(Object.keys(triggers)).not.toContain('pull_request_target');
  });

  it('runs monthly and can be dispatched on demand', () => {
    expect(triggers.schedule).toEqual([{ cron: '0 9 1 * *' }]);
    expect(triggers).toHaveProperty('workflow_dispatch');
  });

  it('requests issues: write and nothing else beyond read', () => {
    expect(doc.permissions).toEqual({ contents: 'read' });
    for (const job of jobs) {
      expect(job.permissions).toEqual({ contents: 'read', issues: 'write' });
    }
  });

  it('pins every action to a full commit SHA with a version comment', () => {
    const lines = workflow.split('\n');
    const uses = steps.flatMap((step) => (step.uses ? [step.uses] : []));
    expect(uses.length).toBeGreaterThan(0);

    for (const ref of uses) {
      expect(ref).toMatch(/@[0-9a-f]{40}$/);
      // Locate the declaring line by plain substring match rather than
      // building a RegExp out of the ref, then assert the trailing version
      // comment sits on that same line.
      const line = lines.find((candidate) => candidate.includes(`uses: ${ref}`));
      expect(line, `no line declares ${ref}`).toBeDefined();
      expect(line).toMatch(/ # v\d+\.\d+\.\d+\s*$/);
    }
  });

  it('installs without running the Prisma postinstall', () => {
    const install = steps.find((step) => step.run?.includes('bun install'));
    expect(install?.run).toContain('--frozen-lockfile');
    expect(install?.run).toContain('--ignore-scripts');
  });

  it('is not wired into the pull-request ADR workflow', () => {
    const prWorkflow = readFileSync(
      path.join(process.cwd(), '.github/workflows/adr.yml'),
      'utf8',
    );
    expect(prWorkflow).not.toContain('adr:review-dates');
  });

  it('never splices a dispatch input into a run: block', () => {
    // `${{ inputs.as_of }}` inside `run:` would be shell injection for anyone
    // able to dispatch the workflow. Inputs must arrive via env and be quoted.
    for (const step of steps) {
      expect(step.run ?? '').not.toMatch(/\$\{\{\s*(inputs|github\.event)\./);
    }
    const check = steps.find((step) => step.run?.includes('adr:review-dates'));
    expect(check?.env).toMatchObject({
      ADR_AS_OF: '${{ inputs.as_of }}',
      ADR_DRY_RUN: '${{ inputs.dry_run }}',
    });
    expect(check?.run).toContain('"$ADR_AS_OF"');
  });
});
