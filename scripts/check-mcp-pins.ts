/**
 * Enforces the MCP-launch supply-chain policy recorded in ADR-0005.
 *
 * `bunfig.toml` quarantines newly published npm versions for three days, but
 * that control operates on `bun install` -- it covers what is in `bun.lock` and
 * nothing else. An MCP server launched as `bunx -y pkg@latest` resolves from the
 * registry at process start, so it gets neither the quarantine nor the
 * lockfile's integrity hash. Agents invoke these tools autonomously with
 * repository access, so there is no human in the loop at the moment a fetched
 * version executes (#307).
 *
 * Two acceptable shapes, checked here:
 *
 *   1. A local binary out of `node_modules/.bin`. The package is a pinned
 *      devDependency, so it is in `bun.lock` with an integrity hash and it
 *      passed the quarantine. This is the full fix, and it fails *closed* --
 *      before `bun install` the server does not start, rather than silently
 *      falling back to a registry fetch the way a bare `bunx <bin>` would.
 *   2. A registry fetch at an exact `x.y.z`. This is weaker -- still no
 *      quarantine, still no lockfile integrity -- but it removes re-resolution.
 *      A floating `@latest` executes a malicious *publish* on the next launch;
 *      an exact pin requires replacing an already-published version, which npm
 *      forbids. ADR-0005 records which servers are deliberately left here and
 *      why vendoring them was judged the worse trade.
 *
 * A floating tag (`@latest`, `@next`), a range (`^2`, `~1.2`, `*`), or a bare
 * unpinned name is rejected.
 *
 * Like `check-raw-sql.ts` this depends on nothing outside node: builtins, so
 * its CI step cannot be defeated by a dependency or install failure, and it
 * makes no network calls -- a gate that needed the registry to be reachable
 * would fail open on exactly the day the registry was having a bad time.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** A committed MCP config, and the key its server map hangs off. */
interface ConfigSpec {
  file: string;
  /** `.mcp.json` uses `mcpServers`; `.vscode/mcp.json` uses `servers`. */
  key: string;
}

export const MCP_CONFIGS: ConfigSpec[] = [
  { file: '.mcp.json', key: 'mcpServers' },
  { file: path.join('.vscode', 'mcp.json'), key: 'servers' },
];

/** Launchers that fetch and run a package directly, with no subcommand. */
const DIRECT_LAUNCHERS = new Set(['bunx', 'npx', 'pnpx']);

/**
 * Launchers that only fetch from the registry in their subcommand form. Bare
 * `bun run <script>` or `pnpm run <script>` is not a registry fetch, and
 * treating it as one would report the script name as an unpinned package.
 */
const SUBCOMMAND_LAUNCHERS: Record<string, string> = {
  bun: 'x',
  npm: 'exec',
  pnpm: 'dlx',
  yarn: 'dlx',
};

/** An exact release: `1.2.3`, optionally with a prerelease or build suffix. */
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Semver range syntax: comparators, wildcards, hyphen ranges, unions, and
 * partial versions like `2` or `1.2`. Anything left over (`latest`, `next`,
 * `beta`) is a dist-tag. Only used to word the error message.
 */
const RANGE_SYNTAX = /^[\d^~><=*\s|.x X-]+$/;

function describeSpec(version: string): string {
  return RANGE_SYNTAX.test(version) ? 'a version range' : 'a floating tag';
}

export interface PinFailure {
  file: string;
  server: string;
  message: string;
}

export interface PinResult {
  failures: PinFailure[];
  /** Server entries examined across every config that exists. */
  serverCount: number;
}

/**
 * Split a package spec into name and version at the *last* `@`, so that a
 * scoped name keeps its leading one: `@scope/pkg@1.2.3` -> `@scope/pkg`, `1.2.3`.
 */
export function splitPackageSpec(spec: string): { name: string; version: string | null } {
  const at = spec.lastIndexOf('@');
  if (at <= 0) return { name: spec, version: null };
  return { name: spec.slice(0, at), version: spec.slice(at + 1) };
}

/** Does this command run a binary out of the local `node_modules`? */
function isLocalBinary(command: string): boolean {
  return command.replace(/\\/g, '/').includes('node_modules/.bin/');
}

/**
 * The launcher's bare name. Windows shims are `bunx.cmd` / `npx.cmd`, which
 * would otherwise not match and skip the check entirely.
 */
function launcherName(command: string): string {
  return path
    .basename(command.replace(/\\/g, '/'))
    .replace(/\.(cmd|exe|bat|ps1)$/i, '');
}

/**
 * Index of the first argument that is not a `-`-prefixed flag, at or after
 * `from`. Both `bun` and `npm` accept global flags *before* their subcommand
 * (`bun --bun x pkg`), so neither the subcommand nor the package spec can be
 * read from a fixed position.
 *
 * A flag that takes a separate value (`npx --package foo bar`) would have its
 * value read as the spec. No launcher used here does that before the package
 * name, and `--package foo` names a package anyway, so the spec still lands on
 * something worth checking.
 */
function firstNonFlag(args: string[], from = 0): number {
  for (let index = from; index < args.length; index += 1) {
    if (!args[index].startsWith('-')) return index;
  }
  return -1;
}

