/**
 * Session rows (practice timing, spec R1–R3): the drill / block distinction,
 * lenient readers for the new fields, editor row edits, and the save payload's
 * row inputs. Pure: no React, server or DOM imports, so both deployables, the
 * server actions, the static store and the plan document share it.
 */
import {
    BLOCK_DEFAULTS,
    BLOCK_KINDS,
    MAX_BLOCK_LABEL_LENGTH,
    MAX_ROTATE_MINUTES,
    MAX_TRANSITION_MINUTES,
    MIN_ROTATE_MINUTES,
    SESSION_ROW_KINDS,
    type BlockInSession,
    type BlockKind,
    type PlayInSession,
    type SessionItem,
    type SessionRowKind,
} from "@/types/practice-planner";

export const ROTATE_MINUTES_MESSAGE = `Rotation must be a whole number of minutes from ${MIN_ROTATE_MINUTES} to ${MAX_ROTATE_MINUTES}`;
export const TRANSITION_MINUTES_MESSAGE = `Between blocks must be a whole number of minutes from 0 to ${MAX_TRANSITION_MINUTES}`;
export const BLOCK_LABEL_MESSAGE = `Label must be at most ${MAX_BLOCK_LABEL_LENGTH} characters`;
export const BLOCK_HAS_NO_DRILL_MESSAGE = "A warm-up, break, transition or cool-down has no drill";
export const DRILL_NEEDS_PLAY_MESSAGE = "A drill needs a play";
/** A row's instructions limit (practiceSessionPlayInputSchema). */
export const MAX_ROW_INSTRUCTIONS_LENGTH = 2000;
// The row schema's field messages, shared so the static store refuses in the same words.
// The last three are Zod's own wording, made explicit in the schema.
export const PLAY_DURATION_MIN_MESSAGE = "Play duration must be at least 1 minute";
export const PLAY_DURATION_MAX_MESSAGE = "Play duration must be less than 300 minutes";
export const PLAY_DURATION_INT_MESSAGE = "Invalid input: expected int, received number";
export const ROW_INSTRUCTIONS_MESSAGE = `Too big: expected string to have <=${MAX_ROW_INSTRUCTIONS_LENGTH} characters`;
export const ROW_KIND_MESSAGE = `Invalid option: expected one of ${SESSION_ROW_KINDS.map((kind) => `"${kind}"`).join("|")}`;

export function isBlockKind(value: unknown): value is BlockKind {
    return (BLOCK_KINDS as readonly unknown[]).includes(value);
}

/** A known kind, else "drill": rows stored before practice timing have none. */
export function toRowKind(value: unknown): SessionRowKind {
    return (SESSION_ROW_KINDS as readonly unknown[]).includes(value) ? (value as SessionRowKind) : "drill";
}

type Kinded = { kind?: SessionRowKind };

/** A row is a drill unless its kind names a block. */
export function isDrillRow<T extends Kinded>(row: T): row is Exclude<T, { kind: BlockKind }> {
    return !isBlockKind(row.kind);
}

export function isBlockRow<T extends Kinded>(row: T): row is Extract<T, { kind: BlockKind }> {
    return isBlockKind(row.kind);
}

/** The drill rows, in order (the play sequence, diagrams, bench-sheet drill pages). */
export function drillRows<T extends Kinded>(rows: readonly T[]): Array<Exclude<T, { kind: BlockKind }>> {
    return rows.filter((row): row is Exclude<T, { kind: BlockKind }> => isDrillRow(row));
}

/** A block's name on screen and paper: its label, else its kind's default. */
export function blockTitle(kind: BlockKind, label: string | null | undefined): string {
    return label?.trim() || BLOCK_DEFAULTS[kind].label;
}

/**
 * Control characters the write paths strip (the same pattern as validation.ts's
 * sanitizedString and play-data's cleanText). The one copy the practice-timing
 * code shares: validation.ts, the plan document and the static store import it.
 * Global: use it with `replace` only, never `test` (a global regex keeps lastIndex).
 */
export const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/** Cleaned and cut to 60 characters; empty or not text reads as null (the default label). */
export function toBlockLabel(value: unknown): string | null {
    if (typeof value !== "string") return null;
    return value.replace(CONTROL_CHARS, "").trim().slice(0, MAX_BLOCK_LABEL_LENGTH).trim() || null;
}

/** A whole number of minutes from 1 to 30, else null (no rotation). */
export function toRotateEveryMinutes(value: unknown): number | null {
    return typeof value === "number" && Number.isInteger(value) && value >= MIN_ROTATE_MINUTES && value <= MAX_ROTATE_MINUTES
        ? value
        : null;
}

