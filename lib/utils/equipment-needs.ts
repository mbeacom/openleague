/**
 * A drill's equipment list (practice equipment spec R1, R2): what its diagram
 * shows, with the coach's changes stored in `PlayData.equipmentNeeds`. Also
 * the rules for a practice's own additions (R3) and the labels every view
 * prints. Pure: no React, server or DOM imports, and nothing from the session
 * timeline, so play-data.ts can import the schema without a cycle. The
 * practice rollup lives in practice-equipment.ts.
 */
import { z } from "zod";
import {
    EQUIPMENT_KINDS,
    EQUIPMENT_NAME_MAX,
    MAX_DRILL_CUSTOM_EQUIPMENT,
    MAX_EQUIPMENT_COUNT,
    MAX_PRACTICE_EQUIPMENT,
    type EquipmentCountItem,
    type EquipmentKind,
    type EquipmentKindChange,
    type EquipmentNeeds,
    type PlayData,
} from "@/types/practice-planner";
import { EQUIPMENT_LABELS } from "@/lib/utils/canvas/notation";

export const EQUIPMENT_NAME_REQUIRED_MESSAGE = "Item name is required";
export const EQUIPMENT_NAME_LENGTH_MESSAGE = `Item name must be at most ${EQUIPMENT_NAME_MAX} characters`;
export const EQUIPMENT_COUNT_MESSAGE = `Count must be a whole number from 1 to ${MAX_EQUIPMENT_COUNT}`;
export const EQUIPMENT_NAME_TAKEN_MESSAGE = "Two items can't share a name";
export const DRILL_EQUIPMENT_LIMIT_MESSAGE = `A drill can list at most ${MAX_DRILL_CUSTOM_EQUIPMENT} added items`;
export const PRACTICE_EQUIPMENT_LIMIT_MESSAGE = `A practice can add at most ${MAX_PRACTICE_EQUIPMENT} items`;

/** Each kind's name when the count isn't 1 (the singular is EQUIPMENT_LABELS). */
export const EQUIPMENT_PLURAL_LABELS: Record<EquipmentKind, string> = {
    puck: "Pucks",
    puckPile: "Puck piles",
    cone: "Cones",
    net: "Nets",
    tire: "Tires",
    pylon: "Pylons",
};

// ---------------------------------------------------------------------------
// Names and keys
// ---------------------------------------------------------------------------

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const INVISIBLE_CHARS = /[\u0080-\u009F​-‍⁠﻿]/g;

/** A typed name on one line: control and zero-width characters removed, whitespace collapsed, trimmed. */
export function cleanEquipmentName(name: string): string {
    return name.replace(CONTROL_CHARS, "").replace(INVISIBLE_CHARS, "").replace(/\s+/g, " ").trim();
}

const nameKey = (name: string) => cleanEquipmentName(name).toLowerCase();

const KIND_BY_NAME = new Map<string, EquipmentKind>(
    EQUIPMENT_KINDS.flatMap((kind) => [
        [EQUIPMENT_LABELS[kind].toLowerCase(), kind] as const,
        [EQUIPMENT_PLURAL_LABELS[kind].toLowerCase(), kind] as const,
    ]),
);

/** The diagram kind a typed name names (singular or plural, ignoring case), or null (spec R1). */
export function equipmentKindFor(name: string): EquipmentKind | null {
    return KIND_BY_NAME.get(nameKey(name)) ?? null;
}

/** One key per item: a kind, or a typed name ignoring case. Every comparison of items goes through it. */
export function equipmentKey(item: { kind: EquipmentKind | null; name: string }): string {
    const kind = item.kind ?? equipmentKindFor(item.name);
    return kind ? `kind:${kind}` : `item:${nameKey(item.name)}`;
}

/** "Net ×1", "Nets ×2", "Water bottles ×20". */
export function equipmentLabel(item: { kind: EquipmentKind | null; name: string }, count: number): string {
    const name = item.kind ? (count === 1 ? EQUIPMENT_LABELS[item.kind] : EQUIPMENT_PLURAL_LABELS[item.kind]) : item.name;
    return `${name} ×${count}`;
}

/** "Cones ×6 · Net ×1", or null for nothing. */
export function equipmentLine(items: ReadonlyArray<{ kind: EquipmentKind | null; name: string; count: number }>): string | null {
    const shown = items.filter((item) => item.count > 0);
    return shown.length > 0 ? shown.map((item) => equipmentLabel(item, item.count)).join(" · ") : null;
}

/** "Equipment: Cones ×6 · Net ×1", or null for nothing: a drill's line on cards, previews and the bench sheet. */
export function drillEquipmentText(items: ReadonlyArray<{ kind: EquipmentKind | null; name: string; count: number }>): string | null {
    const line = equipmentLine(items);
    return line ? `Equipment: ${line}` : null;
}

