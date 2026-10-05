import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MALFORMED_STRINGS,
  buildArgs,
  buildValidArgs,
  containsValue,
  sweepValuesIn,
  templatesOf,
  malformedIdFields,
  malformedValues,
  markerPositions,
} from "@/__tests__/helpers/action-id-sweep";
import { hashToken } from "@/lib/auth/tokens";
import {
  ACTION_ID_ARGUMENTS,
  NO_ID_ARGUMENTS,
  VALID_TEMPLATE_EXEMPTIONS,
} from "@/__tests__/helpers/action-id-sweep-table";

/**
 * Calls every identifier-taking export of every "use server" module with
 * malformed values in each identifier position, and checks that the value
 * never reaches a Prisma query or an authorization helper.
 *
 * Scope and limits:
 * - Server actions are expected only as whole "use server" modules under
 *   lib/actions. A repository scan (app, lib, components) fails if a
 *   directive appears anywhere else, including inside a function body.
 * - The mocked Prisma client returns empty results and the session user has
 *   no memberships, so an action usually stops at its first lookup or
 *   refusal. The sweep therefore checks the arguments that reach Prisma or
 *   an authorization helper first; ids consulted only after a successful
 *   lookup are not exercised here.
 * - Templates list only identifier fields. For object inputs a schema often
 *   rejects the call for a missing field first, which still satisfies the
 *   checks below but does not show that a particular field is format-checked;
 *   the per-action tests pin those results.
 * - A malformed value is recognised by identity (objects and arrays) or by
 *   its sentinel string, plus a scan of id columns in `where` clauses that
 *   accepts only well-formed ids, null, or single-value filters of them. List
 *   filters (`in` / `notIn`) on an id column are reported, so an action that
 *   legitimately reaches one with these mocks needs an explicit exemption.
 * - For `undefined`, only the Prisma side is checked: authorization helpers
 *   have optional parameters where undefined is legitimate.
 */

const { recorder, authCalls, spyOnModule } = await vi.hoisted(async () => {
  const { createPrismaRecorder } = await import("@/__tests__/helpers/prisma-recorder");
  const authCalls: Array<{ helper: string; args: unknown[] }> = [];
  const isClass = (fn: unknown) =>
    typeof fn === "function" && /^class[\s{]/.test(Function.prototype.toString.call(fn));
  /**
   * Pure content checks that run on the raw input before the schema parse and
   * make no lookups; they are not authorization helpers.
   */
  const notAuthorizationHelpers = new Set(["security.validateLeagueOperationData"]);
  /** Wrap every function export so its calls are recorded, then call through. */
  const spyOnModule = (name: string, mod: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(mod).map(([key, value]) => {
        if (typeof value !== "function" || isClass(value)) return [key, value];
        if (notAuthorizationHelpers.has(`${name}.${key}`)) return [key, value];
        const original = value as (...args: unknown[]) => unknown;
        return [
          key,
          (...args: unknown[]) => {
            authCalls.push({ helper: `${name}.${key}`, args });
            return original(...args);
          },
        ];
      }),
    );
  return { recorder: createPrismaRecorder(), authCalls, spyOnModule };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: recorder.prisma }));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "clsweepuser000000000000001", email: "sweep@example.com" } })),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined })),
}));
vi.mock("@/lib/email/client", () => ({ sendEmail: vi.fn(async () => undefined) }));
// Uploads and online payments report themselves configured, so the actions
// behind them get as far as their lookups.
vi.mock("@/lib/media/blob", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media/blob")>()),
  isBlobEnabled: () => true,
}));
vi.mock("@/lib/payments/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments/stripe")>()),
  isStripeEnabled: () => true,
}));

