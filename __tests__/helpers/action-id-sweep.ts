/**
 * Building blocks for the server action identifier sweep
 * (`__tests__/lib/actions/action-id-sweep.test.ts`).
 */

const MARKER = Symbol("identifier argument");

type MarkerKind = "id" | "idList" | "slug" | "hexToken" | "shareToken";
export type Marker = { readonly [MARKER]: MarkerKind };

const marker = (kind: MarkerKind): Marker => ({ [MARKER]: kind });

/** A single entity id (cuid). */
export const ID = marker("id");
/** A list of entity ids. */
export const ID_LIST = marker("idList");
/** A URL slug. */
export const SLUG = marker("slug");
/** A 64-character hex token. */
export const HEX_TOKEN = marker("hexToken");
/** A 43-character base64url token. */
export const SHARE_TOKEN = marker("shareToken");

export type ArgTemplate = unknown[];

function isMarker(value: unknown): value is Marker {
  return typeof value === "object" && value !== null && MARKER in value;
}

/** Non-cuid string sentinels, one per kind, easy to search for in recorded calls. */
export const MALFORMED_STRINGS: Record<MarkerKind, string> = {
  id: "not-a-cuid",
  idList: "not-a-cuid",
  slug: "Not A Slug!",
  hexToken: "not-a-hex-token",
  shareToken: "not a share token",
};

let validCounter = 0;
function validValue(kind: MarkerKind): unknown {
  validCounter += 1;
  const n = String(validCounter).padStart(4, "0");
  switch (kind) {
    case "id":
      return `clsweep000000000000000${n}`;
    case "idList":
      return [`clsweeplist0000000000${n}`];
    case "slug":
      return `sample-slug-${n}`;
    case "hexToken":
      return "a".repeat(60) + n.replace(/\D/g, "0");
    case "shareToken":
      return "A".repeat(39) + n;
  }
}

/** The malformed values for one identifier position. */
export function malformedValues(kind: MarkerKind): Array<[string, unknown]> {
  const sentinel = MALFORMED_STRINGS[kind];
  const values: Array<[string, unknown]> = [
    ["a filter object", { not: "x" }],
    ["an empty in-list filter", { in: [] }],
    ["an array", ["a"]],
    ["undefined", undefined],
    ["a malformed string", sentinel],
  ];
  if (kind === "idList") {
    values.push(["a list holding a filter object", [{ not: "x" }]]);
    values.push(["a list holding a malformed string", [sentinel]]);
  }
  return values;
}

type Path = Array<string | number>;

function collectMarkers(value: unknown, path: Path, out: Array<{ path: Path; kind: MarkerKind }>) {
  if (isMarker(value)) {
    out.push({ path, kind: value[MARKER] });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectMarkers(entry, [...path, index], out));
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) collectMarkers(child, [...path, key], out);
  }
}

/** Every identifier position in a template, as a path into the argument list. */
export function markerPositions(template: ArgTemplate): Array<{ path: Path; kind: MarkerKind }> {
  const out: Array<{ path: Path; kind: MarkerKind }> = [];
  collectMarkers(template, [], out);
  return out;
}

/**
 * Materialise a template: the marker at `target` becomes `bad`, every other
 * marker a well-formed value.
 */
export function buildArgs(template: ArgTemplate, target: Path, bad: unknown): unknown[] {
  const build = (value: unknown, path: Path): unknown => {
    if (isMarker(value)) {
      return path.length === target.length && path.every((p, i) => p === target[i])
        ? bad
        : validValue(value[MARKER]);
    }
    if (Array.isArray(value)) return value.map((entry, index) => build(entry, [...path, index]));
    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, build(v, [...path, k])]));
    }
    return value;
  };
  return build(template, []) as unknown[];
}

/** Whether `needle` (by identity, or by equality for strings) occurs anywhere inside `haystack`. */
export function containsValue(haystack: unknown, needle: unknown, seen = new Set<unknown>()): boolean {
  if (haystack === needle) return true;
  if (typeof haystack !== "object" || haystack === null || seen.has(haystack)) return false;
  seen.add(haystack);
  if (haystack instanceof Date) return false;
  const children = Array.isArray(haystack) ? haystack : Object.values(haystack);
  return children.some((child) => containsValue(child, needle, seen));
}

const CUID = /^c[^\s-]{8,}$/i;
const ID_KEY = /^(id|[A-Za-z]+Id)$/;
/** Id-named columns that do not hold entity ids. */
const NON_ENTITY_ID_KEYS = new Set([
  "usahMemberId",
  "stripeAccountId",
  "stripeCheckoutSessionId",
  "stripePaymentIntentId",
  "stripeRefundId",
  "providerAccountId",
]);

function isWellFormedIdValue(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === "string") return CUID.test(value);
  if (typeof value === "object" && !Array.isArray(value)) {
    // A Prisma filter built by the action itself, such as `{ in: ids }` or
    // `{ not: null }`: every operand must itself be well formed.
    const operands = Object.values(value as Record<string, unknown>);
    return operands.every((operand) =>
      Array.isArray(operand) ? operand.every(isWellFormedIdValue) : isWellFormedIdValue(operand),
    );
  }
  return false;
}

/**
 * Walk the `where` clauses (and compound unique keys) of recorded Prisma calls
 * and return id fields whose value is not a well-formed id, null, or a filter
 * of well-formed ids.
 */
export function malformedIdFields(calls: Array<{ model: string; method: string; args: unknown[] }>): string[] {
  const problems: string[] = [];
  const scanWhere = (value: unknown, path: string) => {
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((entry, i) => scanWhere(entry, `${path}.${i}`));
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;
      if (ID_KEY.test(key) && !NON_ENTITY_ID_KEYS.has(key)) {
        if (!isWellFormedIdValue(child)) problems.push(childPath);
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