// ---------------------------------------------------------------------------
// Schema (strict, for writes and plan files) and lenient reading
// ---------------------------------------------------------------------------

const countSchema = z.number().int().min(1).max(MAX_EQUIPMENT_COUNT);
const typedNameSchema = z
    .string()
    .max(EQUIPMENT_NAME_MAX * 4)
    .refine((name) => {
        const length = cleanEquipmentName(name).length;
        return length >= 1 && length <= EQUIPMENT_NAME_MAX;
    }, "Item name must be 1 to 40 characters");

export const equipmentNeedsSchema = z
    .object({
        kinds: z
            .array(
                z.object({
                    kind: z.enum(EQUIPMENT_KINDS),
                    delta: z.number().int().min(-MAX_EQUIPMENT_COUNT).max(MAX_EQUIPMENT_COUNT),
                    removed: z.boolean(),
                }),
            )
            .max(EQUIPMENT_KINDS.length),
        custom: z.array(z.object({ name: typedNameSchema, count: countSchema })).max(MAX_DRILL_CUSTOM_EQUIPMENT),
    })
    .refine((needs) => new Set(needs.kinds.map((entry) => entry.kind)).size === needs.kinds.length, "A kind is listed twice")
    .refine((needs) => needs.custom.every((item) => equipmentKindFor(item.name) === null), "An added item names a diagram kind")
    .refine((needs) => new Set(needs.custom.map((item) => nameKey(item.name))).size === needs.custom.length, EQUIPMENT_NAME_TAKEN_MESSAGE);

/** Stored overrides as a drill reads them: anything unreadable is none (spec R2), never an unreadable drill. */
export function readEquipmentNeeds(raw: unknown): EquipmentNeeds | undefined {
    if (raw == null) return undefined;
    const parsed = equipmentNeedsSchema.safeParse(raw);
    return parsed.success ? (normalizeEquipmentNeeds(parsed.data) ?? undefined) : undefined;
}

// ---------------------------------------------------------------------------
// A drill's list
// ---------------------------------------------------------------------------

export type EquipmentCounts = Record<EquipmentKind, number>;

/** The diagram's count of each kind (spec R2). */
export function derivedEquipmentCounts(playData: Pick<PlayData, "equipment">): EquipmentCounts {
    const counts = Object.fromEntries(EQUIPMENT_KINDS.map((kind) => [kind, 0])) as EquipmentCounts;
    for (const item of playData.equipment) counts[item.kind] += 1;
    return counts;
}

export interface DrillEquipmentItem {
    /** equipmentKey: "kind:cone" or "item:water bottles" */
    key: string;
    kind: EquipmentKind | null;
    /** A kind's plural label, or the typed name */
    name: string;
    count: number;
    /** What the diagram shows (0 for a typed item) */
    derived: number;
    /** The coach changed a diagram count */
    changed: boolean;
}

const clampCount = (count: number) => Math.min(MAX_EQUIPMENT_COUNT, Math.max(0, count));

/** A kind's count: 0 when removed, else the diagram's plus the change, within 0–999. */
function kindCount(derived: number, change: EquipmentKindChange | undefined): number {
    if (change?.removed) return 0;
    return clampCount(derived + (change?.delta ?? 0));
}

/** A drill's items with a count above 0, kinds first (EQUIPMENT_KINDS order), then typed items. Null (unreadable) is none. */
export function drillEquipment(playData: PlayData | null): DrillEquipmentItem[] {
    if (!playData) return [];
    const derived = derivedEquipmentCounts(playData);
    const needs = playData.equipmentNeeds;
    const kinds = EQUIPMENT_KINDS.flatMap((kind): DrillEquipmentItem[] => {
        const change = needs?.kinds.find((entry) => entry.kind === kind);
        const count = kindCount(derived[kind], change);
        if (count === 0) return [];
        return [{ key: `kind:${kind}`, kind, name: EQUIPMENT_PLURAL_LABELS[kind], count, derived: derived[kind], changed: count !== derived[kind] }];
    });
    const custom = (needs?.custom ?? []).map((item): DrillEquipmentItem => ({
        key: equipmentKey({ kind: null, name: item.name }),
        kind: null,
        name: item.name,
        count: item.count,
        derived: 0,
        changed: false,
    }));
    return [...kinds, ...custom];
}

/** Kinds the coach removed that the diagram still shows: the drill editor's Removed list. */
export function removedEquipmentKinds(playData: PlayData): EquipmentKind[] {
    const derived = derivedEquipmentCounts(playData);
    return EQUIPMENT_KINDS.filter((kind) => derived[kind] > 0 && playData.equipmentNeeds?.kinds.some((entry) => entry.kind === kind && entry.removed));
}

