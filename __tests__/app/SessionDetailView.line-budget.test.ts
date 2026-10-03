import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const VIEW = path.join(process.cwd(), "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx");

describe("SessionDetailView line budget", () => {
    it("stays at or under 900 lines (new session-page logic belongs in SessionTimeline or a hook)", () => {
        const lines = readFileSync(VIEW, "utf8").trimEnd().split("\n").length;
        expect(lines).toBeLessThanOrEqual(900);
    });
});