vi.mock("@/lib/auth/session", async (importOriginal) =>
  spyOnModule("session", await importOriginal()),
);
vi.mock("@/lib/auth/capabilities", async (importOriginal) =>
  spyOnModule("capabilities", await importOriginal()),
);
vi.mock("@/lib/utils/permissions", async (importOriginal) =>
  spyOnModule("permissions", await importOriginal()),
);
vi.mock("@/lib/utils/security", async (importOriginal) =>
  spyOnModule("security", await importOriginal()),
);
vi.mock("@/lib/auth/league-access", async (importOriginal) =>
  spyOnModule("league-access", await importOriginal()),
);
vi.mock("@/lib/auth/branding-access", async (importOriginal) =>
  spyOnModule("branding-access", await importOriginal()),
);
vi.mock("@/lib/auth/venue-access", async (importOriginal) =>
  spyOnModule("venue-access", await importOriginal()),
);
vi.mock("@/lib/auth/team-access", async (importOriginal) =>
  spyOnModule("team-access", await importOriginal()),
);
vi.mock("@/lib/auth/season-access", async (importOriginal) =>
  spyOnModule("season-access", await importOriginal()),
);

const REPO_ROOT = path.resolve(__dirname, "../../..");
const ACTIONS_DIR = path.join(REPO_ROOT, "lib/actions");