function checkServer(
  file: string,
  server: string,
  entry: unknown,
  fail: (message: string) => void,
): void {
  if (typeof entry !== 'object' || entry === null) {
    fail('is not an object.');
    return;
  }

  const { command, args } = entry as { command?: unknown; args?: unknown };

  if (typeof command !== 'string' || command.length === 0) {
    // A server with no command is either a remote (url/http) entry or
    // malformed. Neither launches a package from the registry, so there is
    // nothing for this gate to say about it.
    return;
  }

  if (isLocalBinary(command)) return;

  const base = launcherName(command);
  const list = Array.isArray(args) ? args.filter((a): a is string => typeof a === 'string') : [];

  let specIndex: number;
  const requiredSubcommand = SUBCOMMAND_LAUNCHERS[base];

  if (requiredSubcommand !== undefined) {
    const subcommand = firstNonFlag(list);
    // `bun run <script>`, `pnpm install`, etc. -- not a registry fetch.
    if (subcommand === -1 || list[subcommand] !== requiredSubcommand) return;
    specIndex = firstNonFlag(list, subcommand + 1);
  } else if (DIRECT_LAUNCHERS.has(base)) {
    specIndex = firstNonFlag(list);
  } else {
    // Some other executable -- a system binary, or a script in the repo. Out
    // of scope: this gate is about packages fetched from npm at launch.
    return;
  }

  const spec = specIndex === -1 ? undefined : list[specIndex];

  if (!spec) {
    fail(
      `launches with \`${base}\` but no package specifier was found in args. ` +
        'Pin it to an exact version, or run a local binary from node_modules/.bin.',
    );
    return;
  }

  const { name, version } = splitPackageSpec(spec);

  if (version === null) {
    fail(
      `fetches \`${name}\` with no version, so it re-resolves on every launch. ` +
        `Pin it (\`${name}@x.y.z\`), or add it as a devDependency and run ` +
        'node_modules/.bin/<binary>.',
    );
    return;
  }

  if (!EXACT_VERSION.test(version)) {
    const kind = describeSpec(version);
    fail(
      `fetches \`${name}@${version}\` -- ${kind}, so a new publish is executed on ` +
        'the next launch with no quarantine and no lockfile integrity. Pin an exact ' +
        `version (\`${name}@x.y.z\`), or add it as a devDependency and run ` +
        'node_modules/.bin/<binary>.',
    );
  }
}

/** Run the policy over a checkout and return every violation found. */
export function checkMcpPins(repoRoot: string): PinResult {
  const failures: PinFailure[] = [];
  let serverCount = 0;

  for (const { file, key } of MCP_CONFIGS) {
    const absolute = path.join(repoRoot, file);

    // Not skipped: moving servers into a config this gate does not know about
    // (`.cursor/mcp.json`, a split per-tool file) would otherwise leave it green
    // while the moved servers went back to being unchecked. Deleting a config
    // for real is fine -- remove it from MCP_CONFIGS in the same change, which
    // makes the decision visible in review.
    if (!existsSync(absolute)) {
      failures.push({
        file,
        server: '(file)',
        message:
          'is missing. If its servers moved elsewhere, add that config to ' +
          'MCP_CONFIGS in scripts/check-mcp-pins.ts; if it was removed, drop it ' +
          'from MCP_CONFIGS. Skipping it silently would stop this gate gating.',
      });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(absolute, 'utf8'));
    } catch (error) {
      failures.push({
        file,
        server: '(file)',
        message: `is not valid JSON: ${(error as Error).message}`,
      });
      continue;
    }

    const servers = (parsed as Record<string, unknown> | null)?.[key];
    if (typeof servers !== 'object' || servers === null) {
      failures.push({
        file,
        server: '(file)',
        message: `has no \`${key}\` object. If the config format changed, update MCP_CONFIGS in scripts/check-mcp-pins.ts -- otherwise this gate silently stops gating.`,
      });
      continue;
    }

    for (const [server, entry] of Object.entries(servers as Record<string, unknown>)) {
      serverCount += 1;
      checkServer(file, server, entry, (message) =>
        failures.push({ file, server, message }),
      );
    }
  }

  return { failures, serverCount };
}

function main(): void {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const { failures, serverCount } = checkMcpPins(repoRoot);

  if (failures.length > 0) {
    console.error('MCP pin check failed -- ADR-0005 requires each MCP server to be\n');
    console.error('  * run from node_modules/.bin (pinned devDependency, in bun.lock), or');
    console.error('  * fetched at an exact x.y.z version.\n');
    for (const { file, server, message } of failures) {
      console.error(`  - ${file} -> ${server} ${message}`);
    }
    console.error(
      '\nSee docs/adr/0005-standardize-on-bun-as-the-development-and-ci-toolchain.md.',
    );
    process.exit(1);
  }

  console.log(
    `MCP pin check OK: ${serverCount} server entr(ies) across ` +
      `${MCP_CONFIGS.length} config(s); each runs a local binary or an exact version.`,
  );
  console.log(
    'Reminder: the cloud agent MCP setting is a GitHub repository Settings value ' +
      'and cannot be checked here. See .github/copilot-cloud-agent-mcp.md.',
  );
}

// Bun sets this when the file is executed directly. Under Vitest it is
// undefined, so importing the helpers above does not run the CLI.
if (import.meta.main) main();
