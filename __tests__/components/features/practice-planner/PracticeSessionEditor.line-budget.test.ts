import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const EDITOR = path.join(process.cwd(), "components/features/practice-planner/PracticeSessionEditor.tsx");

describe("PracticeSessionEditor line budget", () => {
    it("stays at or under 900 lines (new session logic belongs in the list, the card, or a hook)", () => {
        const lines = readFileSync(EDITOR, "utf8").trimEnd().split("\n").length;
        expect(lines).toBeLessThanOrEqual(900);
    });
});
