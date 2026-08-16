/**
 * Integrity checks for the ADR corpus and the adrkit version pins.
 *
 * `adrkit lint` validates the records it can discover, but it exits 0 when it
 * discovers none -- so an emptied corpus, or a record renamed out of the
 * discoverable `NNNN-slug.md` form, passes the gate silently. It also has no
 * view of the version pins scattered across the repo. This covers those three
 * gaps and is deliberately independent of the adrkit version.
 *
 * Since #307 it also covers the two supply-chain properties that keep the
 * adrkit MCP server inside the controls ADR-0005 describes: that the local
 * configs run the pinned local binary rather than fetching from the registry,
 * and that every first-party adrkit package is exempt from the release
 * quarantine (without which the next version bump cannot be installed at all).
 *
 * The checks are exported as a pure function of a repo root so they can be
 * exercised against fixture directories in tests. Nothing here is protected by
 * anything else, so the tests are the only thing standing between a subtle
 * regression and a corpus wipe merging green.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CORPUS_DIR,
  NON_RECORD_FILES,
  RECORD_NAME,
  filterRecordFiles,
  listCorpusEntries,
} from './adr-corpus';

export interface IntegrityResult {
  failures: string[];
  /** Discoverable records found, excluding the template and README. */
  recordCount: number;
}

/**
 * The first-party adrkit packages that `bun install` can re-resolve, and so
 * must each be exempt from the `minimumReleaseAge` quarantine in `bunfig.toml`.
 * `@adrkit/core` and `@adrkit/evaluator` are transitive, but exclusions do not
 * propagate to a package's dependencies, so naming only the two direct ones is
 * not enough.
 */
export const ADRKIT_PACKAGES = [
  '@adrkit/cli',
  '@adrkit/core',
  '@adrkit/evaluator',
  '@adrkit/mcp',
] as const;

