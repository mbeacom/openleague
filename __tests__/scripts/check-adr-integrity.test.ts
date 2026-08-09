/**
 * Regression tests for `scripts/check-adr-integrity.ts`.
 *
 * This guard is the only thing stopping a wiped ADR corpus from merging green
 * (`adr lint` exits 0 on an empty directory) and the only thing that fails on a
 * record renamed out of the discoverable form (`adr lint` merely warns, and
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

interface FixtureOptions {
  /** Filenames to place in `docs/adr/`. */
  corpus?: string[];
  /** Set false to skip creating `docs/adr/` entirely. */
  withCorpusDir?: boolean;
  cliVersion?: string;
  mcpVersion?: string;
  ciActionVersion?: string;
  omitFiles?: string[];
}

/** Build a throwaway repo root that the checks can run against. */
function makeFixture(options: FixtureOptions = {}): string {
  const {
    ciActionVersion = ADRKIT_VERSION,
    cliVersion = ADRKIT_VERSION,
    corpus = ['README.md', '0000-template.md', '0001-a-real-decision.md'],
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

  write(
    'package.json',
    JSON.stringify({ devDependencies: { '@adrkit/cli': cliVersion } }, null, 2),
  );
  write('.mcp.json', `{"adrkit":{"args":["@adrkit/mcp@${mcpVersion}"]}}`);
  write('.vscode/mcp.json', `{"adrkit":{"args":["@adrkit/mcp@${mcpVersion}"]}}`);
  write(
    '.github/copilot-cloud-agent-mcp.md',
    `Paste \`npx @adrkit/mcp@${mcpVersion}\` into repository settings.\n`,
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
    it('fails when the MCP pin drifts from the CLI pin', () => {
      withFixture({ mcpVersion: '0.3.0' }, (result) => {
        const joined = result.failures.join('\n');
        expect(joined).toContain('.mcp.json pins @adrkit/mcp at 0.3.0');
        expect(joined).toContain('.vscode/mcp.json');
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
      const root = makeFixture();
      try {
        writeFileSync(
          path.join(root, '.github', 'copilot-cloud-agent-mcp.md'),
          'Paste `npx @adrkit/mcp@0.1.0` into repository settings.\n',
          'utf8',
        );
        expect(runIntegrityChecks(root).failures.join('\n')).toContain(
          'copilot-cloud-agent-mcp.md pins',
        );
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
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

  it('reports the real repository corpus as healthy', () => {
    // Guards the refactor itself: the shared adr-corpus module must keep
    // producing the same answer for the actual repository.
    const result = runIntegrityChecks(process.cwd());
    expect(result.failures).toEqual([]);
    expect(result.recordCount).toBeGreaterThanOrEqual(5);
  });
});