/** A directive statement on a line of its own, at file or function level. */
const DIRECTIVE_LINE = /^\s*["']use server["'];?\s*$/m;

/** Whether the directive is the module's first statement (after comments). */
function hasFileLevelDirective(source: string): boolean {
  const body = source.replace(/^(?:\s+|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
  return /^["']use server["']/.test(body);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "node_modules" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

/** Every file in app, lib and components containing a "use server" directive. */
const directiveFiles = ["app", "lib", "components"]
  .flatMap((dir) => sourceFiles(path.join(REPO_ROOT, dir)))
  .filter((file) => DIRECTIVE_LINE.test(readFileSync(file, "utf8")))
  .map((file) => path.relative(REPO_ROOT, file).split(path.sep).join("/"))
  .sort();

/** The "use server" modules under lib/actions, by file name without extension. */
const serverActionModules = sourceFiles(ACTIONS_DIR)
  .filter((file) => hasFileLevelDirective(readFileSync(file, "utf8")))
  .map((file) => path.relative(ACTIONS_DIR, file).split(path.sep).join("/").replace(/\.tsx?$/, ""))
  .sort();

const modules = Object.fromEntries(
  await Promise.all(
    serverActionModules.map(async (name) => [
      name,
      (await import(`../../../lib/actions/${name}.ts`)) as Record<string, unknown>,
    ]),
  ),
) as Record<string, Record<string, unknown>>;

const exportedActions = Object.entries(modules)
  .flatMap(([name, mod]) =>
    Object.entries(mod)
      .filter(([, value]) => typeof value === "function")
      .map(([exportName]) => `${name}#${exportName}`),
  )
  .sort();

beforeEach(() => {
  recorder.reset();
  authCalls.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("server action id sweep: coverage", () => {
  it("finds the server action modules", () => {
    expect(serverActionModules.length).toBeGreaterThan(50);
  });

  it("finds the 'use server' directive only as the first statement of modules under lib/actions", () => {
    expect(directiveFiles.filter((file) => !file.startsWith("lib/actions/"))).toEqual([]);
    expect(
      directiveFiles.filter((file) => !hasFileLevelDirective(readFileSync(path.join(REPO_ROOT, file), "utf8"))),
    ).toEqual([]);
    expect(directiveFiles).toEqual(serverActionModules.map((name) => `lib/actions/${name}.ts`).sort());
  });

  it("lists every exported server action in the id table or the no-id allowlist", () => {
    const listed = new Set([...Object.keys(ACTION_ID_ARGUMENTS), ...Object.keys(NO_ID_ARGUMENTS)]);
    expect(exportedActions.filter((key) => !listed.has(key))).toEqual([]);
  });

  it("has no stale or duplicated entries", () => {
    const exported = new Set(exportedActions);
    expect(Object.keys(ACTION_ID_ARGUMENTS).filter((key) => !exported.has(key))).toEqual([]);
    expect(Object.keys(NO_ID_ARGUMENTS).filter((key) => !exported.has(key))).toEqual([]);
    expect(Object.keys(ACTION_ID_ARGUMENTS).filter((key) => key in NO_ID_ARGUMENTS)).toEqual([]);
  });

  it("gives every table template at least one identifier position", () => {
    expect(
      Object.entries(ACTION_ID_ARGUMENTS)
        .filter(([, entry]) => templatesOf(entry).some((template) => markerPositions(template).length === 0))
        .map(([key]) => key),
    ).toEqual([]);
  });
});

/** Every table template, labelled with its variant when an entry has several. */
const templates = Object.entries(ACTION_ID_ARGUMENTS).flatMap(([key, entry]) => {
  const list = templatesOf(entry);
  return list.map((template, index) => ({
    key,
    template,
    label: list.length > 1 ? `${key} (variant ${index + 1})` : key,
  }));
});

const sweepCases = templates.flatMap(({ key, template, label: templateLabel }) =>
  markerPositions(template).flatMap(({ path: position, kind }) =>
    malformedValues(kind).map(([label, bad]) => ({
      key,
      template,
      position,
      kind,
      label,
      bad,
      name: `${templateLabel} [${position.join(".")}] with ${label}`,
    })),
  ),
);

describe("server action id sweep: templates are complete", () => {
  // With every marker well formed, the call must get past input validation
  // and use one of those values in a query or an authorization check; a
  // template missing a required field would otherwise fail validation first
  // and make every malformed-value case below pass without reaching the
  // identifier handling.
  for (const { key, template, label } of templates) {
    if (key in VALID_TEMPLATE_EXEMPTIONS) continue;
    it(`${label} gets past validation with well-formed values`, async () => {
      const [moduleName, exportName] = key.split("#");
      const action = modules[moduleName][exportName] as (...args: unknown[]) => Promise<unknown>;
      const args = buildValidArgs(template);
      // Tokens are looked up by their hash, so count the hash as a use too.
      const values = sweepValuesIn(args).flatMap((value) => [value, hashToken(value)]);
      try {
        await action(...args);
      } catch {
        // Only whether the values were used matters here.
      }
      const usedIn = (callArgs: unknown) => values.some((value) => containsValue(callArgs, value));
      const used = recorder.calls.some((call) => usedIn(call.args)) || authCalls.some((call) => usedIn(call.args));
      expect(used).toBe(true);
    });
  }

  it("lists exemptions only for table entries", () => {
    expect(Object.keys(VALID_TEMPLATE_EXEMPTIONS).filter((key) => !(key in ACTION_ID_ARGUMENTS))).toEqual([]);
  });
});

describe("server action id sweep", () => {
  for (const { key, template, position, kind, bad, name } of sweepCases) it(name, async () => {
    const [moduleName, exportName] = key.split("#");
    const action = modules[moduleName]?.[exportName] as ((...args: unknown[]) => Promise<unknown>) | undefined;
    expect(typeof action).toBe("function");

    const args = buildArgs(template, position, bad);
    try {
      await action!(...args);
    } catch {
      // A refusal may be a thrown error; only what reached Prisma or an
      // authorization helper matters here.
    }

    const sentinel = MALFORMED_STRINGS[kind];
    const isObject = typeof bad === "object" && bad !== null;
    const reached = (value: unknown) =>
      (isObject && containsValue(value, bad)) || containsValue(value, sentinel);

    expect(recorder.calls.filter((call) => reached(call.args)).map((c) => `${c.model}.${c.method}`)).toEqual([]);
    expect(malformedIdFields(recorder.calls)).toEqual([]);
    expect(authCalls.filter((call) => reached(call.args)).map((c) => c.helper)).toEqual([]);
  });
});
