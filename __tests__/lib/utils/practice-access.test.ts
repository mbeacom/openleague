/** Who may read a practice: the detail page, the bench sheet and the export logo share this rule. */
import { describe, expect, it } from "vitest";
import { canViewPracticeSession } from "@/lib/utils/practice-access";

describe("canViewPracticeSession", () => {
    it.each([
        ["ADMIN", false, true],
        ["ADMIN", true, true],
        ["MEMBER", true, true],
        ["MEMBER", false, false],
        [null, true, false],
        [undefined, true, false],
    ] as const)("role %s, shared %s → %s", (role, isShared, expected) => {
        expect(canViewPracticeSession(role, isShared)).toBe(expected);
    });
});