/**
 * The stored form (spec R2): typed names cleaned, a typed kind name folded into
 * its kind, repeated names merged, no-op entries dropped, kinds in order, and
 * undefined when nothing is left, so an untouched drill saves exactly as before.
 * Counts are kept within their limits.
 */
export function normalizeEquipmentNeeds(needs: EquipmentNeeds | undefined): EquipmentNeeds | undefined {
    if (!needs) return undefined;
    const kinds = new Map<EquipmentKind, EquipmentKindChange>();
    for (const entry of needs.kinds) {
        if (!kinds.has(entry.kind)) kinds.set(entry.kind, { kind: entry.kind, delta: entry.delta, removed: entry.removed });
    }
    const custom: EquipmentCountItem[] = [];
    for (const item of needs.custom) {
        const name = cleanEquipmentName(item.name);
        if (!name) continue;
        const kind = equipmentKindFor(name);
        if (kind) {
            const current = kinds.get(kind) ?? { kind, delta: 0, removed: false };
            kinds.set(kind, { ...current, delta: current.delta + item.count });
            continue;
        }
        const same = custom.find((existing) => nameKey(existing.name) === nameKey(name));
        if (same) same.count = Math.min(MAX_EQUIPMENT_COUNT, same.count + item.count);
        else custom.push({ name: name.slice(0, EQUIPMENT_NAME_MAX), count: Math.min(MAX_EQUIPMENT_COUNT, Math.max(1, item.count)) });
    }
    const orderedKinds = EQUIPMENT_KINDS.flatMap((kind) => {
        const entry = kinds.get(kind);
        if (!entry) return [];
        const delta = Math.min(MAX_EQUIPMENT_COUNT, Math.max(-MAX_EQUIPMENT_COUNT, entry.delta));
        return entry.removed ? [{ kind, delta: 0, removed: true }] : delta === 0 ? [] : [{ kind, delta, removed: false }];
    });
    const kept = custom.slice(0, MAX_DRILL_CUSTOM_EQUIPMENT);
    return orderedKinds.length > 0 || kept.length > 0 ? { kinds: orderedKinds, custom: kept } : undefined;
}

/** The diagram with these overrides, normalized; the key is removed when there are none. */
export function withEquipmentNeeds(playData: PlayData, needs: EquipmentNeeds | undefined): PlayData {
    const { equipmentNeeds: _previous, ...rest } = playData;
    void _previous;
    const normalized = normalizeEquipmentNeeds(needs);
    return normalized ? { ...rest, equipmentNeeds: normalized } : rest;
}

// ---------------------------------------------------------------------------
// The drill editor's edits (each returns the new, normalized overrides)
// ---------------------------------------------------------------------------

const empty = (): EquipmentNeeds => ({ kinds: [], custom: [] });
const kindOfKey = (key: string): EquipmentKind | null =>
    key.startsWith("kind:") && (EQUIPMENT_KINDS as readonly string[]).includes(key.slice(5)) ? (key.slice(5) as EquipmentKind) : null;

function withKind(needs: EquipmentNeeds | undefined, kind: EquipmentKind, change: EquipmentKindChange | null): EquipmentNeeds | undefined {
    const base = needs ?? empty();
    const kinds = base.kinds.filter((entry) => entry.kind !== kind);
    return normalizeEquipmentNeeds({ kinds: change ? [...kinds, change] : kinds, custom: base.custom });
}

/** Sets an item's count: a kind's as a change from the diagram, a typed item's as is. */
export function setEquipmentCount(needs: EquipmentNeeds | undefined, derived: EquipmentCounts, key: string, count: number): EquipmentNeeds | undefined {
    const next = clampCount(Math.round(count));
    const kind = kindOfKey(key);
    if (kind) return withKind(needs, kind, { kind, delta: next - derived[kind], removed: false });
    const base = needs ?? empty();
    return normalizeEquipmentNeeds({
        kinds: base.kinds,
        custom: base.custom.map((item) => (equipmentKey({ kind: null, name: item.name }) === key ? { ...item, count: Math.max(1, next) } : item)),
    });
}

/** Removes an item: a kind the diagram shows is flagged removed; an added kind or a typed item is dropped. */
export function removeEquipmentItem(needs: EquipmentNeeds | undefined, derived: EquipmentCounts, key: string): EquipmentNeeds | undefined {
    const kind = kindOfKey(key);
    if (kind) return withKind(needs, kind, derived[kind] > 0 ? { kind, delta: 0, removed: true } : null);
    const base = needs ?? empty();
    return normalizeEquipmentNeeds({ kinds: base.kinds, custom: base.custom.filter((item) => equipmentKey({ kind: null, name: item.name }) !== key) });
}

/** Back to the diagram's count. */
export function restoreEquipmentKind(needs: EquipmentNeeds | undefined, kind: EquipmentKind): EquipmentNeeds | undefined {
    return withKind(needs, kind, null);
}

