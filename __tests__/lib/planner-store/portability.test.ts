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

function scanPortability(entries: readonly string[]): { violations: string[]; visited: number } {
    const seen = new Set<string>();
    const found = new Set<string>();
    const visit = (file: string) => {
        if (seen.has(file)) return;
        seen.add(file);
        const source = readFileSync(file, "utf8");
        const imports: Array<{ spec: string; typeOnly: boolean }> = [];
        for (const match of source.matchAll(STATIC_IMPORT)) imports.push({ spec: match[2], typeOnly: Boolean(match[1]) });
        for (const match of source.matchAll(DYNAMIC_IMPORT)) imports.push({ spec: match[1], typeOnly: false });
        for (const { spec, typeOnly } of imports) {
            if (FORBIDDEN_ANY.test(spec) || (!typeOnly && FORBIDDEN_VALUE.test(spec))) {
                found.add(`${path.relative(ROOT, file)} -> ${spec}`);
                continue; // never descend into a forbidden module
            }
            if (typeOnly) continue;
            const next = resolveSource(spec, file);
            if (next) visit(next);
        }
    };
    for (const entry of entries) visit(path.join(ROOT, entry));
    return { violations: [...found].sort(), visited: seen.size };
}

describe("portable practice-planner import graph (ADR-0020)", () => {
    const { violations, visited } = scanPortability(ENTRIES);

    it("walks the planner's modules (guards against a resolver that silently finds nothing)", () => {
        expect(visited).toBeGreaterThan(40);
    });

    it("reaches no server, Prisma, auth or Next.js runtime module", () => {
        expect(violations).toEqual([]);
    });
});
