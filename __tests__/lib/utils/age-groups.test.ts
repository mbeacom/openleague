/** Drill age groups (age-group templates spec R2, R3): vocabulary, readers, match rule and write schema. */
import { describe, expect, it } from "vitest";
import type { AgeClassification } from "@prisma/client";
import {
    AGE_GROUPS,
    AGE_GROUP_CLASSIFICATION,
    AGE_GROUP_LABELS,
    AGE_GROUP_REPEAT_MESSAGE,
    AGE_GROUP_UNKNOWN_MESSAGE,
    AGE_GROUPS_LIST_MESSAGE,
    ALL_AGES_LABEL,
    ageGroupSchema,
    ageGroupsSchema,
    formatAgeGroups,
    matchesAgeGroup,
    noAgeMatchMessage,
    toAgeGroup,
    toAgeGroups,
    toggleAgeGroup,
    type AgeGroup,
} from "@/lib/utils/age-groups";
import { AGE_CLASSIFICATION_LABELS } from "@/lib/utils/age-level";

describe("the vocabulary", () => {
    it("lists six groups in age order with their labels", () => {
        expect([...AGE_GROUPS]).toEqual(["u6", "u8", "u10", "u12", "u14", "u16plus"]);
        expect(AGE_GROUPS.map((group) => AGE_GROUP_LABELS[group])).toEqual(["6U", "8U", "10U", "12U", "14U", "16U+"]);
    });

    it("maps each group to the league classification its wording follows", () => {
        // Typed against Prisma's enum here, so a renamed classification fails type-check.
        const mapping: Record<AgeGroup, AgeClassification> = AGE_GROUP_CLASSIFICATION;
        for (const group of AGE_GROUPS) {
            expect(AGE_CLASSIFICATION_LABELS[mapping[group]].startsWith(AGE_GROUP_LABELS[group].replace("+", ""))).toBe(true);
        }
    });
});

describe("readers", () => {
    it("reads a stored filter value, or null for anything unknown", () => {
        expect(toAgeGroup("u8")).toBe("u8");
        expect(toAgeGroup("u7")).toBeNull();
        expect(toAgeGroup(null)).toBeNull();
        expect(toAgeGroup(8)).toBeNull();
    });

    it("reads stored lists leniently: known values, once each, in table order; a non-list is every age", () => {
        expect(toAgeGroups(["u12", "u8", "u12", "u7"])).toEqual(["u8", "u12"]);
        expect(toAgeGroups([])).toEqual([]);
        expect(toAgeGroups(undefined)).toEqual([]);
        expect(toAgeGroups(null)).toEqual([]);
        expect(toAgeGroups("u8")).toEqual([]);
    });

    it("toggles a group in or out, keeping the table order", () => {
        expect(toggleAgeGroup(["u12"], "u8")).toEqual(["u8", "u12"]);
        expect(toggleAgeGroup(["u8", "u12"], "u8")).toEqual(["u12"]);
        expect(toggleAgeGroup([], "u16plus")).toEqual(["u16plus"]);
    });
});

describe("matchesAgeGroup (R3)", () => {
    it("matches everything for All ages, an untagged drill for every age, and a tagged drill for its own ages", () => {
        expect(matchesAgeGroup(["u12"], null)).toBe(true);
        expect(matchesAgeGroup([], "u6")).toBe(true);
        expect(matchesAgeGroup(undefined, "u16plus")).toBe(true);
        expect(matchesAgeGroup(["u8", "u10"], "u10")).toBe(true);
        expect(matchesAgeGroup(["u8", "u10"], "u12")).toBe(false);
    });
});

describe("copy", () => {
    it("formats a list for a chip and names the empty state", () => {
        expect(formatAgeGroups([])).toBe(ALL_AGES_LABEL);
        expect(formatAgeGroups(undefined)).toBe("All ages");
        expect(formatAgeGroups(["u8", "u6"])).toBe("6U, 8U");
        expect(noAgeMatchMessage("drills", "u8")).toBe("No drills for 8U yet.");
        expect(noAgeMatchMessage("templates", "u16plus")).toBe("No templates for 16U+ yet.");
    });
});

describe("the write schema (R2)", () => {
    it("accepts 0 to 6 known values and stores them in table order", () => {
        expect(ageGroupsSchema.parse([])).toEqual([]);
        expect(ageGroupsSchema.parse(["u16plus", "u6"])).toEqual(["u6", "u16plus"]);
        expect(ageGroupsSchema.parse([...AGE_GROUPS].reverse())).toEqual([...AGE_GROUPS]);
    });

    it("refuses an unknown value, a repeat and a non-list, each with its message", () => {
        const message = (value: unknown) => {
            const result = ageGroupsSchema.safeParse(value);
            return result.success ? null : result.error.issues[0].message;
        };
        expect(message(["u8", "u7"])).toBe(AGE_GROUP_UNKNOWN_MESSAGE);
        expect(message(["u8", "u8"])).toBe(AGE_GROUP_REPEAT_MESSAGE);
        expect(message("u8")).toBe(AGE_GROUPS_LIST_MESSAGE);
        expect(AGE_GROUP_UNKNOWN_MESSAGE).toBe("Age groups must be 6U, 8U, 10U, 12U, 14U or 16U+");
    });

    it("validates one filter value", () => {
        expect(ageGroupSchema.parse("u14")).toBe("u14");
        expect(ageGroupSchema.safeParse("U14").success).toBe(false);
    });
});
