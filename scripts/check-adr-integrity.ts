/**
 * Integrity checks for the ADR corpus and the adrkit version pins.
 *
 * `adr lint` validates the records it can discover, but it exits 0 when it
 * discovers none -- so an emptied corpus, or a record renamed out of the
 * discoverable `NNNN-slug.md` form, passes the gate silently. It also has no
 * view of the version pins scattered across the repo. This covers those three
 * gaps and is deliberately independent of the adrkit version.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const corpusDir = path.join(repoRoot, 'docs', 'adr');

/** Files that live in the corpus directory but are not records. */
const NON_RECORD_FILES = new Set(['README.md', '0000-template.md']);

/** adrkit's own discovery rule: four or more leading digits, then a kebab slug. */
const RECORD_NAME = /^[0-9]{4,}-[a-z0-9-]+\.md$/;

const failures: string[] = [];
const fail = (message: string) => failures.push(message);

function read(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

// --- 1. The corpus is non-empty ------------------------------------------
// `adr lint` reports "checked 0 records, 0 errors" and exits 0 on an empty
// directory, so a pull request that deletes every record merges green.
function checkCorpusNotEmpty(entries: string[]): number {
  const records = entries.filter(
    (name) => !NON_RECORD_FILES.has(name) && RECORD_NAME.test(name),
  );
  if (records.length === 0) {
    fail(
      'docs/adr/ contains no discoverable ADR records. `adr lint` exits 0 on an ' +
        'empty corpus, so this check exists to stop a wiped corpus merging green. ' +
        '(0000-template.md is not counted: it matches the record filename pattern ' +
        'but adrkit excludes it, so counting it would let a wipe pass.)',
    );
  }
  return records.length;
}

// --- 2. Every record is discoverable -------------------------------------
// A record whose filename stops matching is skipped with a warning, and
// warnings do not affect adr lint's exit code -- so it silently stops
// governing anything while CI stays green.
function checkRecordsDiscoverable(entries: string[]): void {
  for (const name of entries) {
    if (NON_RECORD_FILES.has(name) || RECORD_NAME.test(name)) continue;
    fail(
      `docs/adr/${name} is not a discoverable ADR record. Rename it to ` +
        '`NNNN-kebab-slug.md`, or add it to NON_RECORD_FILES if it is not a record. ' +
        'adr lint only warns about this, so it would otherwise be skipped silently.',
    );
  }
}

// --- 3. The adrkit version pins agree ------------------------------------
// The version is pinned in four committed places plus one manual GitHub
// setting. Nothing else notices when a bump updates only some of them.
function checkVersionPins(): void {
  const pkg = JSON.parse(read('package.json')) as {
    devDependencies?: Record<string, string>;
  };
  const expected = pkg.devDependencies?.['@adrkit/cli'];

  if (!expected) {
    fail('package.json does not pin @adrkit/cli in devDependencies.');
    return;
  }
  if (!/^\d+\.\d+\.\d+$/.test(expected)) {
    fail(
      `@adrkit/cli is "${expected}"; it must be an exact version so the MCP ` +
        'servers, the CI action, and the cloud agent setting can be held to the same one.',
    );
    return;
  }

  const sites: { file: string; find: RegExp; label: string }[] = [
    { file: '.mcp.json', find: /@adrkit\/mcp@(\d+\.\d+\.\d+)/, label: '@adrkit/mcp' },
    { file: '.vscode/mcp.json', find: /@adrkit\/mcp@(\d+\.\d+\.\d+)/, label: '@adrkit/mcp' },
    {
      file: '.github/copilot-cloud-agent-mcp.md',
      find: /@adrkit\/mcp@(\d+\.\d+\.\d+)/,
      label: '@adrkit/mcp in the documented cloud agent config',
    },
    {
      file: '.github/workflows/adr.yml',
      find: /mbeacom\/adrkit\/packages\/ci@[0-9a-f]{40}\s*#\s*v(\d+\.\d+\.\d+)/,
      label: 'the pinned CI action',
    },
  ];

  for (const { file, find, label } of sites) {
    if (!existsSync(path.join(repoRoot, file))) {
      fail(`${file} is missing; it should pin ${label} to ${expected}.`);
      continue;
    }
    const found = find.exec(read(file))?.[1];
    if (!found) {
      fail(`${file} does not pin ${label} to a version this check can read.`);
    } else if (found !== expected) {
      fail(
        `${file} pins ${label} at ${found}, but package.json pins @adrkit/cli at ` +
          `${expected}. Bump every site together.`,
      );
    }
  }
}

const entries = existsSync(corpusDir)
  ? readdirSync(corpusDir).filter((name) => name.endsWith('.md'))
  : null;

if (entries === null) {
  fail(`${path.relative(repoRoot, corpusDir)} does not exist.`);
} else {
  const recordCount = checkCorpusNotEmpty(entries);
  checkRecordsDiscoverable(entries);
  checkVersionPins();

  if (failures.length === 0) {
    console.log(
      `ADR integrity OK: ${recordCount} discoverable record(s), all filenames ` +
        'conform, all adrkit version pins agree.',
    );
    console.log(
      'Reminder: the cloud agent MCP setting is a GitHub repository Settings ' +
        'value and cannot be checked here. See .github/copilot-cloud-agent-mcp.md.',
    );
  }
}

if (failures.length > 0) {
  console.error('ADR integrity check failed:\n');
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}
