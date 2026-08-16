/**
 * Regression tests for `scripts/check-adr-reports.ts`.
 *
 * The published reports are the only input to the two README badges, and the
 * failure they guard against is silent: shields.io renders a missing or
 * non-numeric field as the string `no result` rather than erroring, so a
 * corrupt report publishes successfully and then misreports indefinitely.
 * Nothing downstream of the badge would notice. These tests are what keep that
 * check honest.
 *
 * The cases that matter most are the ones that are *shaped* like a valid report
 * -- `{"checked": true}`, `{"checked": null}`, `{"checked": 2.5}` -- because
 * each one round-trips through JSON.parse without complaint and would sail past
 * a looser `typeof x === 'number'` or a truthiness check.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkReports } from '@/scripts/check-adr-reports';

/** Verbatim shape of `adrkit lint --json`, trimmed to the field the badge reads. */
const VALID_LINT = { checked: 5, findings: [] };

/** Verbatim shape of `adrkit queue --format json`, trimmed likewise. */
const VALID_QUEUE = { version: '1', totalItems: 0, items: [] };

interface FixtureOptions {
  /** Raw file contents. `undefined` writes the valid report; `null` omits it. */
  lint?: string | null;
  queue?: string | null;
}

function withFixture(
  options: FixtureOptions,
  assert: (result: ReturnType<typeof checkReports>) => void,
): void {
  const { lint, queue } = options;
  const dir = mkdtempSync(path.join(tmpdir(), 'adr-reports-'));

  const write = (name: string, contents: string | null | undefined, fallback: unknown) => {
    if (contents === null) return;
    writeFileSync(
      path.join(dir, name),
      contents ?? JSON.stringify(fallback, null, 2),
      'utf8',
    );
  };

  write('lint.json', lint, VALID_LINT);
  write('queue.json', queue, VALID_QUEUE);

  try {
    assert(checkReports(dir));
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

describe('check-adr-reports', () => {
  it('passes reports that carry the fields the badges query', () => {
    withFixture({}, (result) => {
      expect(result.failures).toEqual([]);
      expect(result.values).toEqual({ 'lint.json': 5, 'queue.json': 0 });
    });
  });

  it('accepts a zero count, which is a real corpus state and not an error', () => {
    withFixture({ lint: JSON.stringify({ checked: 0 }) }, (result) => {
      expect(result.failures).toEqual([]);
      expect(result.values['lint.json']).toBe(0);
    });
  });

  it('fails when a report has not been generated yet', () => {
    withFixture({ queue: null }, (result) => {
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toContain('queue.json is missing');
    });
  });

  // The exact failure the staging/validate step exists to catch: a write that
  // was cut short still parses as a file, just not as JSON.
  it('fails on a truncated write rather than publishing it', () => {
    withFixture({ lint: '{"checked": 5, "findi' }, (result) => {
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toContain('not valid JSON');
    });
  });

  it('fails when the report is valid JSON but not an object', () => {
    withFixture({ queue: '[]' }, (result) => {
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toContain('not a JSON object');
    });
  });

  it('fails when the queried field is absent', () => {
    withFixture({ queue: JSON.stringify({ items: [] }) }, (result) => {
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toContain('no integer `totalItems`');
    });
  });

  // `true` is the case Python's `isinstance(x, int)` accepts, because bool
  // subclasses int. It must be rejected here, and the badge would render it as
  // `true` rather than a count.
  it('rejects a boolean where a count is expected', () => {
    withFixture({ lint: JSON.stringify({ checked: true }) }, (result) => {
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toContain('no integer `checked`');
    });
  });

  it('rejects null, which a looser typeof check would let through', () => {
    withFixture({ lint: JSON.stringify({ checked: null }) }, (result) => {
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toContain('no integer `checked`');
    });
  });

  it('rejects a non-integer number', () => {
    withFixture({ queue: JSON.stringify({ totalItems: 2.5 }) }, (result) => {
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toContain('no integer `totalItems`');
    });
  });

  it('rejects a negative count, which cannot describe a corpus', () => {
    withFixture({ lint: JSON.stringify({ checked: -1 }) }, (result) => {
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toContain('negative `checked`');
    });
  });

  it('reports every bad file, not just the first', () => {
    withFixture({ lint: '{', queue: 'nope' }, (result) => {
      expect(result.failures).toHaveLength(2);
      expect(result.values).toEqual({});
    });
  });
});
