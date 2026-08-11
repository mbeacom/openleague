/**
 * Regression tests for `scripts/check-mcp-pins.ts`.
 *
 * This gate is the only thing stopping an MCP server from going back to
 * `@latest`. Nothing else notices: the configs are not compiled, not linted,
 * and not type-checked, and a floating tag looks exactly like a pinned one
 * until the day a bad version is published. The failure it guards against is
 * silent by construction, so these tests are the only protection it has.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkMcpPins, splitPackageSpec } from '@/scripts/check-mcp-pins';

type ServerEntry = Record<string, unknown>;

interface FixtureOptions {
  /** Entries for `.mcp.json`. Omit for a single valid pinned server. */
  mcpServers?: Record<string, ServerEntry>;
  /** Entries for `.vscode/mcp.json`. */
  vscodeServers?: Record<string, ServerEntry>;
  /** Write these raw strings instead of serialising the objects above. */
  rawMcpJson?: string;
  /** Skip creating these files entirely. */
  omitFiles?: string[];
}

const pinned = (spec: string): ServerEntry => ({
  command: 'bunx',
  args: ['--bun', '-y', spec],
});

const localBinary: ServerEntry = {
  command: './node_modules/.bin/adrkit-mcp',
  args: ['--cwd', '.', '--dir', 'docs/adr'],
};

function makeFixture(options: FixtureOptions = {}): string {
  const {
    mcpServers = { pinned: pinned('some-pkg@1.2.3') },
    omitFiles = [],
    rawMcpJson,
    vscodeServers = { adrkit: localBinary },
  } = options;

  const root = mkdtempSync(path.join(tmpdir(), 'mcp-pins-'));

  const write = (relative: string, contents: string) => {
    if (omitFiles.includes(relative)) return;
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents, 'utf8');
  };

  write('.mcp.json', rawMcpJson ?? JSON.stringify({ mcpServers }, null, 2));
  write(
    path.join('.vscode', 'mcp.json'),
    JSON.stringify({ servers: vscodeServers }, null, 2),
  );

  return root;
}

