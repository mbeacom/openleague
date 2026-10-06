import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const BOARD = path.join(process.cwd(), "components/features/practice-planner/RinkBoard.tsx");

describe("RinkBoard line budget", () => {
    it("stays at or under 1057 lines (gesture logic belongs in useBoardTouch, useStrokeEditing or lib/utils/canvas)", () => {
        const lines = readFileSync(BOARD, "utf8").trimEnd().split("\n").length;
        expect(lines).toBeLessThanOrEqual(1057);
    });
});
