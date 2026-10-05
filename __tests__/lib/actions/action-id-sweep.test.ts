import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MALFORMED_STRINGS,
  buildArgs,
  containsValue,
  malformedIdFields,
  malformedValues,
  markerPositions,
} from "@/__tests__/helpers/action-id-sweep";
import { ACTION_ID_ARGUMENTS, NO_ID_ARGUMENTS } from "@/__tests__/helpers/action-id-sweep-table";

/**
 * Calls every identifier-taking export of every "use server" module with
 * malformed values in each identifier position, and checks that the value
 * never reaches a Prisma query or an authorization helper.
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

const ACTIONS_DIR = path.resolve(__dirname, "../../../lib/actions");

/** The "use server" modules under lib/actions, by file name without extension. */
const serverActionModules = readdirSync(ACTIONS_DIR)
  .filter((file) => file.endsWith(".ts"))
  .filter((file) => /^\s*["']use server["']/.test(readFileSync(path.join(ACTIONS_DIR, file), "utf8")))
  .map((file) => file.replace(/\.ts$/, ""))
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

  it("gives every table entry at least one identifier position", () => {
    expect(
      Object.entries(ACTION_ID_ARGUMENTS)
        .filter(([, template]) => markerPositions(template).length === 0)
        .map(([key]) => key),
    ).toEqual([]);
  });
});

const sweepCases = Object.entries(ACTION_ID_ARGUMENTS).flatMap(([key, template]) =>
  markerPositions(template).flatMap(({ path: position, kind }) =>
    malformedValues(kind).map(([label, bad]) => ({
      key,
      template,
      position,
      kind,
      label,
      bad,
      name: `${key} [${position.join(".")}] with ${label}`,
    })),
  ),
);

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
