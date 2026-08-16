/**
 * Validates the ADR badge reports before they are published.
 *
 * `.adrkit/lint.json` and `.adrkit/queue.json` are the verbatim JSON of
 * `adrkit lint --json` and `adrkit queue --format json`. They exist only to be
 * read by shields.io, which resolves a JSONPath against them -- `$.checked` and
 * `$.totalItems` respectively -- and renders whatever it finds.
 *
 * The failure this guards against is quiet. A truncated or malformed write does
 * not break the badge; it renders the string `no result`, which a reader parses
 * as "their tooling is broken" rather than "that file is corrupt". Nothing
 * downstream would fail, and the badge would keep showing it until someone
 * happened to look. So the report is validated before it is committed, and a
 * bad one fails the workflow instead of being published.
 *
 * `Number.isInteger` rather than `typeof x === 'number'`: the count fields must
 * be whole numbers, and `typeof NaN` is also `'number'`, so the looser check
 * would accept a `null` that had been coerced somewhere upstream. Booleans are
 * rejected for free here -- unlike Python, where `bool` subclasses `int` and
 * `isinstance(True, int)` is true -- but the field is still range-checked,
 * because a negative count is nonsense that JSONPath would happily render.
 *
 * Exported as a pure function of a directory so it can be exercised against
 * fixtures. Depends on nothing outside node: builtins, like the other
 * check scripts, so its CI step cannot be defeated by an install failure.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Where the workflow writes the reports, relative to the repo root. */
export const REPORTS_DIR = '.adrkit';

/** A report file, and the field the badge's JSONPath query reads out of it. */
interface ReportSpec {
  file: string;
  field: string;
  /** The command whose verbatim output this file is, for the error message. */
  command: string;
}

export const REPORTS: ReportSpec[] = [
  { file: 'lint.json', field: 'checked', command: 'adrkit lint --json' },
  { file: 'queue.json', field: 'totalItems', command: 'adrkit queue --format json' },
];

export interface ReportCheckResult {
  failures: string[];
  /** The validated field values, keyed by filename. Empty when a check failed. */
  values: Record<string, number>;
}

/**
 * @param reportsDir Absolute path to the directory holding the report files.
 */
export function checkReports(reportsDir: string): ReportCheckResult {
  const failures: string[] = [];
  const values: Record<string, number> = {};

  for (const { file, field, command } of REPORTS) {
    const full = path.join(reportsDir, file);

    if (!existsSync(full)) {
      failures.push(`${file} is missing. It should be the verbatim output of \`${command}\`.`);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(full, 'utf8'));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push(
        `${file} is not valid JSON (${detail}). A truncated write renders as ` +
          '`no result` on the badge rather than failing, so it is rejected here.',
      );
      continue;
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      failures.push(`${file} is not a JSON object, so \`$.${field}\` cannot resolve.`);
      continue;
    }

    const value = (parsed as Record<string, unknown>)[field];

    if (!Number.isInteger(value)) {
      failures.push(
        `${file} has no integer \`${field}\` (found ${JSON.stringify(value) ?? 'undefined'}). ` +
          `The badge reads \`$.${field}\` and renders \`no result\` when it is absent ` +
          'or not a number.',
      );
      continue;
    }

    if ((value as number) < 0) {
      failures.push(`${file} reports a negative \`${field}\` (${value}), which cannot be a count.`);
      continue;
    }

    values[file] = value as number;
  }

  return { failures, values };
}

function main(): void {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const reportsDir = path.resolve(repoRoot, process.argv[2] ?? REPORTS_DIR);
  const { failures, values } = checkReports(reportsDir);

  if (failures.length === 0) {
    const summary = REPORTS.map(({ file, field }) => `${field}=${values[file]}`).join(', ');
    console.log(`ADR badge reports OK: ${summary}.`);
    return;
  }

  console.error('ADR badge report check failed:\n');
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
