/**
 * Enforces the ADR-0003 raw-SQL prohibition.
 * See docs/adr/0003-access-postgresql-exclusively-through-prisma-on-neon-serverless.md
 *
 * Two rules:
 *
 *   1. The plain raw helpers are prohibited under `app/`, `lib/`, and
 *      `components/`, with one exception: `app/api/health/route.ts`, whose
 *      single statement is a parameterless liveness probe. `scripts/` is
 *      outside the deployed application and is not covered by this rule, so
 *      `scripts/check-cols.ts` keeps reading `information_schema` through the
 *      tagged-template form, which parameterizes.
 *   2. The *Unsafe variants are prohibited everywhere in the repository with no
 *      exception -- including `scripts/`. They take a plain string rather than
 *      a tagged template, so they parameterize nothing.
 *
 * Why this exists alongside the ESLint rules in eslint.config.mjs: `bun run
 * lint` runs only in release.yml and tag-release.yml, both of which fire after
 * a merge to main, and an inline `eslint-disable` can silence a rule. This
 * script runs in the pull-request-triggered ADR workflow and cannot be
 * silenced by a comment, so it is the gate that actually blocks a merge. It
 * depends on nothing outside node: builtins, so its CI job needs no install.
 *
 * The patterns match member-access shape -- a dot or a computed index followed
 * by the helper name -- rather than every occurrence of the name. That targets
 * real call sites and leaves test mocks shaped like `{ $queryRaw: vi.fn() }`
 * alone. Comments are blanked before matching (see `blankComments`) so prose
 * naming a call site is not a violation; string literals deliberately are NOT
 * blanked, because the computed form hides the helper name inside one.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const resolveRepoRoot = (): string => path.resolve(import.meta.dirname, '..');

/** Extensions that can contain a call site. */
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/** Build output, dependencies, and VCS metadata: never source we authored. */
const SKIP_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.turbo',
  '.vercel',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);

/** Repo-relative prefixes where the plain raw helpers are prohibited. */
const RESTRICTED_ROOTS = ['app/', 'lib/', 'components/'];

/**
 * The single documented exception to rule 1: a parameterless liveness probe,
 * so there is no input to interpolate. It is NOT an exception to rule 2.
 */
const RAW_EXEMPT_FILES = new Set(['app/api/health/route.ts']);

const RAW_MESSAGE =
  'raw SQL is prohibited under app/, lib/, and components/ by ADR-0003 ' +
  '(app/api/health/route.ts is the only exception). Use the generated Prisma ' +
  'client, which parameterizes by default.';

const UNSAFE_MESSAGE =
  'the *Unsafe raw helpers are prohibited everywhere by ADR-0003, with no ' +
  'exception: they take a plain string rather than a tagged template, so ' +
  'nothing is parameterized. Introducing one requires superseding the record.';

/**
 * `\b` after `Raw` is what keeps the plain patterns from also matching the
 * *Unsafe variants: `Raw` followed by `U` is not a word boundary, so the two
 * rules stay distinct and each reports its own message.
 */