function withFixture(
  options: FixtureOptions,
  assert: (result: ReturnType<typeof checkMcpPins>) => void,
): void {
  const root = makeFixture(options);
  try {
    assert(checkMcpPins(root));
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

describe('check-mcp-pins', () => {
  it('passes a config where every server is pinned or local', () => {
    withFixture({}, (result) => {
      expect(result.failures).toEqual([]);
      expect(result.serverCount).toBe(2);
    });
  });

  describe('floating specifiers', () => {
    it.each(['@latest', '@next', '@beta'])('rejects the dist-tag %s', (tag) => {
      withFixture(
        { mcpServers: { drifty: pinned(`some-pkg${tag}`) } },
        (result) => {
          expect(result.failures).toHaveLength(1);
          expect(result.failures[0].message).toContain('a floating tag');
          expect(result.failures[0].server).toBe('drifty');
        },
      );
    });

    it.each(['^2', '~1.2.0', '>=1.0.0', '2.x', '*', '2'])(
      'rejects the range %s',
      (range) => {
        withFixture(
          { mcpServers: { ranged: pinned(`some-pkg@${range}`) } },
          (result) => {
            expect(result.failures).toHaveLength(1);
            expect(result.failures[0].message).toContain('a version range');
          },
        );
      },
    );

    it('rejects a package with no version at all', () => {
      withFixture({ mcpServers: { bare: pinned('some-pkg') } }, (result) => {
        expect(result.failures[0].message).toContain('with no version');
      });
    });

    it('rejects a launcher invoked with no package specifier', () => {
      withFixture(
        { mcpServers: { empty: { command: 'bunx', args: ['--bun', '-y'] } } },
        (result) => {
          expect(result.failures[0].message).toContain('no package specifier');
        },
      );
    });

    it.each(['npx', 'pnpx'])('checks %s as well as bunx', (launcher) => {
      withFixture(
        { mcpServers: { other: { command: launcher, args: ['-y', 'some-pkg@latest'] } } },
        (result) => {
          expect(result.failures).toHaveLength(1);
        },
      );
    });

    it.each([
      ['bun', 'x'],
      ['npm', 'exec'],
      ['pnpm', 'dlx'],
      ['yarn', 'dlx'],
    ])('checks the %s %s subcommand form', (command, subcommand) => {
      withFixture(
        {
          mcpServers: {
            sub: { command, args: [subcommand, 'some-pkg@latest'] },
          },
        },
        (result) => {
          expect(result.failures).toHaveLength(1);
          expect(result.failures[0].message).toContain('a floating tag');
        },
      );
    });

    it.each([
      ['bun', ['--bun', 'x', 'some-pkg@latest']],
      ['bun', ['--silent', 'x', 'some-pkg@latest']],
      ['npm', ['--yes', 'exec', 'some-pkg@latest']],
      ['pnpm', ['--silent', 'dlx', 'some-pkg@latest']],
    ] as const)(
      'still checks %s when a global flag precedes the subcommand',
      (command, args) => {
        // Both bun and npm accept global flags before the subcommand, so
        // neither it nor the package spec sits at a fixed index. Reading either
        // positionally made `bun --bun x pkg@latest` skip the check entirely --
        // and `--bun` is the flag already used by every bunx entry in
        // .mcp.json, so that is the most plausible way to write it.
        withFixture({ mcpServers: { flagged: { command, args: [...args] } } }, (result) => {
          expect(result.failures).toHaveLength(1);
          expect(result.failures[0].message).toContain('a floating tag');
        });
      },
    );

    it.each(['bunx.cmd', 'npx.CMD', 'bunx.exe'])(
      'checks the Windows shim %s',
      (command) => {
        withFixture(
          { mcpServers: { win: { command, args: ['-y', 'some-pkg@latest'] } } },
          (result) => {
            expect(result.failures).toHaveLength(1);
          },
        );
      },
    );

    it('does not mistake `bun run <script>` for a registry fetch', () => {
      // `bun` only launches from the registry as `bun x`. Treating a bare
      // `bun run` as one would report the script name as an unpinned package.
      withFixture(
        { mcpServers: { script: { command: 'bun', args: ['run', 'serve-mcp'] } } },
        (result) => {
          expect(result.failures).toEqual([]);
        },
      );
    });
  });

  describe('accepted shapes', () => {
    it('accepts an exact version', () => {
      withFixture({ mcpServers: { ok: pinned('some-pkg@1.2.3') } }, (result) => {
        expect(result.failures).toEqual([]);
      });
    });

    it('accepts an exact prerelease version', () => {
      // @playwright/mcp depends on alpha builds, so a pin can legitimately
      // carry a prerelease suffix. It is still exact.
      withFixture(
        { mcpServers: { alpha: pinned('some-pkg@1.63.0-alpha-2026-08-05') } },
        (result) => {
          expect(result.failures).toEqual([]);
        },
      );
    });

    it('accepts a scoped package, splitting on the last @', () => {
      withFixture({ mcpServers: { scoped: pinned('@scope/pkg@1.2.3') } }, (result) => {
        expect(result.failures).toEqual([]);
      });
    });

    it('accepts a local binary regardless of its args', () => {
      withFixture({ mcpServers: { local: localBinary } }, (result) => {
        expect(result.failures).toEqual([]);
      });
    });

    it('accepts a local binary whose name is also a launcher name', () => {
      // Distinguishes the local-binary branch from the "not a launcher" branch:
      // both return without a failure, so a test using a name like
      // `adrkit-mcp` passes even if isLocalBinary always returned false. Here
      // the basename *is* a launcher, so only the local-binary check can
      // explain the pass -- and the bare form below must still fail.
      withFixture(
        { mcpServers: { shadow: { command: './node_modules/.bin/npx', args: ['some-pkg@latest'] } } },
        (result) => {
          expect(result.failures).toEqual([]);
        },
      );

      withFixture(
        { mcpServers: { shadow: { command: 'npx', args: ['some-pkg@latest'] } } },
        (result) => {
          expect(result.failures).toHaveLength(1);
        },
      );
    });

    it('accepts a workspace-variable path to a local binary', () => {
      withFixture(
        {
          mcpServers: {
            local: { command: '${workspaceFolder}/node_modules/.bin/adrkit-mcp' },
          },
        },
        (result) => {
          expect(result.failures).toEqual([]);
        },
      );
    });

    it('ignores a server with no command, such as a remote entry', () => {
      withFixture(
        { mcpServers: { remote: { url: 'https://example.invalid/mcp' } } },
        (result) => {
          expect(result.failures).toEqual([]);
          expect(result.serverCount).toBe(2);
        },
      );
    });

    it('ignores an executable that is not a registry launcher', () => {
      withFixture(
        { mcpServers: { sys: { command: '/usr/bin/some-daemon', args: ['--serve'] } } },
        (result) => {
          expect(result.failures).toEqual([]);
        },
      );
    });
  });

  describe('malformed input', () => {
    it('reports invalid JSON rather than throwing', () => {
      withFixture({ rawMcpJson: '{ not json' }, (result) => {
        expect(result.failures[0].message).toContain('is not valid JSON');
      });
    });

    it('fails when the server map key is missing', () => {
      // If the config format ever changes, silently finding no servers would
      // turn this into a gate that passes because it checked nothing.
      withFixture({ rawMcpJson: '{"somethingElse":{}}' }, (result) => {
        expect(result.failures[0].message).toContain('has no `mcpServers` object');
      });
    });

    it('reports a server entry that is not an object', () => {
      withFixture({ rawMcpJson: '{"mcpServers":{"weird":"bunx"}}' }, (result) => {
        expect(result.failures[0].message).toContain('is not an object');
      });
    });

    it('fails when a known config file is missing', () => {
      // Skipping it would let servers be moved into a config this gate does
      // not know about, going back to unchecked while CI stayed green.
      withFixture({ omitFiles: ['.mcp.json'] }, (result) => {
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0].message).toContain('is missing');
        expect(result.serverCount).toBe(1);
      });
    });
  });

  describe('splitPackageSpec', () => {
    it.each([
      ['some-pkg@1.2.3', 'some-pkg', '1.2.3'],
      ['@scope/pkg@1.2.3', '@scope/pkg', '1.2.3'],
      ['@scope/pkg@latest', '@scope/pkg', 'latest'],
    ])('splits %s', (spec, name, version) => {
      expect(splitPackageSpec(spec)).toEqual({ name, version });
    });

    it.each(['some-pkg', '@scope/pkg'])('reports %s as unversioned', (spec) => {
      expect(splitPackageSpec(spec).version).toBeNull();
    });
  });

  it('reports the real repository configs as compliant', () => {
    const result = checkMcpPins(process.cwd());
    expect(result.failures).toEqual([]);
    expect(result.serverCount).toBeGreaterThanOrEqual(5);
  });
});
