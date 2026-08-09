import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import {
  blankComments,
  findViolations,
  scanRepository,
} from "@/scripts/check-raw-sql";

/**
 * Tests for the ADR-0003 raw-SQL gate (scripts/check-raw-sql.ts).
 *
 * Fixtures are assembled at runtime rather than written as literals, because
 * this file is inside the scanner's own scan scope and the scanner blanks
 * comments but deliberately NOT string literals -- a literal call site here
 * would be a genuine violation of the rule under test.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const DOT = String.fromCharCode(46);

/** `prisma.<helper>` in tagged-template position, e.g. a plain raw query. */
const tagged = (helper: string) =>
  `const rows = await prisma${DOT}${helper}\`SELECT 1\`;`;

/** `prisma.<helper>(...)` in call position, e.g. an unsafe query. */
const called = (helper: string) =>
  `const rows = await prisma${DOT}${helper}(statement);`;

/** `prisma["<helper>"](...)`, the computed form that hides the name in a string. */
const computed = (helper: string) =>
  `const rows = await prisma["${helper}"](statement);`;

const QUERY_RAW = `${"$"}queryRaw`;
const EXECUTE_RAW = `${"$"}executeRaw`;
const QUERY_RAW_UNSAFE = `${QUERY_RAW}Unsafe`;
const EXECUTE_RAW_UNSAFE = `${EXECUTE_RAW}Unsafe`;

const HEALTH_ROUTE = "app/api/health/route.ts";

describe("raw-SQL gate: plain $queryRaw / $executeRaw", () => {
  it("flags a raw query added under lib/", () => {
    const violations = findViolations("lib/actions/team.ts", tagged(QUERY_RAW));

    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("raw");
    expect(violations[0].line).toBe(1);
  });

  it("flags a raw statement under components/ and under app/", () => {
    expect(
      findViolations("components/features/roster/RosterList.tsx", tagged(EXECUTE_RAW)),
    ).toHaveLength(1);
    expect(
      findViolations("app/api/roster/export/route.ts", tagged(QUERY_RAW)),
    ).toHaveLength(1);
  });

  it("flags the computed form, which hides the helper name in a string", () => {
    expect(findViolations("lib/actions/team.ts", computed(QUERY_RAW))).toHaveLength(1);
  });

  it("allows the health check, the one documented exception", () => {
    expect(findViolations(HEALTH_ROUTE, tagged(QUERY_RAW))).toEqual([]);
  });

  it("scopes that exception to the path, not to the statement", () => {
    // The same source anywhere else is still a violation, so the exemption
    // cannot be borrowed by copying the health check's query elsewhere.
    const source = tagged(QUERY_RAW);

    expect(findViolations(HEALTH_ROUTE, source)).toEqual([]);
    expect(findViolations("app/api/health/other.ts", source)).toHaveLength(1);
  });

  it("leaves scripts/ alone: it is outside the deployed application", () => {
    expect(findViolations("scripts/check-cols.ts", tagged(QUERY_RAW))).toEqual([]);
    expect(findViolations("prisma/seed.ts", tagged(QUERY_RAW))).toEqual([]);
  });
});

