/**
 * Regression tests for `scripts/check-adr-integrity.ts`.
 *
 * This guard is the only thing stopping a wiped ADR corpus from merging green
 * (`adrkit lint` exits 0 on an empty directory) and the only thing that fails on a
 * record renamed out of the discoverable form (`adrkit lint` merely warns, and
 * warnings do not affect its exit code). Its behaviour was previously verified
 * by hand and protected by nothing.
 *
 * The case that matters most is `0000-template.md`: it matches the record
 * filename pattern but adrkit excludes it, so counting it as a record would let
 * someone delete every real record while keeping the template and still pass.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runIntegrityChecks } from '@/scripts/check-adr-integrity';

const ADRKIT_VERSION = '0.4.0';
const CI_ACTION_SHA = 'c3dff3a7a9c3df44233809423eb59a3505fcf6f5';

/** Matches the real bunfig.toml: every first-party adrkit package exempted. */
const EXCLUDES = ['@adrkit/cli', '@adrkit/core', '@adrkit/evaluator', '@adrkit/mcp'];

interface FixtureOptions {
  /** Filenames to place in `docs/adr/`. */
  corpus?: string[];
  /** Set false to skip creating `docs/adr/` entirely. */
  withCorpusDir?: boolean;
  cliVersion?: string;
  /** devDependencies pin for `@adrkit/mcp`; null omits it entirely. */
  mcpVersion?: string | null;
  ciActionVersion?: string;
  cloudDocVersion?: string;
  /** Raw contents for the two local MCP configs. */
  localMcpJson?: string;
  /** Package names to list in `minimumReleaseAgeExcludes`. */
  excludes?: string[];
  omitFiles?: string[];
}

/** The compliant launch shape: the local binary, no registry fetch. */
const LOCAL_MCP_JSON = JSON.stringify({
  mcpServers: { adrkit: { command: './node_modules/.bin/adrkit-mcp' } },
});

/** Build a throwaway repo root that the checks can run against. */
function makeFixture(options: FixtureOptions = {}): string {
  const {
    ciActionVersion = ADRKIT_VERSION,
    cliVersion = ADRKIT_VERSION,
    cloudDocVersion = ADRKIT_VERSION,
    corpus = ['README.md', '0000-template.md', '0001-a-real-decision.md'],
    excludes = EXCLUDES,
    localMcpJson = LOCAL_MCP_JSON,
    mcpVersion = ADRKIT_VERSION,
    omitFiles = [],
    withCorpusDir = true,
  } = options;

  const root = mkdtempSync(path.join(tmpdir(), 'adr-integrity-'));

  const write = (relative: string, contents: string) => {
    if (omitFiles.includes(relative)) return;
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents, 'utf8');
  };

  if (withCorpusDir) {
    mkdirSync(path.join(root, 'docs', 'adr'), { recursive: true });
    for (const name of corpus) {
      writeFileSync(path.join(root, 'docs', 'adr', name), '# fixture\n', 'utf8');
    }
  }

  const devDependencies: Record<string, string> = { '@adrkit/cli': cliVersion };
  if (mcpVersion !== null) devDependencies['@adrkit/mcp'] = mcpVersion;

  write('package.json', JSON.stringify({ devDependencies }, null, 2));
  write('.mcp.json', localMcpJson);
  write('.vscode/mcp.json', localMcpJson);
  write(
    'bunfig.toml',
    '[install]\nminimumReleaseAge = 259200\nminimumReleaseAgeExcludes = [' +
      excludes.map((name) => `"${name}"`).join(', ') +
      ']\n',
  );
  write(
    '.github/copilot-cloud-agent-mcp.md',
    `Paste \`npx @adrkit/mcp@${cloudDocVersion}\` into repository settings.\n`,
  );
  write(
    '.github/workflows/adr.yml',
    `jobs:\n  x:\n    steps:\n      - uses: mbeacom/adrkit/packages/ci@${CI_ACTION_SHA} # v${ciActionVersion}\n`,
  );

  return root;
}

