/**
 * Drill age groups (age-group templates spec R2, R3, R6): the vocabulary and
 * labels, the league classification each label follows, the filter's match
 * rule, lenient readers for stored values and the strict write schema.
 * Portable (ADR-0020): imports only zod, so both deployables, the server
 * actions and the plan document share it. Never import @prisma/client here.
 */
import { z } from "zod";

export const AGE_GROUPS = ["u6", "u8", "u10", "u12", "u14", "u16plus"] as const;
/** One age group. A drill or template with none suits every age. */
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
    u6: "6U",
    u8: "8U",
    u10: "10U",
    u12: "12U",
    u14: "14U",
    u16plus: "16U+",
};

/**
 * The league AgeClassification whose wording each label follows
 * (lib/utils/age-level.ts). A constant, not a database link, written as
 * string literals so this module stays portable; a test types it against
 * Prisma's enum.
 */
export const AGE_GROUP_CLASSIFICATION: Record<AgeGroup, "U6" | "U8" | "SQUIRT_U10" | "PEEWEE_U12" | "BANTAM_U14" | "U16"> = {
    u6: "U6",
    u8: "U8",
    u10: "SQUIRT_U10",
    u12: "PEEWEE_U12",
    u14: "BANTAM_U14",
    u16plus: "U16",
};

export const ALL_AGES_LABEL = "All ages";
export const SHOW_ALL_AGES_LABEL = "Show all ages";
export const AGE_FILTER_GROUP_LABEL = "Age group";
export const AGE_GROUPS_FIELD_LABEL = "Age groups";
export const AGE_GROUPS_HELPER = "Leave empty if it suits every age.";
export const AGE_GROUP_UNKNOWN_MESSAGE = "Age groups must be 6U, 8U, 10U, 12U, 14U or 16U+";
export const AGE_GROUP_REPEAT_MESSAGE = "Each age group can be listed only once";
export const AGE_GROUPS_LIST_MESSAGE = "Age groups must be a list";

/** The one localStorage key that remembers the age filter on this device (R3). */
export const AGE_FILTER_STORAGE_KEY = "openleague.planner.ageFilter";

export function isAgeGroup(value: unknown): value is AgeGroup {
    return (AGE_GROUPS as readonly unknown[]).includes(value);
}

/** A known group, else null (All ages): a remembered filter, a query value. */
export function toAgeGroup(value: unknown): AgeGroup | null {
    return isAgeGroup(value) ? value : null;
}

/** The groups given, each once, in AGE_GROUPS order. */
export function inAgeOrder(groups: readonly AgeGroup[]): AgeGroup[] {
    return AGE_GROUPS.filter((group) => groups.includes(group));
}

/**
 * Lenient reader for a stored value (a database array, a device record, an
 * exporter's input): unknown values are dropped, repeats collapse, the order
 * is the table's, and anything that isn't a list reads as [] (every age).
 */
export function toAgeGroups(value: unknown): AgeGroup[] {
    return Array.isArray(value) ? inAgeOrder(value.filter(isAgeGroup)) : [];
}

/** The editor chip's toggle: adds or removes one group, keeping the table order. */
export function toggleAgeGroup(groups: readonly AgeGroup[], group: AgeGroup): AgeGroup[] {
    return groups.includes(group) ? groups.filter((other) => other !== group) : inAgeOrder([...groups, group]);
}

/** The filter's rule (R3): All ages (null) matches everything; an untagged drill or template matches every age. */
export function matchesAgeGroup(groups: readonly AgeGroup[] | undefined, filter: AgeGroup | null): boolean {
    return filter === null || !groups || groups.length === 0 || groups.includes(filter);
}

/** "All ages", or the labels in table order: "6U, 8U". */
export function formatAgeGroups(groups: readonly AgeGroup[] | undefined): string {
    const known = toAgeGroups(groups);
    return known.length === 0 ? ALL_AGES_LABEL : known.map((group) => AGE_GROUP_LABELS[group]).join(", ");
}

/** The filter's empty state (R3): "No drills for 8U yet." */
export function noAgeMatchMessage(noun: "drills" | "templates", group: AgeGroup): string {
    return `No ${noun} for ${AGE_GROUP_LABELS[group]} yet.`;
}

/** One age group: the library filter's query value. */
export const ageGroupSchema = z.enum(AGE_GROUPS, { message: AGE_GROUP_UNKNOWN_MESSAGE });

/**
 * A drill's age groups on write (R2): known values only and no repeats, so at
 * most six; stored in table order whatever order was sent.
 */
export const ageGroupsSchema = z
    .array(ageGroupSchema, { message: AGE_GROUPS_LIST_MESSAGE })
    .refine((groups) => new Set(groups).size === groups.length, { message: AGE_GROUP_REPEAT_MESSAGE })
    .transform(inAgeOrder);
