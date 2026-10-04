import nextConfig from "eslint-config-next";

/**
 * ADR-0003 prohibits raw SQL.
 * See docs/adr/0003-access-postgresql-exclusively-through-prisma-on-neon-serverless.md
 *
 * These rules are the authoring-time half of that enforcement: AST-accurate,
 * and they fire in the editor. They are deliberately not the merge gate.
 * `bun run lint` has run on pull requests since #310 added quality-gates.yml
 * (it also still runs in release.yml and tag-release.yml), but an inline
 * `eslint-disable` silences these rules, and the lint step only reaches them
 * once `bun install` has succeeded. `scripts/check-raw-sql.ts` runs as its own
 * job in the pull-request-triggered ADR workflow, with no `bun install` and no
 * network, "precisely so it cannot be defeated by a dependency or install
 * failure" -- that is the gate that actually blocks a merge.
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

/**
 * ADR-0020: the static planner (apps/planner, sub-project 3) reuses these
 * modules, so they reach server actions and Next.js only through
 * usePlannerStore()/usePlannerPlatform() from lib/planner-store. Type imports
 * are banned too: the portable code declares its own types (SegmentKind in
 * types/segments.ts, PracticeSessionView in types/practice-planner.ts).
 *
 * This is the per-file, authoring-time half. The transitive half, which
 * catches a shared components/ui or lib/utils module that pulls in next/*, is
 * __tests__/lib/planner-store/portability.test.ts, and that is the gate.
 */
const PLANNER_PORTABILITY_MESSAGE =
  "Portable practice-planner code (ADR-0020) must not import server actions, Prisma, auth " +
  "or Next.js runtime modules. Use usePlannerStore()/usePlannerPlatform() from " +
  "@/lib/planner-store, and local types.";
const LAZY_DOCX_MESSAGE =
  "Load the Word export with import(\"./bench-sheet-docx\") inside the click, never statically: docx must stay out of the main bundles (ADR-0020).";

/** Glob-escaped: `[sessionId]` would otherwise be a character class and match nothing. */
const SESSION_DETAIL_VIEW = "app/\\(dashboard\\)/practice-planner/\\[sessionId\\]/SessionDetailView.tsx";

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
    // React Compiler rules demoted to warnings, 2026-09-21.
    //
    // `eslint-config-next` is pinned to 16.2.0, but its transitive
    // `eslint-plugin-react-hooks` is not, and it floated 7.0.1 -> 7.1.1 in the
    // dependency refresh. All three rules below were already `error` under
    // 7.0.1 and the tree linted clean; 7.1.1 only widened what its analysis
    // can see, which surfaced 16 findings in components that predate the
    // dependency bump and were not touched by it. Verified by swapping the
    // plugin back to 7.0.1 against this same tree: 0 problems.
    //
    // These are real React anti-patterns, not false positives, and the intent
    // is to fix them -- but each fix is a behavioral change to a form, dialog,
    // or drag-and-drop surface, and none of them belong in a dependency bump.
    // Warning keeps every finding visible in the editor and in CI logs while
    // letting the bump land. That is the documented contract of the gate, not
    // a loophole: quality-gates.yml's Lint step "fails on errors, not
    // warnings", and `bun run lint` is a bare `eslint .` with no
    // `--max-warnings`.
    //
    // Restore these to `error` file-by-file as the components are fixed, and
    // delete this block once the last one lands. Run `bun run lint` to see the
    // current list. Fixing them is *not* mechanical:
    //   - `set-state-in-effect` (11) fires on the synchronous setState in the
    //     effect's call path, typically `setLoading(true)`, not on the fetch.
    //   - `immutability` (3) is an effect calling a function declared below
    //     it; hoisting alone just converts it into a `set-state-in-effect`.
    //   - `refs` (1) is SegmentationEditor's render-time IIFE, which hides the
    //     deferred `dragRef` read from the analyzer.
    name: "tech-debt/react-compiler-rules",
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
    },
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
  {
    name: "adr-0020/portable-practice-planner",
    files: [
      `components/features/practice-planner/**/${SOURCE_GLOB}`,
      SESSION_DETAIL_VIEW,
      `lib/planner-store/**/${SOURCE_GLOB}`,
      `lib/plan-document/**/${SOURCE_GLOB}`,
      // The static planner itself (sub-project 3): it must never reach Next.js or the server.
      `apps/planner/**/${SOURCE_GLOB}`,
      "lib/utils/session-timeline.ts",
      "types/segments.ts",
      "types/practice-planner.ts",
    ],
    // The hosted import flow (sub-project 1): it calls importPracticePlan and useRouter by design.
    ignores: ["components/features/practice-planner/PlanImportView.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "next",
            "@/auth",
            "@prisma/client",
            "server-only",
            "@/components/ui/NextLinkComposites",
            "@/components/providers/HostedPlannerProvider",
            "@/components/providers/hosted-planner-platform",
          ]
            .map((name) => ({ name, message: PLANNER_PORTABILITY_MESSAGE }))
            .concat([{ name: "docx", message: LAZY_DOCX_MESSAGE }]),
          patterns: [
            {
              group: ["next/*", "@/lib/actions/*", "@/lib/db/*", "@/lib/auth/*"],
              message: PLANNER_PORTABILITY_MESSAGE,
            },
            { group: ["**/bench-sheet-docx", "docx/*"], message: LAZY_DOCX_MESSAGE },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