/** A name and count the coach typed: their problem, or null. */
function itemError(name: string, count: number): string | null {
    const cleaned = cleanEquipmentName(name);
    if (!cleaned) return EQUIPMENT_NAME_REQUIRED_MESSAGE;
    if (cleaned.length > EQUIPMENT_NAME_MAX) return EQUIPMENT_NAME_LENGTH_MESSAGE;
    if (!Number.isInteger(count) || count < 1 || count > MAX_EQUIPMENT_COUNT) return EQUIPMENT_COUNT_MESSAGE;
    return null;
}

export type AddEquipmentResult = { ok: true; needs: EquipmentNeeds | undefined } | { ok: false; error: string };

/**
 * Adds `count` of a typed item (spec R1). A kind's name adds to that kind's
 * listed count (a removed kind comes back at `count`); a typed name already
 * listed adds to it.
 */
export function addEquipmentItem(needs: EquipmentNeeds | undefined, derived: EquipmentCounts, name: string, count: number): AddEquipmentResult {
    const error = itemError(name, count);
    if (error) return { ok: false, error };
    const cleaned = cleanEquipmentName(name);
    const kind = equipmentKindFor(cleaned);
    const base = needs ?? empty();
    if (kind) {
        const change = base.kinds.find((entry) => entry.kind === kind);
        const listed = kindCount(derived[kind], change);
        return { ok: true, needs: withKind(needs, kind, { kind, delta: listed + count - derived[kind], removed: false }) };
    }
    const exists = base.custom.some((item) => nameKey(item.name) === nameKey(cleaned));
    if (!exists && base.custom.length >= MAX_DRILL_CUSTOM_EQUIPMENT) return { ok: false, error: DRILL_EQUIPMENT_LIMIT_MESSAGE };
    return { ok: true, needs: normalizeEquipmentNeeds({ kinds: base.kinds, custom: [...base.custom, { name: cleaned, count }] }) };
}

// ---------------------------------------------------------------------------
// A practice's own additions (spec R3)
// ---------------------------------------------------------------------------

/** The list's first problem (count, names, counts, repeats ignoring case, a kind named twice), or null. */
export function practiceEquipmentError(items: ReadonlyArray<EquipmentCountItem>): string | null {
    if (items.length > MAX_PRACTICE_EQUIPMENT) return PRACTICE_EQUIPMENT_LIMIT_MESSAGE;
    const keys = new Set<string>();
    for (const item of items) {
        const error = itemError(item.name, item.count);
        if (error) return error;
        const key = equipmentKey({ kind: null, name: item.name });
        if (keys.has(key)) return EQUIPMENT_NAME_TAKEN_MESSAGE;
        keys.add(key);
    }
    return null;
}

/** The list as stored: names cleaned. Call after practiceEquipmentError passes. */
export function cleanPracticeEquipment(items: ReadonlyArray<EquipmentCountItem>): EquipmentCountItem[] {
    return items.map((item) => ({ name: cleanEquipmentName(item.name), count: item.count }));
}

/** The list an export writes: items that pass the rules, the first of a repeated name, at most 20. */
export function exportPracticeEquipment(items: ReadonlyArray<EquipmentCountItem> | undefined): EquipmentCountItem[] {
    const keys = new Set<string>();
    const kept: EquipmentCountItem[] = [];
    for (const item of items ?? []) {
        const key = equipmentKey({ kind: null, name: item.name });
        if (itemError(item.name, item.count) || keys.has(key) || kept.length >= MAX_PRACTICE_EQUIPMENT) continue;
        keys.add(key);
        kept.push({ name: cleanEquipmentName(item.name), count: item.count });
    }
    return kept;
}

/** Strict, for save inputs and plan files: the hosted save, the static store and the plan document share it. */
export const practiceEquipmentSchema = z
    .array(z.object({ name: z.string().max(EQUIPMENT_NAME_MAX * 4), count: z.number() }), { message: "Equipment must be a list of items" })
    .superRefine((items, ctx) => {
        const error = practiceEquipmentError(items);
        if (error) ctx.addIssue({ code: "custom", message: error });
    })
    .transform(cleanPracticeEquipment);

/** The list as plain JSON values, for a JSON column (a type literal, so it fits Prisma's JSON input type). */
export function equipmentJson(items: ReadonlyArray<EquipmentCountItem>): Array<{ name: string; count: number }> {
    return items.map((item) => ({ name: item.name, count: item.count }));
}

/** A stored list as read: anything unreadable is none. */
export function readPracticeEquipment(raw: unknown): EquipmentCountItem[] {
    const parsed = practiceEquipmentSchema.safeParse(raw);
    return parsed.success ? parsed.data : [];
}
