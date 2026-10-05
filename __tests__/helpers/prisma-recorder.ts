import { vi, type Mock } from "vitest";

/**
 * A Prisma client stand-in that lazily creates a `vi.fn()` for every
 * `prisma.<model>.<method>` touched and records each call, so a test can
 * assert on every query an action issued without enumerating models up front.
 *
 * Unconfigured methods resolve to an empty result for their method kind.
 */
export type RecordedCall = { model: string; method: string; args: unknown[] };

function emptyResult(method: string): unknown {
  if (method === "findMany" || method === "groupBy") return [];
  if (method === "count") return 0;
  if (method === "aggregate") return { _sum: {}, _count: {}, _avg: {}, _min: {}, _max: {} };
  if (method === "updateMany" || method === "deleteMany" || method === "createMany") return { count: 0 };
  return null;
}

export function createPrismaRecorder() {
  const calls: RecordedCall[] = [];
  const fns = new Map<string, Mock>();

  function fnFor(model: string, method: string): Mock {
    const key = `${model}.${method}`;
    let fn = fns.get(key);
    if (!fn) {
      fn = vi.fn(async () => emptyResult(method));
      const recorded = vi.fn(async (...args: unknown[]) => {
        calls.push({ model, method, args });
        return fn!(...args);
      });
      fns.set(key, fn);
      fns.set(`${key}#recorded`, recorded);
    }
    return fns.get(`${key}#recorded`)!;
  }

  const modelProxy = (model: string) =>
    new Proxy(
      {},
      {
        get(_target, method) {
          if (typeof method !== "string" || method === "then") return undefined;
          return fnFor(model, method);
        },
      }
    );

  const models = new Map<string, unknown>();
  const prisma: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== "string" || prop === "then") return undefined;
        if (prop === "$transaction") {
          return async (arg: unknown) => {
            if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(prisma);
            return Promise.all(arg as Promise<unknown>[]);
          };
        }
        if (!models.has(prop)) models.set(prop, modelProxy(prop));
        return models.get(prop);
      },
    }
  );

  return {
    prisma,
    calls,
    /** The underlying implementation mock for `model.method` (configure return values here). */
    mock(model: string, method: string): Mock {
      fnFor(model, method);
      return fns.get(`${model}.${method}`)!;
    },
    reset() {
      calls.length = 0;
      for (const [key, fn] of fns) {
        if (key.endsWith("#recorded")) continue;
        const method = key.split(".")[1];
        fn.mockReset();
        fn.mockImplementation(async () => emptyResult(method));
      }
    },
  };
}

export type PrismaRecorder = ReturnType<typeof createPrismaRecorder>;

/**
 * Field names treated as identifiers when scanning recorded where-clauses.
 * Compound unique keys (`userId_teamId`) are objects and are descended into.
 */
const ID_KEY = /^(id|[A-Za-z]+Id)$/;

function isStringInList(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.keys(value).length === 1 &&
    Array.isArray((value as { in?: unknown }).in) &&
    (value as { in: unknown[] }).in.every((entry) => typeof entry === "string")
  );
}

/**
 * Walk the `where` clauses of every recorded call and return id-like fields
 * whose value is neither a string, null, nor an `{ in: string[] }` list (for
 * example a filter object or undefined).
 */
export function nonStringIdArguments(calls: RecordedCall[]): string[] {
  const problems: string[] = [];
  const scanWhere = (value: unknown, path: string) => {
    if (value === null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;
      if (ID_KEY.test(key) && child !== null && typeof child !== "string" && !isStringInList(child)) {
        problems.push(childPath);
        continue;
      }
      scanWhere(child, childPath);
    }
  };
  const findWhere = (value: unknown, path: string) => {
    if (value === null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === "where") scanWhere(child, `${path}.where`);
      else findWhere(child, `${path}.${key}`);
    }
  };
  for (const call of calls) findWhere(call.args, `${call.model}.${call.method}`);
  return problems;
}

/** The malformed id values every guarded entry point must refuse. */
export const MALFORMED_IDS: Array<[string, unknown]> = [
  ["a filter object", { not: "x" }],
  ["an empty in-list filter", { in: [] }],
  ["an array", ["a"]],
  ["undefined", undefined],
  ["a non-cuid string", "t1"],
];

/** Well-formed cuid-shaped fixture ids. */
export const IDS = {
  user: "cluser00000000000000000001",
  user2: "cluser00000000000000000002",
  team: "clteam00000000000000000001",
  team2: "clteam00000000000000000002",
  league: "clleague000000000000000001",
  league2: "clleague000000000000000002",
  org: "clorg0000000000000000000001",
  org2: "clorg0000000000000000000002",
  venue: "clvenue00000000000000000001",
  venue2: "clvenue00000000000000000002",
  need: "clneed000000000000000000001",
} as const;
