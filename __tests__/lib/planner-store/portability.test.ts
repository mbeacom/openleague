/**
 * ADR-0020: the static planner (sub-project 3) reuses these modules, so nothing
 * they reach may load server actions, Prisma, auth or Next.js runtime modules.
 * This walks *transitive* value imports, which the per-file ESLint block
 * (eslint.config.mjs, adr-0020/portable-practice-planner) cannot see — for
 * example, a shared components/ui module that imports next/link.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const ENTRIES = [
    "components/features/practice-planner/PracticeSessionEditor.tsx",
    "components/features/practice-planner/PlayEditor.tsx",
    "components/features/practice-planner/PlayLibrary.tsx",
    "components/features/practice-planner/print/BenchSheet.tsx",
    "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx",
    "lib/plan-document/index.ts",
    "lib/planner-store/index.ts",
    "lib/ratings/index.ts",
    "lib/ratings/import/index.ts",
    "lib/rankings-document/index.ts",
    "lib/document-envelope/index.ts",
    // The static planner's whole bundle (sub-project 3).
    "apps/planner/src/main.tsx",
];

/** Forbidden even as `import type`: the static app has no generated Prisma client. */
const FORBIDDEN_ANY = /^@prisma\/client$/;
/** Forbidden as value imports. */
const FORBIDDEN_VALUE = /^(next$|next\/|@\/lib\/(actions|db|auth)\/|@\/auth$|server-only$)/;

const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^;]*?\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /import\(\s*["']([^"']+)["']\s*\)/g;

function resolveSource(spec: string, from: string): string | null {
    let base: string;
    if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
    else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
    else return null; // a package: not walked
    for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx"), base]) {
        if (/\.tsx?$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
}

/** True when the source opens with a "use server" directive, after any leading comments. A linear scan, not a regex, to avoid backtracking. */
function hasUseServerDirective(source: string): boolean {
    let i = 0;
    for (;;) {
        while (i < source.length && /\s/.test(source[i])) i++;
        if (source.startsWith("//", i)) {
            const end = source.indexOf("\n", i);
            if (end === -1) return false;
            i = end + 1;
        } else if (source.startsWith("/*", i)) {
            const end = source.indexOf("*/", i + 2);
            if (end === -1) return false;
            i = end + 2;
        } else {
            return source.startsWith('"use server"', i) || source.startsWith("'use server'", i);
        }
    }
}

/** File access seam so the walk can run against fixtures. */
interface GraphIO {
    read(file: string): string;
    resolve(spec: string, from: string): string | null;
    label(file: string): string;
}

const diskIO: GraphIO = {
    read: (file) => readFileSync(file, "utf8"),
    resolve: resolveSource,
    label: (file) => path.relative(ROOT, file),
};

/**
 * Walks value imports (full rules) and local type-only imports (FORBIDDEN_ANY
 * only: value-only rules and "use server" are erased with the type edge).
 */
export function scanPortability(entries: readonly string[], io: GraphIO = diskIO): { violations: string[]; visited: number } {
    const seenValue = new Set<string>();
    const seenType = new Set<string>();
    const found = new Set<string>();
    const visit = (file: string, typeContext: boolean) => {
        if (seenValue.has(file) || (typeContext && seenType.has(file))) return;
        (typeContext ? seenType : seenValue).add(file);
        const source = io.read(file);
        if (!typeContext && hasUseServerDirective(source)) found.add(`${io.label(file)} -> "use server" module`);
        const imports: Array<{ spec: string; typeOnly: boolean }> = [];
        for (const match of source.matchAll(STATIC_IMPORT)) imports.push({ spec: match[2], typeOnly: Boolean(match[1]) });
        for (const match of source.matchAll(DYNAMIC_IMPORT)) imports.push({ spec: match[1], typeOnly: false });
        for (const { spec, typeOnly } of imports) {
            const edgeIsType = typeContext || typeOnly;
            if (FORBIDDEN_ANY.test(spec) || (!edgeIsType && FORBIDDEN_VALUE.test(spec))) {
                found.add(`${io.label(file)} -> ${spec}`);
                continue; // never descend into a forbidden module
            }
            const next = io.resolve(spec, file);
            if (next) visit(next, edgeIsType);
        }
    };
    for (const entry of entries) visit(entry, false);
    return { violations: [...found].sort(), visited: new Set([...seenValue, ...seenType]).size };
}

describe("portable practice-planner import graph (ADR-0020)", () => {
    const { violations, visited } = scanPortability(ENTRIES.map((entry) => path.join(ROOT, entry)));

    it("walks the planner's modules (guards against a resolver that silently finds nothing)", () => {
        expect(visited).toBeGreaterThan(40);
    });

    it("reaches no server, Prisma, auth or Next.js runtime module", () => {
        expect(violations).toEqual([]);
    });
});

describe("scanPortability against fixtures", () => {
    const fixture = (files: Record<string, string>): GraphIO => ({
        read: (file) => files[file],
        resolve: (spec) => (spec.startsWith("@/") && files[spec.slice(2)] !== undefined ? spec.slice(2) : null),
        label: (file) => file,
    });

    it("reports a reachable \"use server\" module even without a forbidden import", () => {
        const io = fixture({
            "entry.ts": 'import { act } from "@/actions.ts";\nexport const x = act;',
            "actions.ts": '// header\n"use server";\nexport async function act() {}',
        });
        expect(scanPortability(["entry.ts"], io).violations).toEqual(['actions.ts -> "use server" module']);
    });

    it("reports Prisma reached through a local type-only import chain", () => {
        const io = fixture({
            "entry.ts": 'import type { Foo } from "@/foo.ts";\nexport type Bar = Foo;',
            "foo.ts": 'import type { Player } from "@prisma/client";\nexport type Foo = Player;',
        });
        expect(scanPortability(["entry.ts"], io).violations).toEqual(["foo.ts -> @prisma/client"]);
    });

    it("does not apply value-only rules to modules reached only by type imports", () => {
        const io = fixture({
            "entry.ts": 'import type { Foo } from "@/foo.ts";',
            "foo.ts": 'import { thing } from "next/link";\nexport type Foo = typeof thing;',
        });
        expect(scanPortability(["entry.ts"], io).violations).toEqual([]);
    });

    it("still applies value-only rules once a module is also reached by value", () => {
        const io = fixture({
            "entry.ts": 'import type { Foo } from "@/foo.ts";\nimport { v } from "@/foo.ts";',
            "foo.ts": 'import Link from "next/link";\nexport type Foo = 1;\nexport const v = Link;',
        });
        expect(scanPortability(["entry.ts"], io).violations).toEqual(["foo.ts -> next/link"]);
    });
});
