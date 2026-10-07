import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DIAGRAM_THEME } from "@/lib/utils/canvas/diagram-theme";

const RENDERER_FILES = ["rink-renderer.ts", "glyphs.ts", "drawing-utils.ts", "legend-swatch.ts", "station-map.ts"];

/** Source with comments removed, so documentation may still name colors. */
function code(file: string): string {
    return readFileSync(join(process.cwd(), "lib/utils/canvas", file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("diagram theme", () => {
    it.each(RENDERER_FILES)("%s draws with theme colors only: no hex or rgb literals", (file) => {
        expect(code(file).match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? []).toEqual([]);
    });

    it.each(RENDERER_FILES)("%s takes its fonts from the theme", (file) => {
        expect(code(file).match(/"Source Sans 3"|\bArial\b|sans-serif/g) ?? []).toEqual([]);
    });

    it("is a static object: the board is light in both color schemes", () => {
        expect(JSON.stringify(DIAGRAM_THEME)).not.toMatch(/prefers-color-scheme|var\(--/);
        expect(DIAGRAM_THEME.ice).toMatch(/^#/);
    });
});
