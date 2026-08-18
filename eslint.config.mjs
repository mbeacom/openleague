import nextConfig from "eslint-config-next";

/**
 * ADR-0003 prohibits raw SQL.
 * See docs/adr/0003-access-postgresql-exclusively-through-prisma-on-neon-serverless.md
 *
 * These rules are the authoring-time half of that enforcement: AST-accurate,
 * and they fire in the editor. They are deliberately not the merge gate --
 * `bun run lint` runs only in release.yml and tag-release.yml, both of which
 * fire *after* a merge to main, and an inline `eslint-disable` can silence
 * them. `scripts/check-raw-sql.ts`, wired into the pull-request-triggered ADR
 * workflow, is the gate that actually blocks a merge.
 *
 * Matching on `MemberExpression` targets call sites (`prisma.$queryRaw`,
 * `prisma["$queryRaw"]`) rather than every mention of the name, so test mocks
 * shaped like `{ $queryRaw: vi.fn() }` are not false positives.
 */
const RAW_SQL_MESSAGE =
  "ADR-0003 prohibits $queryRaw/$executeRaw under app/, lib/, and components/ " +
  "(app/api/health/route.ts is the only exception, and its statement takes no " +
  "input). Use the generated Prisma client, which parameterizes by default.";

const UNSAFE_RAW_SQL_MESSAGE =
  "ADR-0003 prohibits $queryRawUnsafe/$executeRawUnsafe anywhere in this " +
  "repository, with no exception: they take a plain string rather than a " +
  "tagged template, so nothing is parameterized. Introducing one requires " +
  "superseding docs/adr/0003-*.md, not a reviewer's judgment call.";

/** Matches `prisma.$queryRawUnsafe(...)` and `prisma["$queryRawUnsafe"](...)`. */
const unsafeRawSqlSelectors = [
  {
    selector: "MemberExpression[property.name=/^[$](query|execute)RawUnsafe$/]",
    message: UNSAFE_RAW_SQL_MESSAGE,
  },
  {
    selector: "MemberExpression[property.value=/^[$](query|execute)RawUnsafe$/]",
    message: UNSAFE_RAW_SQL_MESSAGE,
  },
];

/** Matches the tagged-template and computed forms of the plain raw helpers. */
const rawSqlSelectors = [
  {
    selector: "MemberExpression[property.name=/^[$](query|execute)Raw$/]",
    message: RAW_SQL_MESSAGE,
  },
  {
    selector: "MemberExpression[property.value=/^[$](query|execute)Raw$/]",
    message: RAW_SQL_MESSAGE,
  },
];

/** The source extensions ESLint parses, used to scope the path-restricted block. */
const SOURCE_GLOB = "*.{js,jsx,mjs,cjs,ts,tsx}";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "dist/**",
      "out/**",
      "build/**",
      "coverage/**",
      "*.min.js",
      "next-env.d.ts",
      // Vendored/generated design-sync output (bundled React et al). Gitignored,
      // so CI never sees it, but it made `bun run lint` fail locally with 41
      // errors from third-party code and masked real findings.
      "ds-bundle/**",
      ".design-sync/**",
    ],
  },
  {
    name: "adr-0003/no-unsafe-raw-sql",
    rules: {
      "no-restricted-syntax": ["error", ...unsafeRawSqlSelectors],
    },
  },
  {
    // Repeating the unsafe selectors here is load-bearing, not redundant. Flat
    // config replaces a rule's options wholesale rather than merging them, so
    // for a file matched by both blocks this entry wins outright -- omitting
    // the unsafe selectors would silently drop the repo-wide unsafe ban for
    // exactly the paths where user input reaches the database.
    name: "adr-0003/no-raw-sql-in-application-code",
    files: [
      `app/**/${SOURCE_GLOB}`,
      `lib/**/${SOURCE_GLOB}`,
      `components/**/${SOURCE_GLOB}`,
    ],
    // The single documented exception: a parameterless `SELECT 1` liveness probe.
    ignores: ["app/api/health/route.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...unsafeRawSqlSelectors,
        ...rawSqlSelectors,
      ],
    },
  },
];

export default eslintConfig;
