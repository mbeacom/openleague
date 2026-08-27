# Copilot cloud agent — MCP configuration

> **This file is documentation, not configuration.** GitHub does not read it.
> The cloud agent's MCP servers are a **repository setting**, entered through
> the GitHub web UI, with no supporting file format and no REST API. This file
> exists so the intended value is version-controlled, reviewable, and
> reproducible if the setting is ever lost or changed.

Applies to **Copilot cloud agent** (the coding agent that opens pull requests)
and **Copilot code review**, which share one repository-level MCP configuration.
It does **not** affect local editors — those read `.mcp.json` (Copilot CLI /
Claude Code) and `.vscode/mcp.json` (VS Code), both of which are committed and
work once `bun install` has run. Since #307 they launch the adrkit server from
`node_modules/.bin`, so in a fresh clone or a new worktree the server does not
start until dependencies are installed. That is deliberate: failing closed is
the point of a supply-chain control, and the alternative — falling back to a
registry fetch — is the behaviour being removed.

## Applying it

1. Repository **Settings** → **Copilot** → **MCP servers**
2. Paste the JSON below into "MCP configuration"
3. **Save MCP configuration** (GitHub validates the syntax)

No secrets or variables are required — the adrkit server is offline and
unauthenticated, so there is nothing to add under `COPILOT_MCP_*`.

## The configuration

```json
{
  "mcpServers": {
    "adrkit": {
      "type": "local",
      "command": "npx",
      "args": ["-y", "@adrkit/mcp@0.12.0", "--dir", "docs/adr"],
      "tools": [
        "get_decision",
        "get_decision_context",
        "list_superseded",
        "search_decisions"
      ]
    }
  }
}
```

The GitHub and Playwright MCP servers are enabled by default and do not need to
be listed. If other servers are added later, they belong in this same
`mcpServers` object — keep this file in sync with the whole blob, not just the
adrkit entry.

## Why it is written this way

**`npx`, not `bunx`.** The repository standardizes on Bun
([ADR-0005](../docs/adr/0005-standardize-on-bun-as-the-development-and-ci-toolchain.md)),
but Bun is not preinstalled on the agent's runner and this repository has no
`copilot-setup-steps.yml` to install it. Node is always present. Using `npx`
also keeps the server independent of whether `bun install` has run — it needs no
`node_modules`, so it cannot be broken by install ordering.

**A registry fetch, unlike the local configs — and this one cannot be fixed.**
`.mcp.json` and `.vscode/mcp.json` no longer fetch this package at all. They run
`node_modules/.bin/adrkit-mcp` from a pinned devDependency, so locally the server
is covered by `bun.lock`'s integrity hash and by the three-day
`minimumReleaseAge` quarantine in `bunfig.toml` (#307).

**This config cannot do that, and the gap is real rather than theoretical.** The
setting may be evaluated before or independently of `bun install`, so
`./node_modules/.bin/...` would resolve to nothing and the server would simply
fail to start — including for Copilot code review, which does not run the
repository's install step at all. So this entry still resolves `@adrkit/mcp` from
the npm registry at process start, outside the lockfile and outside the
quarantine. If that exact version were ever replaced on npm, the next cloud agent
run would execute the replacement, autonomously, with repository access.

The exact-version pin below is the only control available here, and it is a real
one: npm forbids republishing a version that already exists and restricts
unpublishing, so an attacker needs a registry-level replacement rather than just
a new publish. That is the difference between this and a `@latest` entry — but it
is *not* equivalent to what the local configs now have. Do not read the two as
being in sync; they deliberately differ, and `bun run adr:check-integrity`
enforces both shapes separately so neither can silently drift into the other.

This gap closes only if the agent runner gains a dependable pre-install step
(`copilot-setup-steps.yml` installing Bun and running `bun install`), at which
point this entry can move to the local binary like the other two.

**Pinned to `@0.12.0`.** Matches the `@adrkit/cli` and `@adrkit/mcp` pins in
`package.json` and the commit-pinned CI action, per
[ADR-0001](../docs/adr/0001-record-architecture-decisions-as-versioned-markdown-in-git.md).
An agent given a floating `@latest` would silently change behaviour on an
upstream release. Bump this at the same time as the others —
`bun run adr:check-integrity` fails if they disagree.

**An explicit `tools` allowlist rather than `*`.** The agent uses these tools
autonomously without asking, so GitHub recommends allowlisting read-only tools.
All four adrkit tools are read-only (each reports `readOnlyHint: true`, and the
server holds no write path at all), so all four are listed. Naming them rather
than globbing means a future adrkit version that adds a writing tool cannot pick
up the permission silently.

**No `--cwd`.** The flag defaults to `process.cwd()`, which is the repository
root in the agent environment. It cannot be set from here to something better:
the config only supports substituting `COPILOT_MCP_`-prefixed variables, so
`$GITHUB_WORKSPACE` is not available, and hard-coding a runner path would be
brittle and wrong for code review. This fails loudly rather than silently — if
the working directory is not a Git worktree the server reports
`Configured repository root is not a Git worktree.` If that ever appears in a
session log, set `ADRKIT_MCP_CWD` to a literal path under `env`.

## Verifying it works

**Saving is not the same as working, and the difference is invisible by
default.** A server that never loaded and a server that loaded and matched
nothing both show up as an agent that simply did not mention any decisions. So
this step is required, not optional.

After saving, start a cloud agent task on any change under `lib/actions/`,
`prisma/`, `lib/theme.ts`, or `bunfig.toml`, and check the session log for an
`adrkit` tool call. A working server returns the governing decision; a
misconfigured one says it could not see the corpus. adrkit deliberately renders
those two cases as different messages, so "no decisions govern this" and "I was
looking in the wrong place" cannot be confused.

Expected on a working setup: 5 records in the corpus, `lib/theme.ts` governed by
ADR-0004, and `lib/actions/**` governed by ADR-0002 and ADR-0003.

This cannot be checked from a local session — the setting only affects the cloud
agent and Copilot code review, and neither exposes an API for reading it back.
ADR-0001 carries an open action item until someone has observed the tool call.

Locally, the same corpus is reachable with `bun run adr:explain <path>`. That
exercises the CLI, not this setting, so it is not a substitute.

## Related

- [`docs/adr/README.md`](../docs/adr/README.md) — the corpus and its workflow
- [`.mcp.json`](../.mcp.json) / [`.vscode/mcp.json`](../.vscode/mcp.json) — local editor equivalents, which run the pinned local binary rather than fetching
- [ADR-0005](../docs/adr/0005-standardize-on-bun-as-the-development-and-ci-toolchain.md) — the MCP-launch supply-chain policy and the gap recorded above
- [Configure MCP servers for your repository](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers)