/** A whole number of minutes from 0 to 5, else 0 (no gap). */
export function toTransitionMinutes(value: unknown): number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_TRANSITION_MINUTES ? value : 0;
}

/** A new block row with its kind's default minutes; the empty label shows the default. */
export function newBlockItem(kind: BlockKind, sequence: number, id: string): BlockInSession {
    return { id, kind, label: "", sequence, duration: BLOCK_DEFAULTS[kind].minutes, instructions: "", runsWithPrevious: false };
}

/** What a card may change in place. A label applies to a block row only. */
export interface RowEdit {
    duration?: number;
    instructions?: string;
    label?: string;
}

export function applyRowEdit<T extends SessionItem>(item: T, edit: RowEdit): T {
    const next = {
        ...item,
        ...(edit.duration !== undefined && { duration: edit.duration }),
        ...(edit.instructions !== undefined && { instructions: edit.instructions }),
    };
    return edit.label !== undefined && isBlockKind(item.kind) ? { ...next, label: edit.label } : next;
}

/** One drill row in a session save (hosted actions and the static store share the shape). */
export interface DrillRowInput {
    /** Absent = a drill (older clients). */
    kind?: "drill";
    playId: string;
    clientKey: string;
    sequence: number;
    runsWithPrevious: boolean;
    duration: number;
    instructions: string;
    /** Absent = unchanged (the stored row's value; false for a new row). */
    stays?: boolean;
    /** Absent = unchanged; null clears. */
    rotateEveryMinutes?: number | null;
}

/** One block row in a session save: no drill fields. */
export interface BlockRowInput {
    kind: BlockKind;
    clientKey: string;
    sequence: number;
    duration: number;
    instructions: string;
    /** null = the kind's default label */
    label: string | null;
}

export type SessionRowInput = DrillRowInput | BlockRowInput;

/** A drill card as a save row. Timing is sent only when the editor holds it, so a missing value never clears a stored one. */
export function toDrillRowInput(item: PlayInSession): DrillRowInput {
    return {
        kind: "drill",
        playId: item.playId,
        clientKey: item.id,
        sequence: item.sequence,
        runsWithPrevious: item.runsWithPrevious,
        duration: item.duration,
        instructions: item.instructions || "",
        ...(item.stays !== undefined && { stays: item.stays }),
        ...(item.rotateEveryMinutes !== undefined && { rotateEveryMinutes: item.rotateEveryMinutes }),
    };
}

/** Every editor row as a save row: what all three editor wrappers send. */
export function toSessionRowInputs(items: readonly SessionItem[]): SessionRowInput[] {
    return items.map((item) =>
        isBlockRow(item)
            ? {
                  kind: item.kind,
                  clientKey: item.id,
                  sequence: item.sequence,
                  duration: item.duration,
                  instructions: item.instructions || "",
                  label: toBlockLabel(item.label),
              }
            : toDrillRowInput(item),
    );
}

/** A stored row's timing, keyed by the drill copy it shows. */
export interface StoredTiming {
    playId: string | null;
    stays: boolean;
    rotateEveryMinutes: number | null;
}

type TimedRow = { kind?: SessionRowKind; playId?: string | null; stays?: boolean; rotateEveryMinutes?: number | null };

/** Whether a save left any drill's timing out, so the stored rows must be read first. */
export function needsStoredTiming(rows: readonly TimedRow[]): boolean {
    return rows.some((row) => !isBlockKind(row.kind) && (row.stays === undefined || row.rotateEveryMinutes === undefined));
}

/**
 * Absent = unchanged (spec R3): a drill row that omits `stays` or
 * `rotateEveryMinutes` keeps the stored row's value for the same play, and a
 * row with nothing stored takes the default. Explicit values, null included,
 * always win. Block rows never stay or rotate.
 */
export function withStoredTiming<R extends TimedRow>(
    rows: readonly R[],
    stored: readonly StoredTiming[],
): Array<R & { stays: boolean; rotateEveryMinutes: number | null }> {
    const byPlay = new Map<string, StoredTiming>();
    for (const row of stored) if (row.playId && !byPlay.has(row.playId)) byPlay.set(row.playId, row);
    return rows.map((row) => {
        if (isBlockKind(row.kind)) return { ...row, stays: false, rotateEveryMinutes: null };
        const before = row.playId ? byPlay.get(row.playId) : undefined;
        return {
            ...row,
            stays: row.stays ?? before?.stays ?? false,
            rotateEveryMinutes: row.rotateEveryMinutes !== undefined ? row.rotateEveryMinutes : (before?.rotateEveryMinutes ?? null),
        };
    });
}