function withFixture(
  options: FixtureOptions,
  assert: (result: ReturnType<typeof runIntegrityChecks>) => void,
): void {
  const root = makeFixture(options);
  try {
    assert(runIntegrityChecks(root));
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

describe('check-adr-integrity', () => {
  it('passes a well-formed corpus with agreeing version pins', () => {
    withFixture({}, (result) => {
      expect(result.failures).toEqual([]);
      expect(result.recordCount).toBe(1);
    });
  });

  describe('corpus-wipe guard', () => {
    it('fails when the corpus holds only the template and the README', () => {
      // The exact regression: 0000-template.md matches RECORD_NAME, so a naive
      // count reports a non-empty corpus and a full wipe merges green.
      withFixture({ corpus: ['README.md', '0000-template.md'] }, (result) => {
        expect(result.recordCount).toBe(0);
        expect(result.failures.join('\n')).toContain(
          'contains no discoverable ADR records',
        );
      });
    });

    it('does not count the template toward the record total', () => {
      withFixture(
        { corpus: ['0000-template.md', '0001-a.md', '0002-b.md'] },
        (result) => {
          expect(result.recordCount).toBe(2);
        },
      );
    });

    it('fails on a completely empty corpus directory', () => {
      withFixture({ corpus: [] }, (result) => {
        expect(result.failures.join('\n')).toContain(
          'contains no discoverable ADR records',
        );
      });
    });

    it('fails when the corpus directory is missing entirely', () => {
      withFixture({ withCorpusDir: false }, (result) => {
        expect(result.failures.join('\n')).toContain('does not exist');
      });
    });
  });

  describe('discoverable-filename guard', () => {
    it('fails on a record renamed out of the NNNN-slug form', () => {
      withFixture(
        { corpus: ['README.md', '0001-a.md', 'notes-on-caching.md'] },
        (result) => {
          expect(result.failures.join('\n')).toContain(
            'notes-on-caching.md is not a discoverable ADR record',
          );
        },
      );
    });

    it.each(['001-too-few-digits.md', '0001-Has-Capitals.md', '0001 spaces.md'])(
      'rejects the nonconforming filename %s',
      (name) => {
        withFixture({ corpus: ['README.md', '0001-a.md', name] }, (result) => {
          expect(result.failures.join('\n')).toContain(name);
        });
      },
    );

    it('accepts more than four leading digits', () => {
      withFixture({ corpus: ['README.md', '00012-a-decision.md'] }, (result) => {
        expect(result.failures).toEqual([]);
        expect(result.recordCount).toBe(1);
      });
    });

    it('does not flag the README or the template as nonconforming', () => {
      withFixture(
        { corpus: ['README.md', '0000-template.md', '0001-a.md'] },
        (result) => {
          expect(result.failures).toEqual([]);
        },
      );
    });
  });

  describe('version-pin guard', () => {
    it('fails when the devDependency MCP pin drifts from the CLI pin', () => {
      withFixture({ mcpVersion: '0.3.0' }, (result) => {
        expect(result.failures.join('\n')).toContain(
          'package.json pins @adrkit/mcp at 0.3.0 but @adrkit/cli at 0.4.0',
        );
      });
    });

    it('fails when @adrkit/mcp is not a devDependency at all', () => {
      // The local configs run node_modules/.bin/adrkit-mcp, so without the
      // dependency the server cannot start -- and nothing else would say so.
      withFixture({ mcpVersion: null }, (result) => {
        expect(result.failures.join('\n')).toContain(
          'package.json does not pin @adrkit/mcp in devDependencies',
        );
      });
    });

    it('fails when @adrkit/mcp is a range rather than an exact version', () => {
      withFixture({ mcpVersion: '^0.4.0' }, (result) => {
        expect(result.failures.join('\n')).toContain('@adrkit/mcp is "^0.4.0"');
      });
    });

    it('fails when the CI action pin drifts from the CLI pin', () => {
      withFixture({ ciActionVersion: '0.3.9' }, (result) => {
        expect(result.failures.join('\n')).toContain(
          '.github/workflows/adr.yml pins the pinned CI action at 0.3.9',
        );
      });
    });

    it('fails when the documented cloud agent config drifts', () => {
      withFixture({ cloudDocVersion: '0.1.0' }, (result) => {
        expect(result.failures.join('\n')).toContain(
          'copilot-cloud-agent-mcp.md pins',
        );
      });
    });

    it('fails when @adrkit/cli is a range rather than an exact version', () => {
      withFixture({ cliVersion: '^0.4.0' }, (result) => {
        expect(result.failures.join('\n')).toContain(
          'it must be an exact version',
        );
      });
    });

    it('fails when @adrkit/cli is not pinned at all', () => {
      const root = mkdtempSync(path.join(tmpdir(), 'adr-integrity-'));
      try {
        mkdirSync(path.join(root, 'docs', 'adr'), { recursive: true });
        writeFileSync(path.join(root, 'docs', 'adr', '0001-a.md'), '#\n', 'utf8');
        writeFileSync(path.join(root, 'package.json'), '{}', 'utf8');
        expect(runIntegrityChecks(root).failures.join('\n')).toContain(
          'does not pin @adrkit/cli',
        );
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });

    it('fails when a pin site file is missing', () => {
      withFixture({ omitFiles: ['.mcp.json'] }, (result) => {
        expect(result.failures.join('\n')).toContain('.mcp.json is missing');
      });
    });
  });

  describe('local-binary guard (#307)', () => {
    // A config that went back to `bunx -y @adrkit/mcp@0.4.0` still starts a
    // working server at the right version, so every other signal stays green.
    // The only thing that changed is that it is fetching from the registry
    // again -- outside bun.lock and outside the release quarantine.
    it('fails when a local config fetches @adrkit/mcp from the registry', () => {
      withFixture(
        {
          localMcpJson: JSON.stringify({
            mcpServers: { adrkit: { command: 'bunx', args: ['-y', '@adrkit/mcp@0.4.0'] } },
          }),
        },
        (result) => {
          const joined = result.failures.join('\n');
          expect(joined).toContain('.mcp.json fetches @adrkit/mcp from the registry');
          expect(joined).toContain('.vscode/mcp.json fetches');
        },
      );
    });

    it('fails when a local config no longer runs the adrkit binary', () => {
      withFixture(
        { localMcpJson: JSON.stringify({ mcpServers: { other: { command: 'true' } } }) },
        (result) => {
          expect(result.failures.join('\n')).toContain(
            'does not run node_modules/.bin/adrkit-mcp',
          );
        },
      );
    });

    it('accepts the workspace-variable form VS Code uses', () => {
      withFixture(
        {
          localMcpJson: JSON.stringify({
            mcpServers: {
              adrkit: { command: '${workspaceFolder}/node_modules/.bin/adrkit-mcp' },
            },
          }),
        },
        (result) => {
          expect(result.failures).toEqual([]);
        },
      );
    });
  });

  describe('quarantine-exclusion guard (#307)', () => {
    // minimumReleaseAgeExcludes is per-package: it does not cover a package's
    // dependencies, and it does not accept globs. Miss one and the next adrkit
    // release cannot be installed for three days -- and it cannot be worked
    // around by bumping one package first, because the pins must move together.
    it.each(['@adrkit/core', '@adrkit/evaluator', '@adrkit/mcp', '@adrkit/cli'])(
      'fails when %s is missing from minimumReleaseAgeExcludes',
      (missing) => {
        withFixture(
          { excludes: EXCLUDES.filter((name) => name !== missing) },
          (result) => {
            expect(result.failures.join('\n')).toContain(
              `does not list "${missing}" in minimumReleaseAgeExcludes`,
            );
          },
        );
      },
    );

    it('does not require exclusions when no quarantine is configured', () => {
      const root = makeFixture();
      try {
        writeFileSync(path.join(root, 'bunfig.toml'), '[install]\n', 'utf8');
        expect(runIntegrityChecks(root).failures).toEqual([]);
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    });

    it('fails when bunfig.toml is missing entirely', () => {
      withFixture({ omitFiles: ['bunfig.toml'] }, (result) => {
        expect(result.failures.join('\n')).toContain('bunfig.toml is missing');
      });
    });
  });

  it('reports the real repository corpus as healthy', () => {
    // Guards the refactor itself: the shared adr-corpus module must keep
    // producing the same answer for the actual repository.
    const result = runIntegrityChecks(process.cwd());
    expect(result.failures).toEqual([]);
    expect(result.recordCount).toBeGreaterThanOrEqual(5);
  });
});