export function runIntegrityChecks(repoRoot: string): IntegrityResult {
  const corpusDir = path.join(repoRoot, CORPUS_DIR);
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);

  function read(relative: string): string {
    return readFileSync(path.join(repoRoot, relative), 'utf8');
  }

  // --- 1. The corpus is non-empty ------------------------------------------
  // `adrkit lint` reports "checked 0 records, 0 errors" and exits 0 on an empty
  // directory, so a pull request that deletes every record merges green.
  function checkCorpusNotEmpty(entries: string[]): number {
    const records = filterRecordFiles(entries);
    if (records.length === 0) {
      fail(
        'docs/adr/ contains no discoverable ADR records. `adrkit lint` exits 0 on an ' +
          'empty corpus, so this check exists to stop a wiped corpus merging green. ' +
          '(0000-template.md is not counted: it matches the record filename pattern ' +
          'but adrkit excludes it, so counting it would let a wipe pass.)',
      );
    }
    return records.length;
  }

  // --- 2. Every record is discoverable -------------------------------------
  // A record whose filename stops matching is skipped with a warning, and
  // warnings do not affect adrkit lint's exit code -- so it silently stops
  // governing anything while CI stays green.
  function checkRecordsDiscoverable(entries: string[]): void {
    for (const name of entries) {
      if (NON_RECORD_FILES.has(name) || RECORD_NAME.test(name)) continue;
      fail(
        `docs/adr/${name} is not a discoverable ADR record. Rename it to ` +
          '`NNNN-kebab-slug.md`, or add it to NON_RECORD_FILES if it is not a record. ' +
          'adrkit lint only warns about this, so it would otherwise be skipped silently.',
      );
    }
  }

  // --- 3. The adrkit version pins agree ------------------------------------
  // The version is pinned in four committed places plus one manual GitHub
  // setting. Nothing else notices when a bump updates only some of them.
  //
  // Since #307 the two local MCP configs no longer name a version: they run
  // `adrkit-mcp` out of `node_modules/.bin`, so their version *is* the
  // package.json pin and lands in bun.lock with an integrity hash. That moves
  // two of the sites from "a version string in a JSON file" to "a devDependency
  // plus a launch shape", and both halves are checked below -- a config that
  // regressed to a registry fetch would otherwise pass while quietly leaving
  // the quarantine again.
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

    // The MCP server is a devDependency rather than a registry fetch, so its
    // pin lives here and has to match the CLI's.
    const mcpPin = pkg.devDependencies?.['@adrkit/mcp'];
    if (!mcpPin) {
      fail(
        'package.json does not pin @adrkit/mcp in devDependencies. The local MCP ' +
          'configs run node_modules/.bin/adrkit-mcp, so without the dependency they ' +
          'cannot start at all. See #307.',
      );
    } else if (!/^\d+\.\d+\.\d+$/.test(mcpPin)) {
      fail(`@adrkit/mcp is "${mcpPin}"; it must be an exact version, like @adrkit/cli.`);
    } else if (mcpPin !== expected) {
      fail(
        `package.json pins @adrkit/mcp at ${mcpPin} but @adrkit/cli at ${expected}. ` +
          'The CLI and the MCP server read the same corpus and must be one version.',
      );
    }

    checkLocalMcpConfigs();
    checkQuarantineExclusions();

    const sites: { file: string; find: RegExp; label: string }[] = [
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

  // --- 3a. The local MCP configs run the local binary ----------------------
  // A regression to `bunx -y @adrkit/mcp@x.y.z` would still start a working
  // server, so nothing else would notice -- it would just be fetching from the
  // registry again, outside the lockfile and outside the quarantine (#307).
  function checkLocalMcpConfigs(): void {
    for (const file of ['.mcp.json', '.vscode/mcp.json']) {
      if (!existsSync(path.join(repoRoot, file))) {
        fail(`${file} is missing; it should run node_modules/.bin/adrkit-mcp.`);
        continue;
      }
      const contents = read(file);
      if (/@adrkit\/mcp@/.test(contents)) {
        fail(
          `${file} fetches @adrkit/mcp from the registry. It should run ` +
            'node_modules/.bin/adrkit-mcp, which is pinned in package.json and ' +
            'carried in bun.lock. See #307 and ADR-0005.',
        );
      } else if (!/node_modules\/\.bin\/adrkit-mcp/.test(contents)) {
        fail(
          `${file} does not run node_modules/.bin/adrkit-mcp. If the adrkit server ` +
            'was removed from this config, remove it from this check too.',
        );
      }
    }
  }

  // --- 3b. The adrkit packages are exempt from the release quarantine -------
  // `minimumReleaseAgeExcludes` is not transitive and does not accept globs, so
  // each first-party package needs its own entry. Miss one and the next
  // coordinated adrkit release fails every install for three days -- and it
  // cannot be worked around by bumping one package first, because the check
  // above requires @adrkit/cli and @adrkit/mcp to move together.
  function checkQuarantineExclusions(): void {
    const file = 'bunfig.toml';
    if (!existsSync(path.join(repoRoot, file))) {
      fail(`${file} is missing; it should exempt the adrkit packages from the quarantine.`);
      return;
    }

    const contents = read(file);
    if (!/minimumReleaseAge\s*=/.test(contents)) return; // No quarantine, nothing to exempt.

    const block = /minimumReleaseAgeExcludes\s*=\s*\[([\s\S]*?)\]/.exec(contents)?.[1] ?? '';
    for (const name of ADRKIT_PACKAGES) {
      if (!block.includes(`"${name}"`)) {
        fail(
          `${file} does not list "${name}" in minimumReleaseAgeExcludes. Exclusions ` +
            'are per-package -- they do not cover a package\'s dependencies -- so the ' +
            'next adrkit release would fail every install until the quarantine expires.',
        );
      }
    }
  }

  const entries = listCorpusEntries(corpusDir);
  let recordCount = 0;

  if (entries === null) {
    fail(`${path.relative(repoRoot, corpusDir)} does not exist.`);
  } else {
    recordCount = checkCorpusNotEmpty(entries);
    checkRecordsDiscoverable(entries);
    checkVersionPins();
  }

  return { failures, recordCount };
}

function main(): void {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const { failures, recordCount } = runIntegrityChecks(repoRoot);

  if (failures.length === 0) {
    console.log(
      `ADR integrity OK: ${recordCount} discoverable record(s), all filenames ` +
        'conform, all adrkit version pins agree.',
    );
    console.log(
      'Reminder: the cloud agent MCP setting is a GitHub repository Settings ' +
        'value and cannot be checked here. See .github/copilot-cloud-agent-mcp.md.',
    );
    return;
  }

  console.error('ADR integrity check failed:\n');
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