const PATTERNS = [
  { rule: 'unsafe', find: /[.]\s*[$](?:query|execute)RawUnsafe\b/g },
  { rule: 'unsafe', find: /\[\s*(['"`])[$](?:query|execute)RawUnsafe\1\s*\]/g },
  { rule: 'raw', find: /[.]\s*[$](?:query|execute)Raw\b/g },
  { rule: 'raw', find: /\[\s*(['"`])[$](?:query|execute)Raw\1\s*\]/g },
] as const;

export interface Violation {
  file: string;
  line: number;
  rule: 'raw' | 'unsafe';
  message: string;
}

// --- Comment blanking ------------------------------------------------------
// A regex alone cannot tell a call site from prose describing one, and this
// repo comments heavily -- the first run of this check failed on a JSDoc line
// in eslint.config.mjs. Blanking comments first is what stops the gate crying
// wolf on its own documentation. Quotes, template literals, and regex literals
// are tracked only so a `//` or `/*` inside one is not mistaken for a comment
// opener; their contents are left intact for matching.

/** Consumes a quoted string starting at `start`; returns the index after it. */
function consumeQuoted(source: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < source.length) {
    const c = source[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === quote) return i + 1;
    // An unterminated literal is a syntax error; stop at the newline rather
    // than swallowing the rest of the file.
    if (c === '\n') return i;
    i += 1;
  }
  return i;
}

/** Consumes a template literal starting at its opening backtick. */
function consumeTemplate(source: string, start: number): number {
  let i = start + 1;
  while (i < source.length) {
    const c = source[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '`') return i + 1;
    if (c === '$' && source[i + 1] === '{') {
      i = consumeSubstitution(source, i + 1);
      continue;
    }
    i += 1;
  }
  return i;
}

/** Consumes a `${ ... }` substitution starting at its opening brace. */
function consumeSubstitution(source: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < source.length) {
    const c = source[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '`') {
      i = consumeTemplate(source, i);
      continue;
    }
    if (c === '"' || c === "'") {
      i = consumeQuoted(source, i, c);
      continue;
    }
    if (c === '{') depth += 1;
    if (c === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  return i;
}

/** Consumes a regex literal starting at its opening slash. */
function consumeRegexLiteral(source: string, start: number): number {
  let i = start + 1;
  let inCharacterClass = false;
  while (i < source.length) {
    const c = source[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '\n') return i;
    if (inCharacterClass) {
      if (c === ']') inCharacterClass = false;
    } else if (c === '[') {
      inCharacterClass = true;
    } else if (c === '/') {
      return i + 1;
    }
    i += 1;
  }
  return i;
}

/**
 * Whether a bare `/` here opens a regex literal rather than being division.
 * Ambiguity resolves toward "regex", which is the safe direction: mistaking
 * division for a regex only skips characters, whereas mistaking a regex for
 * division could misread a `/*` inside it and blank real code as a comment.
 */
function opensRegexLiteral(previousSignificant: string): boolean {
  return !/[A-Za-z0-9_$)\]]/.test(previousSignificant);
}

/**
 * Replaces comment characters with spaces, preserving length and line breaks
 * so reported line numbers still point at the original source.
 */
export function blankComments(source: string): string {
  const out = source.split('');
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to && k < out.length; k += 1) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };

  let i = 0;
  let previousSignificant = '';
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];

    // Checked before the regex-literal case: a regex literal can start with
    // neither `/` nor `*`, so these two openers in code position are always
    // comments.
    if (c === '/' && next === '/') {
      let end = i;
      while (end < source.length && source[end] !== '\n') end += 1;
      blank(i, end);
      i = end;
      continue;
    }
    if (c === '/' && next === '*') {
      let end = i + 2;
      while (end < source.length && !(source[end] === '*' && source[end + 1] === '/')) {
        end += 1;
      }
      end = Math.min(end + 2, source.length);
      blank(i, end);
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      i = consumeQuoted(source, i, c);
      previousSignificant = c;
      continue;
    }
    if (c === '`') {
      i = consumeTemplate(source, i);
      previousSignificant = c;
      continue;
    }
    if (c === '/' && opensRegexLiteral(previousSignificant)) {
      i = consumeRegexLiteral(source, i);
      previousSignificant = '/';
      continue;
    }
    if (!/\s/.test(c)) previousSignificant = c;
    i += 1;
  }

  return out.join('');
}

// --- Scanning --------------------------------------------------------------

/** Whether the plain raw helpers are prohibited in this file. */
function rawIsProhibitedIn(relativePath: string): boolean {
  if (RAW_EXEMPT_FILES.has(relativePath)) return false;
  return RESTRICTED_ROOTS.some((root) => relativePath.startsWith(root));
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/**
 * Finds prohibited raw-SQL call sites in one file's source.
 *
 * @param relativePath repo-relative, POSIX-separated (e.g. `lib/actions/team.ts`)
 */
export function findViolations(relativePath: string, source: string): Violation[] {
  const rawProhibited = rawIsProhibitedIn(relativePath);
  const code = blankComments(source);
  const seen = new Set<string>();
  const violations: Violation[] = [];

  for (const { rule, find } of PATTERNS) {
    if (rule === 'raw' && !rawProhibited) continue;

    // The patterns are module-level and /g, so reset before reuse.
    find.lastIndex = 0;
    for (const match of code.matchAll(find)) {
      const line = lineOf(code, match.index);
      // The dot and computed forms can both match one call site; report once.
      const key = `${rule}:${line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({
        file: relativePath,
        line,
        rule,
        message: rule === 'unsafe' ? UNSAFE_MESSAGE : RAW_MESSAGE,
      });
    }
  }

  return violations.sort((a, b) => a.line - b.line);
}

/** Repo-relative, POSIX-separated paths of every scannable source file. */
export function collectSourceFiles(root: string = resolveRepoRoot()): string[] {
  const found: string[] = [];

  function walk(absolute: string): void {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        walk(path.join(absolute, entry.name));
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        const relative = path.relative(root, path.join(absolute, entry.name));
        found.push(relative.split(path.sep).join('/'));
      }
    }
  }

  walk(root);
  return found.sort();
}

/** Scans a checkout and returns every violation found. */
export function scanRepository(root: string = resolveRepoRoot()): Violation[] {
  return collectSourceFiles(root).flatMap((relative) =>
    findViolations(relative, readFileSync(path.join(root, relative), 'utf8')),
  );
}

function main(): void {
  const repoRoot = resolveRepoRoot();

  // A missing scan root means the script was moved or the checkout is partial;
  // either way, exiting 0 would be a gate that had silently stopped gating.
  for (const root of RESTRICTED_ROOTS) {
    const absolute = path.join(repoRoot, root);
    let present = false;
    try {
      present = statSync(absolute).isDirectory();
    } catch {
      present = false;
    }
    if (!present) {
      console.error(
        `Raw-SQL check failed: expected scan root ${root} does not exist under ${repoRoot}.`,
      );
      process.exit(1);
    }
  }

  const files = collectSourceFiles();
  const violations = files.flatMap((relative) =>
    findViolations(relative, readFileSync(path.join(repoRoot, relative), 'utf8')),
  );

  if (violations.length > 0) {
    console.error('Raw-SQL check failed -- ADR-0003 prohibits these call sites:\n');
    for (const violation of violations) {
      console.error(`  - ${violation.file}:${violation.line} -- ${violation.message}`);
    }
    console.error(
      '\nSee docs/adr/0003-access-postgresql-exclusively-through-prisma-on-neon-serverless.md.',
    );
    process.exit(1);
  }

  console.log(
    `Raw-SQL check OK: scanned ${files.length} source file(s); no prohibited raw ` +
      'SQL under app/, lib/, or components/, and no *Unsafe helper anywhere.',
  );
}

// Bun sets this when the file is executed directly. Under Vitest it is
// undefined, so importing the helpers above does not run the CLI.
if (import.meta.main) main();