describe("raw-SQL gate: $queryRawUnsafe / $executeRawUnsafe", () => {
  it("flags the unsafe helpers under lib/, where plain raw is also banned", () => {
    const violations = findViolations("lib/actions/team.ts", called(QUERY_RAW_UNSAFE));

    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("unsafe");
  });

  it("flags them in scripts/, which is exempt from the plain-raw rule only", () => {
    const violations = findViolations(
      "scripts/check-cols.ts",
      called(EXECUTE_RAW_UNSAFE),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("unsafe");
  });

  it("flags them in the health check: rule 2 has no exception anywhere", () => {
    const violations = findViolations(HEALTH_ROUTE, called(QUERY_RAW_UNSAFE));

    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("unsafe");
  });

  it("flags the computed form outside the restricted roots", () => {
    expect(
      findViolations("scripts/anything.ts", computed(QUERY_RAW_UNSAFE)),
    ).toHaveLength(1);
  });

  it("reports unsafe separately from plain raw rather than as one rule", () => {
    // `Raw` followed by `U` is not a word boundary, so the plain pattern must
    // not also claim an unsafe call site and mislabel the message.
    const violations = findViolations("lib/actions/team.ts", called(QUERY_RAW_UNSAFE));

    expect(violations.map((violation) => violation.rule)).toEqual(["unsafe"]);
  });
});

describe("raw-SQL gate: what must not be flagged", () => {
  it("ignores a mock property, which is not a call site", () => {
    const mock = `vi.mock("@/lib/db/prisma", () => ({ prisma: { ${QUERY_RAW}: vi.fn() } }));`;

    expect(findViolations("lib/actions/team.test.ts", mock)).toEqual([]);
  });

  it("ignores prose in comments that names a call site", () => {
    // Regression: the first run of this gate failed on a JSDoc line in
    // eslint.config.mjs describing the very pattern it matches.
    const lineComment = `// never write prisma${DOT}${QUERY_RAW_UNSAFE}(input) here`;
    const blockComment = `/** Matches prisma${DOT}${QUERY_RAW}\`...\` and prisma["${QUERY_RAW}"]. */`;

    expect(findViolations("lib/actions/team.ts", lineComment)).toEqual([]);
    expect(findViolations("lib/actions/team.ts", blockComment)).toEqual([]);
  });

  it("ignores an import path that merely contains the helper name", () => {
    const source = `import { prisma } from "@/lib/db/prisma";`;

    expect(findViolations("lib/actions/team.ts", source)).toEqual([]);
  });
});

describe("raw-SQL gate: comment blanking cannot be used to hide code", () => {
  it("does not treat // inside a string literal as a comment opener", () => {
    // Naive comment stripping would delete the rest of this line and miss the
    // call, which is the obvious way to smuggle one past a text-based gate.
    const source = `const url = "https://example.com"; ${called(QUERY_RAW_UNSAFE)}`;

    expect(findViolations("lib/actions/team.ts", source)).toHaveLength(1);
  });

  it("does not treat /* inside a regex literal as a block-comment opener", () => {
    // Otherwise everything up to the next */ -- potentially the rest of the
    // file -- would be blanked, taking real call sites with it.
    const source = [`const pattern = /a\\/*b/;`, called(QUERY_RAW_UNSAFE)].join("\n");

    expect(findViolations("lib/actions/team.ts", source)).toHaveLength(1);
  });

  it("preserves offsets and line breaks so reported lines stay accurate", () => {
    const source = ["/* one", "   two */", called(QUERY_RAW_UNSAFE)].join("\n");
    const blanked = blankComments(source);

    expect(blanked).toHaveLength(source.length);
    expect(blanked.split("\n")).toHaveLength(3);
    expect(blanked.split("\n")[0].trim()).toBe("");
    expect(findViolations("lib/actions/team.ts", source)[0].line).toBe(3);
  });
});

describe("raw-SQL gate: the repository itself", () => {
  it("is clean, and stays clean", () => {
    expect(scanRepository(REPO_ROOT)).toEqual([]);
  });

  it("still permits the two real call sites the record documents", () => {
    // Guards the exemptions against drift in the other direction: if either
    // file were rewritten or the exception list narrowed, this fails loudly
    // rather than the gate quietly starting to reject committed code.
    const health = readFileSync(join(REPO_ROOT, HEALTH_ROUTE), "utf8");
    const checkCols = readFileSync(join(REPO_ROOT, "scripts/check-cols.ts"), "utf8");

    expect(health).toContain(QUERY_RAW);
    expect(checkCols).toContain(QUERY_RAW);
    expect(findViolations(HEALTH_ROUTE, health)).toEqual([]);
    expect(findViolations("scripts/check-cols.ts", checkCols)).toEqual([]);

    // ...and both would be violations if they moved into application code.
    expect(findViolations("lib/actions/health.ts", health).length).toBeGreaterThan(0);
    expect(findViolations("lib/actions/columns.ts", checkCols).length).toBeGreaterThan(0);
  });
});
