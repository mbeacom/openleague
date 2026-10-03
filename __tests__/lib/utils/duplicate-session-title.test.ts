import { describe, expect, it } from "vitest";
import { duplicateSessionTitle } from "@/lib/utils/session-drill-ids";
import { duplicateSessionTitle as serviceExport } from "@/lib/services/practice-session-drills";

describe("duplicateSessionTitle (portable home)", () => {
    it("prefixes and caps at 100 characters", () => {
        expect(duplicateSessionTitle("Tuesday")).toBe("Copy of Tuesday");
        expect(duplicateSessionTitle("x".repeat(100))).toHaveLength(100);
    });

    it("is the same function the hosted service re-exports", () => {
        expect(serviceExport).toBe(duplicateSessionTitle);
    });
});
