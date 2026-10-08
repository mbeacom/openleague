/**
 * Config-format exports: the YAML, TOML and JSONC libraries load only through
 * import() inside lib/document-formats/codecs.ts, so no page's or the static
 * planner's first load carries them. scripts/check-planner-build.ts checks the
 * built bundle; this checks the source, so a stray static import fails fast.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FORMAT_LIBRARY_MARKERS, LAZY_ONLY_IN_BUNDLE, REQUIRED_IN_BUNDLE } from "@/scripts/check-planner-build";

const ROOT = process.cwd();
const APP_SOURCE = ["app", "apps/planner/src", "components", "lib", "types"];
const LIBRARIES = ["yaml", "smol-toml", "jsonc-parser"];

function sourceFiles(dir: string): string[] {
    const full = path.join(ROOT, dir);
    return readdirSync(full).flatMap((name) => {
        const entry = path.join(full, name);
        if (statSync(entry).isDirectory()) return sourceFiles(path.join(dir, name));
        return /\.(tsx?|mjs|js)$/.test(name) ? [entry] : [];
    });
}

/** Value imports (`import x from "yaml"`, `export … from "yaml"`); `import type` is erased and allowed. */
const STATIC_VALUE_IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^;]*?\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /import\(\s*["']([^"']+)["']\s*\)/g;

describe("format libraries load lazily", () => {
    const files = APP_SOURCE.flatMap(sourceFiles);

    it("no app source imports them statically", () => {
        const offenders = files.flatMap((file) =>
            Array.from(readFileSync(file, "utf8").matchAll(STATIC_VALUE_IMPORT))
                .filter((match) => LIBRARIES.includes(match[1]))
                .map((match) => `${path.relative(ROOT, file)} -> ${match[1]}`),
        );
        expect(offenders).toEqual([]);
    });

    it("only the codecs module imports them, through import()", () => {
        const dynamic = files.flatMap((file) =>
            Array.from(readFileSync(file, "utf8").matchAll(DYNAMIC_IMPORT))
                .filter((match) => LIBRARIES.includes(match[1]))
                .map((match) => `${path.relative(ROOT, file)} -> ${match[1]}`),
        );
        expect(dynamic.sort()).toEqual(LIBRARIES.map((library) => `lib/document-formats/codecs.ts -> ${library}`).sort());
    });

    it("the static bundle check requires each library and keeps it out of the entry chunk", () => {
        for (const marker of Object.values(FORMAT_LIBRARY_MARKERS)) {
            expect(REQUIRED_IN_BUNDLE).toContain(marker);
            expect(LAZY_ONLY_IN_BUNDLE.map((rule) => rule.pattern)).toContain(marker);
        }
    });
});
