# Practice Board: Hockey-Native Notation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the practice-planner rink board a hockey vocabulary (semantic stroke actions, player roles, equipment, legend) stored as versioned play data, without losing any existing play.

**Architecture:** `PlayData` gains `version: 2`, semantic `DrawingElement`s (`action`/`path`/`end`), `PlayerIcon.role`, and an `equipment` collection. One pure module (`lib/utils/play-data.ts`) owns the Zod schema, the v1→v2 upgrade, and safe parsing for every read site. Rendering is split into pure geometry (`stroke-geometry.ts`) that is unit-tested without a canvas, and thin canvas painters (`drawing-utils.ts`, `glyphs.ts`). Element mutations move out of the 900-line `RinkBoard.tsx` into pure `element-ops.ts`.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, React 19, MUI v7, Zod v4, Vitest + Testing Library (jsdom, mocked 2D context), Bun.

**Spec:** `docs/superpowers/specs/2026-10-02-practice-board-notation-design.md`

## Global Constraints

- Use `bun` for everything (`bun run test <file>`, `bun run type-check`, `bun run lint`, `bun run build`). Never npm/yarn.
- No Prisma migration. `Play.playData` stays `Json`.
- `PLAY_DATA_VERSION = 2`. Writes accept only v2. Reads accept v1 (no `version` key) and v2.
- Rink coordinates are feet: x 0–200, y 0–85 (`RINK_DIMENSIONS` in `lib/utils/canvas/rink-renderer.ts`).
- Player marker radius **6 ft** (was 12). Glyphs render at least **8 CSS px** radius. Touch hit targets are at least **44 px** across (22 px hit radius).
- `VALIDATION_CONSTRAINTS` keep their values; add `MAX_EQUIPMENT: 50`, `MAX_PLAYER_LABEL_LENGTH: 50`, `MAX_STROKE_POINTS: 1000`. `MAX_ELEMENTS_PER_PLAY` (100) counts players + drawings + equipment + annotations.
- Upgrade never infers stroke meaning from color.
- Digital Playbook palette: League Blue `#0D47A1`, Action Blue `#1976D2`, Penalty Box Red `#D32F2F`, Scoreboard Green `#2E7D32`, ink `#212121`.
- Zod v4 (`z.enum`, `z.literal`, `.issues`; `z.object` strips unknown keys).
- Never `component={Link}` from a Server Component (see `components/ui/NextLinkComposites.tsx`).
- Commit messages: conventional commits, ending with the line
  `Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX`.
- `bun run type-check` and each task's own Vitest files must be green at the end of every task. Task 6 widens `DrawingTool` to a superset so the old board still compiles, and Task 7 narrows it.

## Spec deviations (decided during planning — update the spec in Task 10)

1. **`path: "straight"` means "polyline through the stored points, unsmoothed".** It does not mean "two endpoints". v1 `line`/`arrow` strokes were recorded with every mouse-move point, so endpoints-only rendering would destroy them. New straight strokes store only `[start, end]`, so they look straight.
2. **The playData Zod schema lives in `lib/utils/play-data.ts`**, and `lib/utils/validation.ts` imports it. This avoids `types/` importing from `lib/`.
3. **Secondary tool options are a contextual options row under the tool buttons,** on every breakpoint. There's no popover or bottom sheet. **The inspector is an inline panel between toolbar and board.** Same function, fewer moving parts, no portal/focus edge cases on mobile.
4. **Role glyphs.** `X`, `F` and `D` are filled circles showing `label || role`. `O` is a hollow ring. `G` is a filled circle with a goalie bar. `C` is a triangle. This makes upgraded v1 players (role `X`) look like they did before: a filled circle with their label.
5. **`validatePracticeSessionData` is deleted.** It's test-only and depends on the removed `validatePlayData`.
6. **Stored thumbnails are not regenerated.** A v1 play's library thumbnail stays in the old style until the play is next saved.
7. **The `RinkBoard` interface grows.** The spec said "`RinkBoardHandle` is unchanged", but the handle gains `updateElement(id, patch)` so inspector edits are undoable. The props gain `playerRole`, `strokeOptions`, `equipmentKind`, `onSelectionChange` and `onLimitReached`. Placement logic moves into pure `element-ops.ts` functions.

## Review Focus

1. **v1 rows with points outside the rink** (v1 never bounds-checked stored data) should open, clamped into the rink, not error. Owned by Task 1 (`upgradePlayData` clamps).
2. **v1 freehand strokes with thousands of points** should open and save under the 1000-point cap without changing shape visibly. Owned by Task 1 (`simplifyPoints`) and Task 7 (new freehand strokes are simplified on pointer-up).
3. **A play whose stored JSON is unreadable** should give a clear "couldn't be read" message on the edit page, not a 404 and not an empty board that would overwrite it on save. Owned by Task 2.
4. **Tapping a cone on a phone at full-rink zoom** should select it even though a 1.5–3 ft glyph is a few pixels wide. Owned by Task 5 (`minHitRadiusFt`) and Task 7 (passes `22 / pxPerFt`).
5. **Undo after an inspector edit** should revert exactly that edit. Owned by Task 7 (`updateElement` goes through `updatePlayData` history) and Task 8 (test).

---

### Task 1: v2 play-data model, schema, upgrade, and write path

**Files:**
- Modify: `types/practice-planner.ts` (new types/consts; remove guards, `validatePlayData`, `validatePlayDataJSON`, `validatePracticeSessionData`, `DrawingElementType`, `PlayDataJSON`, `RinkDimensions`)
- Create: `lib/utils/play-data.ts`
- Create: `lib/utils/canvas/notation.ts`
- Modify: `lib/utils/validation.ts:1288,1298` (playData fields)
- Modify: `lib/actions/plays.ts` (drop `validatePlayData`; map playData Zod issues to "Invalid play data")
- Modify: `lib/data/starter-plays.ts` (helpers emit v2)
- Modify: `lib/utils/canvas/interaction-utils.ts:145-157` (`deepClone` → `structuredClone`)
- Modify: `lib/utils/canvas/drawing-utils.ts:306-362` (`drawElement` temporary dispatch on `path`/`end`)
- Modify: `components/features/practice-planner/RinkBoard.tsx` (new player gets `role: "X"`; new drawing uses `strokeFromV1Type`; clear uses `createEmptyPlayData`)
- Modify: `components/features/practice-planner/PlayEditor.tsx:70-76`, `components/features/practice-planner/PlayLibrary.tsx:392` (use `createEmptyPlayData()`)
- Test: `__tests__/lib/utils/play-data.test.ts` (create), `__tests__/types/practice-planner.test.ts`, `__tests__/lib/data/starter-plays.test.ts`, plus fixture fixes surfaced by type-check

**Interfaces:**
- Produces (types, `@/types/practice-planner`):
  - `PLAY_DATA_VERSION = 2`
  - `PLAYER_ROLES = ["X","O","F","D","G","C"] as const`, `type PlayerRole`
  - `STROKE_ACTIONS = ["skate","backskate","carry","pass","shot","lateral","line"] as const`, `type StrokeAction`
  - `STROKE_PATHS = ["straight","freehand"] as const`, `type StrokePath`
  - `STROKE_ENDS = ["arrow","stop","none"] as const`, `type StrokeEnd`
  - `EQUIPMENT_KINDS = ["puck","puckPile","cone","net","tire","pylon"] as const`, `type EquipmentKind`
  - `interface PlayerIcon { id; position; role: PlayerRole; label: string; color: string }`
  - `interface DrawingElement { id; action; path; end; points: Position[]; color; strokeWidth }`
  - `interface EquipmentItem { id; kind: EquipmentKind; position: Position; rotation: number }`
  - `interface PlayData { version: 2; players; drawings; equipment: EquipmentItem[]; annotations }`
  - `type StrokeOptions = Pick<DrawingElement, "action" | "path" | "end">`
- Produces (`@/lib/utils/play-data`): `playDataSchema`, `class PlayDataError extends Error`, `createEmptyPlayData(): PlayData`, `strokeFromV1Type(type: "line"|"curve"|"arrow"): StrokeOptions`, `simplifyPoints(points: Position[], minDistanceFt?: number, maxPoints?: number): Position[]`, `upgradePlayData(raw: unknown): PlayData` (throws `PlayDataError`), `parseStoredPlayData(raw: unknown): { ok: true; data: PlayData } | { ok: false; error: PlayDataError }`, `RINK_WIDTH_FT = 200`, `RINK_HEIGHT_FT = 85`
- Produces (`@/lib/utils/canvas/notation`): `ROLE_LABELS`, `ROLE_DEFAULT_COLORS`, `ACTION_LABELS`, `END_LABELS`, `EQUIPMENT_LABELS`, `DEFAULT_END_FOR_ACTION`

- [ ] **Step 1: Write the failing tests for `play-data.ts`**

Create `__tests__/lib/utils/play-data.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
    playDataSchema,
    upgradePlayData,
    parseStoredPlayData,
    createEmptyPlayData,
    strokeFromV1Type,
    simplifyPoints,
    PlayDataError,
    RINK_WIDTH_FT,
    RINK_HEIGHT_FT,
} from "@/lib/utils/play-data";
import { RINK_DIMENSIONS } from "@/lib/utils/canvas/rink-renderer";
import { VALIDATION_CONSTRAINTS } from "@/types/practice-planner";

// Shape of a play saved before this change (no version key, `type` on drawings).
const v1Play = {
    players: [{ id: "p1", position: { x: 20, y: 30 }, label: "D1", color: "#0000FF" }],
    drawings: [
        { id: "d1", type: "line", points: [{ x: 10, y: 10 }, { x: 15, y: 12 }, { x: 20, y: 10 }], color: "#800080", strokeWidth: 2 },
        { id: "d2", type: "arrow", points: [{ x: 30, y: 30 }, { x: 60, y: 30 }], color: "#000000", strokeWidth: 3 },
        { id: "d3", type: "curve", points: [{ x: 40, y: 40 }, { x: 50, y: 45 }, { x: 60, y: 40 }], color: "#FFA500", strokeWidth: 2 },
    ],
    annotations: [{ id: "a1", text: "Go hard", position: { x: 100, y: 20 }, fontSize: 8, color: "#000000" }],
};

describe("rink constants", () => {
    it("match the renderer", () => {
        expect(RINK_WIDTH_FT).toBe(RINK_DIMENSIONS.width);
        expect(RINK_HEIGHT_FT).toBe(RINK_DIMENSIONS.height);
    });
});

describe("strokeFromV1Type", () => {
    it("maps each v1 type per the spec table", () => {
        expect(strokeFromV1Type("line")).toEqual({ action: "line", path: "straight", end: "none" });
        expect(strokeFromV1Type("arrow")).toEqual({ action: "skate", path: "straight", end: "arrow" });
        expect(strokeFromV1Type("curve")).toEqual({ action: "skate", path: "freehand", end: "none" });
    });
});

describe("upgradePlayData", () => {
    it("upgrades a v1 play losslessly", () => {
        const v2 = upgradePlayData(v1Play);
        expect(v2.version).toBe(2);
        expect(v2.equipment).toEqual([]);
        expect(v2.players[0]).toEqual({ id: "p1", position: { x: 20, y: 30 }, role: "X", label: "D1", color: "#0000FF" });
        expect(v2.drawings.map((d) => [d.id, d.action, d.path, d.end])).toEqual([
            ["d1", "line", "straight", "none"],
            ["d2", "skate", "straight", "arrow"],
            ["d3", "skate", "freehand", "none"],
        ]);
        expect(v2.drawings[0].points).toEqual(v1Play.drawings[0].points);
        expect(v2.drawings[2].color).toBe("#FFA500");
        expect(v2.annotations).toEqual(v1Play.annotations);
        expect("type" in v2.drawings[0]).toBe(false);
    });

    it("is idempotent on v2 data", () => {
        const once = upgradePlayData(v1Play);
        expect(upgradePlayData(once)).toEqual(once);
    });

    it("clamps out-of-rink v1 coordinates instead of failing", () => {
        const v2 = upgradePlayData({
            ...v1Play,
            players: [{ id: "p1", position: { x: -4, y: 90 }, label: "A", color: "#000000" }],
        });
        expect(v2.players[0].position).toEqual({ x: 0, y: 85 });
    });

    it("caps very long v1 freehand strokes at MAX_STROKE_POINTS", () => {
        const points = Array.from({ length: 5000 }, (_, i) => ({ x: (i / 5000) * 200, y: 40 + Math.sin(i / 50) * 5 }));
        const v2 = upgradePlayData({
            players: [],
            annotations: [],
            drawings: [{ id: "long", type: "curve", points, color: "#000000", strokeWidth: 2 }],
        });
        const out = v2.drawings[0].points;
        expect(out.length).toBeLessThanOrEqual(VALIDATION_CONSTRAINTS.MAX_STROKE_POINTS);
        expect(out[0]).toEqual(points[0]);
        expect(out[out.length - 1]).toEqual(points[points.length - 1]);
    });

    it("throws PlayDataError for garbage", () => {
        expect(() => upgradePlayData("nope")).toThrow(PlayDataError);
        expect(() => upgradePlayData({ players: "x" })).toThrow(PlayDataError);
    });

    it("throws PlayDataError for an unknown future version", () => {
        expect(() => upgradePlayData({ ...createEmptyPlayData(), version: 3 })).toThrow(PlayDataError);
    });
});

describe("parseStoredPlayData", () => {
    it("returns ok for v1 and v2", () => {
        expect(parseStoredPlayData(v1Play).ok).toBe(true);
        expect(parseStoredPlayData(createEmptyPlayData()).ok).toBe(true);
    });

    it("returns an error result instead of throwing", () => {
        const result = parseStoredPlayData(null);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBeInstanceOf(PlayDataError);
    });
});

describe("playDataSchema", () => {
    const base = createEmptyPlayData();

    it("accepts an empty v2 play", () => {
        expect(playDataSchema.safeParse(base).success).toBe(true);
    });

    it("rejects v1 data on write", () => {
        expect(playDataSchema.safeParse(v1Play).success).toBe(false);
    });

    it("rejects positions outside the rink", () => {
        const bad = { ...base, equipment: [{ id: "c", kind: "cone", position: { x: 201, y: 10 }, rotation: 0 }] };
        expect(playDataSchema.safeParse(bad).success).toBe(false);
    });

    it("rejects strokes with fewer than two points", () => {
        const bad = {
            ...base,
            drawings: [{ id: "s", action: "pass", path: "straight", end: "arrow", points: [{ x: 1, y: 1 }], color: "#000000", strokeWidth: 2 }],
        };
        expect(playDataSchema.safeParse(bad).success).toBe(false);
    });

    it("rejects more than MAX_EQUIPMENT items", () => {
        const equipment = Array.from({ length: VALIDATION_CONSTRAINTS.MAX_EQUIPMENT + 1 }, (_, i) => ({
            id: `c${i}`, kind: "cone", position: { x: 10, y: 10 }, rotation: 0,
        }));
        expect(playDataSchema.safeParse({ ...base, equipment }).success).toBe(false);
    });

    it("enforces MAX_ELEMENTS_PER_PLAY across all collections", () => {
        const equipment = Array.from({ length: 50 }, (_, i) => ({ id: `e${i}`, kind: "puck", position: { x: 5, y: 5 }, rotation: 0 }));
        const players = Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, position: { x: 5, y: 5 }, role: "X", label: "", color: "#000000" }));
        const annotations = [{ id: "a", text: "x", position: { x: 5, y: 5 }, fontSize: 8, color: "#000000" }];
        expect(playDataSchema.safeParse({ ...base, equipment, players, annotations }).success).toBe(false);
    });

    it("allows an empty player label", () => {
        const ok = { ...base, players: [{ id: "p", position: { x: 5, y: 5 }, role: "O", label: "", color: "#D32F2F" }] };
        expect(playDataSchema.safeParse(ok).success).toBe(true);
    });
});

describe("simplifyPoints", () => {
    it("drops points closer than the minimum distance but keeps endpoints", () => {
        const pts = [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.2, y: 0 }, { x: 5, y: 0 }, { x: 5.1, y: 0 }];
        expect(simplifyPoints(pts, 0.5)).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5.1, y: 0 }]);
    });

    it("never returns fewer than two points for a two-point input", () => {
        expect(simplifyPoints([{ x: 1, y: 1 }, { x: 1.1, y: 1 }], 0.5)).toHaveLength(2);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test __tests__/lib/utils/play-data.test.ts`
Expected: FAIL, "Failed to resolve import "@/lib/utils/play-data"".

- [ ] **Step 3: Update `types/practice-planner.ts`**

Replace the Core Play Data Types section (from `export interface PlayerIcon` through `export interface PlayData { … }`) with:

```ts
/** Current stored play-data schema version. v1 = object without a `version` key. */
export const PLAY_DATA_VERSION = 2 as const;

export const PLAYER_ROLES = ["X", "O", "F", "D", "G", "C"] as const;
/** X/O generic skaters (us/them), F forward, D defense, G goalie, C coach */
export type PlayerRole = (typeof PLAYER_ROLES)[number];

export const STROKE_ACTIONS = ["skate", "backskate", "carry", "pass", "shot", "lateral", "line"] as const;
export type StrokeAction = (typeof STROKE_ACTIONS)[number];

/** straight = polyline through stored points, unsmoothed; freehand = smoothed */
export const STROKE_PATHS = ["straight", "freehand"] as const;
export type StrokePath = (typeof STROKE_PATHS)[number];

export const STROKE_ENDS = ["arrow", "stop", "none"] as const;
export type StrokeEnd = (typeof STROKE_ENDS)[number];

export const EQUIPMENT_KINDS = ["puck", "puckPile", "cone", "net", "tire", "pylon"] as const;
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];

export interface PlayerIcon {
    id: string;
    position: Position;
    role: PlayerRole;
    /** Short text shown in the marker; "" falls back to the role letter */
    label: string;
    color: string;
}

export interface DrawingElement {
    id: string;
    action: StrokeAction;
    path: StrokePath;
    end: StrokeEnd;
    points: Position[];
    color: string;
    strokeWidth: number;
}

export type StrokeOptions = Pick<DrawingElement, "action" | "path" | "end">;

export interface EquipmentItem {
    id: string;
    kind: EquipmentKind;
    position: Position;
    /** Degrees in [0, 360); only meaningful for nets */
    rotation: number;
}

export interface TextAnnotation {
    id: string;
    text: string;
    position: Position;
    fontSize: number;
    color: string;
}

export interface PlayData {
    version: typeof PLAY_DATA_VERSION;
    players: PlayerIcon[];
    drawings: DrawingElement[];
    equipment: EquipmentItem[];
    annotations: TextAnnotation[];
}
```

Delete `DrawingElementType`, the whole "JSON Storage Schema Types" section (`RinkDimensions`, `PlayDataJSON`), and the functions `isValidPosition`, `isValidPlayerIcon`, `isValidDrawingElement`, `isValidTextAnnotation`, `validatePlayData`, `validatePlayDataJSON`, `validatePracticeSessionData`. Keep `ValidationResult`, `ValidationError`, `validateSessionDuration`, `validatePlayDurations`. Leave `DrawingTool` unchanged (Task 6 changes it). Extend the constraints:

```ts
export const VALIDATION_CONSTRAINTS = {
    MAX_ELEMENTS_PER_PLAY: 100,
    MAX_ANNOTATION_LENGTH: 500,
    MIN_DURATION: 1,
    MAX_DURATION: 300,
    MAX_PLAYERS: 50,
    MAX_DRAWINGS: 100,
    MAX_ANNOTATIONS: 20,
    MAX_EQUIPMENT: 50,
    MAX_PLAYER_LABEL_LENGTH: 50,
    MAX_STROKE_POINTS: 1000,
} as const;
```

- [ ] **Step 4: Create `lib/utils/play-data.ts`**

```ts
/**
 * Play-data schema, versioning, and safe parsing for the practice planner.
 *
 * Every place that turns a stored `Play.playData` JSON value into `PlayData`
 * MUST go through `parseStoredPlayData` (or `upgradePlayData`): rows saved
 * before v2 still exist in the database and only upgrade when next saved.
 * Pure module: safe to import from Server Actions and Client Components.
 */

import { z } from "zod";
import {
    EQUIPMENT_KINDS,
    PLAY_DATA_VERSION,
    PLAYER_ROLES,
    STROKE_ACTIONS,
    STROKE_ENDS,
    STROKE_PATHS,
    VALIDATION_CONSTRAINTS as C,
    type PlayData,
    type Position,
    type StrokeOptions,
} from "@/types/practice-planner";

/** Mirrors RINK_DIMENSIONS in lib/utils/canvas/rink-renderer.ts (asserted in tests). */
export const RINK_WIDTH_FT = 200;
export const RINK_HEIGHT_FT = 85;

const MAX_STROKE_WIDTH = 20;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export class PlayDataError extends Error {
    constructor(message: string, cause?: unknown) {
        super(message, { cause });
        this.name = "PlayDataError";
    }
}

const idSchema = z.string().min(1).max(100);
const colorSchema = z.string().regex(HEX_COLOR);
const positionSchema = z.object({
    x: z.number().min(0).max(RINK_WIDTH_FT),
    y: z.number().min(0).max(RINK_HEIGHT_FT),
});

const playerSchema = z.object({
    id: idSchema,
    position: positionSchema,
    role: z.enum(PLAYER_ROLES),
    label: z.string().max(C.MAX_PLAYER_LABEL_LENGTH),
    color: colorSchema,
});

const drawingSchema = z.object({
    id: idSchema,
    action: z.enum(STROKE_ACTIONS),
    path: z.enum(STROKE_PATHS),
    end: z.enum(STROKE_ENDS),
    points: z.array(positionSchema).min(2).max(C.MAX_STROKE_POINTS),
    color: colorSchema,
    strokeWidth: z.number().positive().max(MAX_STROKE_WIDTH),
});

const equipmentSchema = z.object({
    id: idSchema,
    kind: z.enum(EQUIPMENT_KINDS),
    position: positionSchema,
    rotation: z.number().min(0).lt(360),
});

const annotationSchema = z.object({
    id: idSchema,
    text: z.string().max(C.MAX_ANNOTATION_LENGTH).refine((t) => t.trim().length > 0, "Text is required"),
    position: positionSchema,
    fontSize: z.number().positive().max(200),
    color: colorSchema,
});

export const playDataSchema = z
    .object({
        version: z.literal(PLAY_DATA_VERSION),
        players: z.array(playerSchema).max(C.MAX_PLAYERS),
        drawings: z.array(drawingSchema).max(C.MAX_DRAWINGS),
        equipment: z.array(equipmentSchema).max(C.MAX_EQUIPMENT),
        annotations: z.array(annotationSchema).max(C.MAX_ANNOTATIONS),
    })
    .refine(
        (d) => d.players.length + d.drawings.length + d.equipment.length + d.annotations.length <= C.MAX_ELEMENTS_PER_PLAY,
        { message: `Maximum ${C.MAX_ELEMENTS_PER_PLAY} total elements allowed per play`, path: ["playData"] }
    );

// ---------------------------------------------------------------------------
// v1 (no `version` key). Lenient: mirrors the old hand-written guards, which
// never bounds-checked coordinates or capped point counts.
// ---------------------------------------------------------------------------

const looseXY = z.object({ x: z.number(), y: z.number() });

const v1Schema = z.object({
    players: z.array(z.object({ id: z.string().min(1), position: looseXY, label: z.string(), color: colorSchema })),
    drawings: z.array(
        z.object({
            id: z.string().min(1),
            type: z.enum(["line", "curve", "arrow"]),
            points: z.array(looseXY).min(2),
            color: colorSchema,
            strokeWidth: z.number().positive(),
        })
    ),
    annotations: z.array(
        z.object({ id: z.string().min(1), text: z.string(), position: looseXY, fontSize: z.number().positive(), color: colorSchema })
    ),
});

export function strokeFromV1Type(type: "line" | "curve" | "arrow"): StrokeOptions {
    switch (type) {
        case "line":
            return { action: "line", path: "straight", end: "none" };
        case "arrow":
            return { action: "skate", path: "straight", end: "arrow" };
        case "curve":
            return { action: "skate", path: "freehand", end: "none" };
    }
}

function clampToRink(p: { x: number; y: number }): Position {
    return {
        x: Math.min(RINK_WIDTH_FT, Math.max(0, p.x)),
        y: Math.min(RINK_HEIGHT_FT, Math.max(0, p.y)),
    };
}

/**
 * Drops points closer than `minDistanceFt` to the last kept point (endpoints
 * always kept), then evenly decimates to at most `maxPoints`.
 */
export function simplifyPoints(
    points: Position[],
    minDistanceFt = 0.5,
    maxPoints: number = C.MAX_STROKE_POINTS
): Position[] {
    if (points.length <= 2) return points.map((p) => ({ ...p }));
    const kept: Position[] = [{ ...points[0] }];
    for (let i = 1; i < points.length - 1; i++) {
        const last = kept[kept.length - 1];
        if (Math.hypot(points[i].x - last.x, points[i].y - last.y) >= minDistanceFt) kept.push({ ...points[i] });
    }
    kept.push({ ...points[points.length - 1] });
    if (kept.length <= maxPoints) return kept;
    const step = (kept.length - 1) / (maxPoints - 1);
    return Array.from({ length: maxPoints }, (_, i) => kept[Math.round(i * step)]);
}

export function createEmptyPlayData(): PlayData {
    return { version: PLAY_DATA_VERSION, players: [], drawings: [], equipment: [], annotations: [] };
}

function parseV2(raw: unknown): PlayData {
    const result = playDataSchema.safeParse(raw);
    if (!result.success) throw new PlayDataError("Play data failed validation", result.error);
    return result.data as PlayData;
}

/** Converts stored play data of any supported version to v2. Throws PlayDataError. */
export function upgradePlayData(raw: unknown): PlayData {
    if (typeof raw !== "object" || raw === null) throw new PlayDataError("Play data must be an object");

    if ("version" in raw) {
        if ((raw as { version: unknown }).version !== PLAY_DATA_VERSION) {
            throw new PlayDataError(`Unsupported play data version: ${String((raw as { version: unknown }).version)}`);
        }
        return parseV2(raw);
    }

    const v1 = v1Schema.safeParse(raw);
    if (!v1.success) throw new PlayDataError("Unrecognized play data", v1.error);

    return parseV2({
        version: PLAY_DATA_VERSION,
        players: v1.data.players.map((p) => ({
            id: p.id,
            position: clampToRink(p.position),
            role: "X",
            label: p.label.slice(0, C.MAX_PLAYER_LABEL_LENGTH),
            color: p.color,
        })),
        drawings: v1.data.drawings.map((d) => ({
            id: d.id,
            ...strokeFromV1Type(d.type),
            points: simplifyPoints(d.points.map(clampToRink), 0),
            color: d.color,
            strokeWidth: Math.min(MAX_STROKE_WIDTH, d.strokeWidth),
        })),
        equipment: [],
        annotations: v1.data.annotations.map((a) => ({ ...a, position: clampToRink(a.position) })),
    });
}

export type ParsedPlayData = { ok: true; data: PlayData } | { ok: false; error: PlayDataError };

/** Non-throwing wrapper for read sites. */
export function parseStoredPlayData(raw: unknown): ParsedPlayData {
    try {
        return { ok: true, data: upgradePlayData(raw) };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof PlayDataError ? error : new PlayDataError("Unreadable play data", error),
        };
    }
}
```

Note that `simplifyPoints(..., 0)` for v1 keeps every point (it only decimates above the cap). That's what preserves shape on upgrade.

- [ ] **Step 5: Create `lib/utils/canvas/notation.ts`**

```ts
/**
 * Display vocabulary for practice-board notation: labels and default colors.
 * Used by the toolbar, inspector, legend, and glyph renderers.
 */
import type { EquipmentKind, PlayerRole, StrokeAction, StrokeEnd } from "@/types/practice-planner";

export const BOARD_COLORS = {
    leagueBlue: "#0D47A1",
    actionBlue: "#1976D2",
    penaltyRed: "#D32F2F",
    scoreboardGreen: "#2E7D32",
    ink: "#212121",
} as const;

export const ROLE_LABELS: Record<PlayerRole, string> = {
    X: "Skater",
    O: "Opponent",
    F: "Forward",
    D: "Defense",
    G: "Goalie",
    C: "Coach",
};

export const ROLE_DEFAULT_COLORS: Record<PlayerRole, string> = {
    X: BOARD_COLORS.actionBlue,
    O: BOARD_COLORS.penaltyRed,
    F: BOARD_COLORS.actionBlue,
    D: BOARD_COLORS.leagueBlue,
    G: BOARD_COLORS.ink,
    C: BOARD_COLORS.scoreboardGreen,
};

export const ACTION_LABELS: Record<StrokeAction, string> = {
    skate: "Skate",
    backskate: "Backward skate",
    carry: "Puck carry",
    pass: "Pass",
    shot: "Shot",
    lateral: "Lateral / crossovers",
    line: "Line",
};

export const END_LABELS: Record<StrokeEnd, string> = {
    arrow: "Arrow",
    stop: "Stop",
    none: "No end",
};

export const EQUIPMENT_LABELS: Record<EquipmentKind, string> = {
    puck: "Puck",
    puckPile: "Puck pile",
    cone: "Cone",
    net: "Net",
    tire: "Tire",
    pylon: "Pylon",
};

export const DEFAULT_END_FOR_ACTION: Record<StrokeAction, StrokeEnd> = {
    skate: "arrow",
    backskate: "arrow",
    carry: "arrow",
    pass: "arrow",
    shot: "arrow",
    lateral: "arrow",
    line: "none",
};
```

- [ ] **Step 6: Run the play-data tests**

Run: `bun run test __tests__/lib/utils/play-data.test.ts`
Expected: PASS.

- [ ] **Step 7: Switch the write path to the schema**

In `lib/utils/validation.ts` add `import { playDataSchema } from "@/lib/utils/play-data";` beside the other imports. Replace both `playData: z.any(), // Will be validated separately with custom validation` lines with `playData: playDataSchema,`.

In `lib/actions/plays.ts`:
- Change the types import to `import { VALIDATION_CONSTRAINTS, type PlayData } from "@/types/practice-planner";`. That drops `validatePlayData`.
- In `createPlay` and `updatePlay`, delete the `// Validate PlayData structure` block (the `validatePlayData` call and its early return).
- Change `sanitizePlayData(validated.playData as PlayData)` to `sanitizePlayData(validated.playData)`.
- In the `catch` of both functions, replace the `ZodError` branch with:

```ts
        if (error instanceof z.ZodError) {
            const isPlayData = error.issues.some((issue) => issue.path[0] === "playData");
            return {
                success: false,
                error: isPlayData ? "Invalid play data" : "Invalid input",
                details: error.issues,
            };
        }
```

In `sanitizePlayData`, use `VALIDATION_CONSTRAINTS.MAX_PLAYER_LABEL_LENGTH` and delete the local `MAX_PLAYER_LABEL_LENGTH` const.

- [ ] **Step 8: Mechanical compile fixes in consumers**

`lib/utils/canvas/interaction-utils.ts`: replace the body of `deepClone` with `return structuredClone(playData);`.

`lib/utils/canvas/drawing-utils.ts` `drawElement`: replace the `switch (element.type) { … }` with this temporary dispatch, which Task 3 replaces:

```ts
    const showArrow = element.end === "arrow";
    if (element.path === "freehand") {
        drawCurve(ctx, element.points, element.color, element.strokeWidth, transform, showArrow);
    } else {
        drawLine(ctx, element.points, element.color, element.strokeWidth, transform, showArrow);
    }
```

`components/features/practice-planner/RinkBoard.tsx`:
- Import `createEmptyPlayData, strokeFromV1Type` from `@/lib/utils/play-data`.
- `newPlayer` gets `role: "X",`.
- `newDrawing` becomes:
  `{ id: generateId(), ...strokeFromV1Type(selectedTool as "line" | "curve" | "arrow"), points: currentDrawingPoints, color: selectedColor, strokeWidth: 2 }`
- `handleClear`'s `clearedData` becomes `createEmptyPlayData()`.
- The Delete-key handler and eraser keep their filters, and add `equipment: playData.equipment` implicitly via the spread. No change is needed.

`components/features/practice-planner/PlayEditor.tsx:70-76`: `useState<PlayData>(initialData?.playData || createEmptyPlayData())`, importing `createEmptyPlayData` from `@/lib/utils/play-data`.

`components/features/practice-planner/PlayLibrary.tsx:392`: `playData: createEmptyPlayData(), // Will be loaded when needed`, with the import added.

- [ ] **Step 9: Make starter plays v2**

In `lib/data/starter-plays.ts`, update the imports to include `EquipmentItem, PlayerRole, StrokeAction` and `PLAY_DATA_VERSION`. Then replace the helpers:

```ts
type Side = "us" | "them" | "goalie";

function player(id: string, label: string, x: number, y: number, side: Side = "us"): PlayerIcon {
    // A label "C" means center (a forward), never coach.
    const role: PlayerRole = side === "them" ? "O" : side === "goalie" ? "G" : label.startsWith("D") ? "D" : "F";
    return { id, role, label, position: { x, y }, color: ROLE_DEFAULT_COLORS[role] };
}

function stroke(action: StrokeAction, id: string, color: string, strokeWidth: number, points: Point[]): DrawingElement {
    return { id, action, path: "straight", end: DEFAULT_END_FOR_ACTION[action], points: toPositions(points), color, strokeWidth };
}

const skate = (id: string, ...points: Point[]) => stroke("skate", id, SKATE_COLOR, 3, points);
const pass = (id: string, ...points: Point[]) => stroke("pass", id, PASS_COLOR, 2, points);
const shot = (id: string, ...points: Point[]) => stroke("shot", id, SHOT_COLOR, 2, points);
const opponentRoute = (id: string, ...points: Point[]) => stroke("skate", id, OPPONENT_ROUTE_COLOR, 2, points);
const zoneLine = (id: string, ...points: Point[]) => stroke("line", id, ZONE_COLOR, 2, points);
```

Delete the `OUR_TEAM` and `GOALIE` constants. Change the four call sites that pass a side: `player("pk-o1", …, OPPONENT)`, `pk-o2`, `fc-o1` become `…, "them")`, and `player("dz-g", …, GOALIE)` becomes `…, "goalie")`. Rename `OPPONENT` to `OPPONENT_ROUTE_COLOR`, used only by `opponentRoute`. Set the stroke colors to the theme: `SKATE_COLOR = "#212121"`, `PASS_COLOR = "#1976D2"`, `SHOT_COLOR = "#D32F2F"`, `OPPONENT_ROUTE_COLOR = "#D32F2F"`, `ZONE_COLOR = "#0D47A1"`. Import `ROLE_DEFAULT_COLORS, DEFAULT_END_FOR_ACTION` from `@/lib/utils/canvas/notation`. Add `version: PLAY_DATA_VERSION,` and `equipment: [],` to every `playData` literal; add 2–4 equipment items to at least the "3-Man Weave" (pucks at the start lane, a net) and "Point Shot with Screen" (puck pile at the point) plays, e.g.

```ts
            equipment: [
                { id: "wv-pucks", kind: "puckPile", position: { x: 8, y: 42.5 }, rotation: 0 },
                { id: "wv-net", kind: "net", position: { x: 189, y: 42.5 }, rotation: 0 },
            ],
```

Rewrite the header comment's "Diagram conventions" block to say that meaning is carried by `action` and `role`, colors are theme defaults, and player markers are 6 ft radius with centers ≥ 12 ft apart.

- [ ] **Step 10: Migrate tests**

`__tests__/lib/data/starter-plays.test.ts`: import `playDataSchema` from `@/lib/utils/play-data` instead of `validatePlayData`. Replace the validation test with:

```ts
            it("passes the v2 play-data schema", () => {
                const result = playDataSchema.safeParse(play.playData);
                expect(result.success ? [] : result.error.issues).toEqual([]);
            });
```

Add `...play.playData.equipment.map((e) => e.id)` to the id-uniqueness list, and an equipment loop to the rink-bounds test. Add:

```ts
            it("tags passes and shots semantically (not just by color)", () => {
                for (const d of play.playData.drawings) {
                    if (d.id.includes("pass")) expect(d.action).toBe("pass");
                    if (d.id.includes("shot")) expect(d.action).toBe("shot");
                }
            });
```

`__tests__/types/practice-planner.test.ts`: delete the `describe` blocks for `isValidPosition`, `isValidPlayerIcon`, `isValidDrawingElement`, `isValidTextAnnotation`, `validatePlayData`, `validatePlayDataJSON`, and `validatePracticeSessionData`, plus the edge-case `it`s that call those functions (lines ~925–952). Their behavior is now covered by `play-data.test.ts`. Remove the deleted names from the import. Keep the `validateSessionDuration` and `validatePlayDurations` tests. Change every `playData: { players: [], drawings: [], annotations: [] }` fixture to `playData: createEmptyPlayData()`.

Then run `bun run type-check` and fix every remaining fixture it reports. Expect at least `__tests__/components/features/practice-planner/RinkBoard.test.tsx`, `PlayLibrary.test.tsx`, `PlayEditor.test.tsx`, and `__tests__/lib/utils/canvas/interaction-utils.test.ts`. For each one, add `version: 2` and `equipment: []`, add `role: "X"` to players, and replace `type: "x"` on drawings with `...strokeFromV1Type("x")`.

- [ ] **Step 11: Run all practice-planner tests and type-check**

Run: `bun run test __tests__/lib/utils/play-data.test.ts __tests__/types/practice-planner.test.ts __tests__/lib/data/starter-plays.test.ts __tests__/components/features/practice-planner __tests__/lib/utils/canvas`
Expected: PASS.
Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add types/practice-planner.ts lib/utils/play-data.ts lib/utils/canvas/notation.ts lib/utils/validation.ts lib/actions/plays.ts lib/data/starter-plays.ts lib/utils/canvas/interaction-utils.ts lib/utils/canvas/drawing-utils.ts components/features/practice-planner __tests__
git commit -m "feat(practice-planner): versioned v2 play data with semantic strokes, roles, equipment

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 2: Route every play-data read through `parseStoredPlayData`

**Files:**
- Modify: `lib/actions/plays.ts` (`getPlayById`)
- Modify: `lib/actions/practice-sessions.ts:1268` (`getPracticeSessionById`)
- Modify: `lib/actions/practice-session-queries.ts:132-190` (`getPracticeSessionDetail` returns parsed `playData`) and `:265` (`getPracticeSessionForEdit`)
- Modify: `app/(dashboard)/practice-planner/library/[playId]/edit/page.tsx` (unreadable vs not found)
- Test: `__tests__/lib/actions/plays-read.test.ts` (create)

**Interfaces:**
- Consumes: `parseStoredPlayData`, `createEmptyPlayData` (Task 1)
- Produces:
  - `getPlayById` failure for unreadable data: `{ success: false, error: PLAY_DATA_UNREADABLE_MESSAGE, details: { code: "PLAY_DATA_UNREADABLE" } }`
  - `export const PLAY_DATA_UNREADABLE_MESSAGE = "This play's diagram couldn't be read."`, exported from `lib/utils/play-data.ts`, not from the `"use server"` file
  - `getPracticeSessionDetail().session.plays[i].play.playData: PlayData | null`. `null` means unreadable; the legend is hidden.

- [ ] **Step 1: Write the failing test**

Look at how `__tests__/lib/actions/practice-sessions.test.ts` mocks `@/lib/db/prisma` and `@/lib/auth/session`, and copy its `vi.mock` setup. Create `__tests__/lib/actions/plays-read.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: { play: { findUnique: vi.fn() } } }));
vi.mock("@/lib/auth/session", () => ({ requireTeamMember: vi.fn(), requireTeamAdmin: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db/prisma";
import { getPlayById } from "@/lib/actions/plays";
import { PLAY_DATA_UNREADABLE_MESSAGE } from "@/lib/utils/play-data";

const TEAM = "cjld2cjxh0000qzrmn831i7rn";
const PLAY = "cjld2cyuq0000t3rmniod1foy";
const row = (playData: unknown) => ({
    id: PLAY, name: "Old drill", description: null, thumbnail: null, playData,
    isTemplate: true, teamId: TEAM, createdAt: new Date(), updatedAt: new Date(),
});

describe("getPlayById read path", () => {
    beforeEach(() => vi.clearAllMocks());

    it("upgrades a v1 row to v2", async () => {
        vi.mocked(prisma.play.findUnique).mockResolvedValue(row({
            players: [{ id: "p", position: { x: 1, y: 1 }, label: "A", color: "#000000" }],
            drawings: [{ id: "d", type: "arrow", points: [{ x: 1, y: 1 }, { x: 9, y: 9 }], color: "#000000", strokeWidth: 2 }],
            annotations: [],
        }) as never);
        const result = await getPlayById({ id: PLAY, teamId: TEAM });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.playData.version).toBe(2);
            expect(result.data.playData.drawings[0]).toMatchObject({ action: "skate", end: "arrow" });
            expect(result.data.playData.players[0].role).toBe("X");
        }
    });

    it("reports unreadable data distinctly instead of returning an empty board", async () => {
        vi.mocked(prisma.play.findUnique).mockResolvedValue(row({ players: "corrupt" }) as never);
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        const result = await getPlayById({ id: PLAY, teamId: TEAM });
        expect(result).toEqual({
            success: false,
            error: PLAY_DATA_UNREADABLE_MESSAGE,
            details: { code: "PLAY_DATA_UNREADABLE" },
        });
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test __tests__/lib/actions/plays-read.test.ts`
Expected: FAIL. The import of `PLAY_DATA_UNREADABLE_MESSAGE` is undefined, and the v1 drawing has no `action`.

- [ ] **Step 3: Implement**

In `lib/utils/play-data.ts` add:

```ts
export const PLAY_DATA_UNREADABLE_MESSAGE = "This play's diagram couldn't be read.";
export const PLAY_DATA_UNREADABLE_CODE = "PLAY_DATA_UNREADABLE";
```

In `getPlayById` (`lib/actions/plays.ts`), after the team check:

```ts
        const parsed = parseStoredPlayData(play.playData);
        if (!parsed.ok) {
            console.error(`Unreadable playData for play ${play.id}:`, parsed.error);
            return {
                success: false,
                error: PLAY_DATA_UNREADABLE_MESSAGE,
                details: { code: PLAY_DATA_UNREADABLE_CODE },
            };
        }
```

and use `playData: parsed.data` in the success result.

In `lib/actions/practice-sessions.ts:1268` and `lib/actions/practice-session-queries.ts:265`, replace the cast with a helper defined once in `lib/utils/play-data.ts`:

```ts
/**
 * For session read paths where plays' playData is display/carry-only and is
 * never written back: an unreadable play becomes an empty board, logged.
 */
export function playDataOrEmpty(raw: unknown, context: string): PlayData {
    const parsed = parseStoredPlayData(raw);
    if (parsed.ok) return parsed.data;
    console.error(`Unreadable playData (${context}):`, parsed.error);
    return createEmptyPlayData();
}
```

Use it like this: `playData: playDataOrEmpty(p.play.playData, \`play ${p.play.id}\`)`. Before using it, confirm by grep that `updatePracticeSession`/`createPracticeSession` never write `playData` (`grep -n playData lib/actions/practice-sessions.ts` should show only reads). If they do write it, stop and report back.

In `getPracticeSessionDetail`, add `playData: PlayData | null;` to the `play` type, and map it with:

```ts
          playData: (() => {
            const parsed = parseStoredPlayData(sp.play.playData);
            if (!parsed.ok) console.error(`Unreadable playData (play ${sp.play.id}):`, parsed.error);
            return parsed.ok ? parsed.data : null;
          })(),
```

Then re-grep the codebase for anything that still casts stored play data:

Run: `grep -rn "playData as\|\.playData as unknown" lib app components`
Expected: no matches.

In `app/(dashboard)/practice-planner/library/[playId]/edit/page.tsx`, replace `if (!result.success) { notFound(); }` with:

```tsx
  if (!result.success) {
    const details = result.details as { code?: string } | undefined;
    if (details?.code !== PLAY_DATA_UNREADABLE_CODE) notFound();
    return (
      <PageContainer>
        <Alert severity="error">
          {result.error} Editing is disabled so the stored drawing isn&apos;t overwritten.
        </Alert>
        <LinkButton href="/practice-planner/library" startIcon={<ArrowBackIcon />} sx={{ mt: 2 }}>
          Back to Play Library
        </LinkButton>
      </PageContainer>
    );
  }
```

Import `PLAY_DATA_UNREADABLE_CODE` from `@/lib/utils/play-data`. `PlayLibrary.tsx`'s select path already shows `result.error` in an Alert, so no change is needed there.

- [ ] **Step 4: Run tests and type-check**

Run: `bun run test __tests__/lib/actions/plays-read.test.ts __tests__/lib/actions/practice-sessions.test.ts`
Expected: PASS.
Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/play-data.ts lib/actions/plays.ts lib/actions/practice-sessions.ts lib/actions/practice-session-queries.ts "app/(dashboard)/practice-planner/library/[playId]/edit/page.tsx" __tests__/lib/actions/plays-read.test.ts
git commit -m "feat(practice-planner): upgrade stored play data on every read path

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 3: Stroke geometry and action rendering

**Files:**
- Create: `lib/utils/canvas/stroke-geometry.ts` (pure, canvas-free)
- Modify: `lib/utils/canvas/drawing-utils.ts` (replace `drawLine`/`drawCurve`/`drawArrow`/temporary dispatch with `drawStroke`)
- Test: `__tests__/lib/utils/canvas/stroke-geometry.test.ts` (create), `__tests__/lib/utils/canvas/drawing-utils.test.ts` (create)

**Interfaces:**
- Consumes: `DrawingElement`, `StrokeOptions`, `Position` (Task 1); `TransformContext`, `rinkToCanvas` (`rink-renderer.ts`)
- Produces (`stroke-geometry.ts`):
  - `smoothPath(points: Position[], iterations?: number): Position[]` (Chaikin, endpoints fixed)
  - `resampleByArcLength(points: Position[], spacing: number): Position[]`
  - `interface StrokeGeometry { polylines: Position[][]; lineWidth: number; end: { type: StrokeEnd; tip: Position; angle: number } | null }`
  - `buildStrokeGeometry(stroke: StrokeOptions & { points: Position[]; strokeWidth: number }, pxPerFt: number): StrokeGeometry`. The input points are already in **canvas px**, and every output is in canvas px.
  - `ACTION_PATTERN: Record<StrokeAction, "solid" | "ticks" | "wave" | "dashed" | "double" | "zigzag" | "thin">`
- Produces (`drawing-utils.ts`): `drawStroke(ctx, stroke: StrokeOptions & { points: Position[]; color: string; strokeWidth: number }, transform: TransformContext): void`. `drawElement(ctx, element, transform, isSelected)` keeps its signature.

Pattern dimensions, in feet (multiply by `pxPerFt`, and clamp with `Math.max(..., minPx)` so thumbnails stay legible):

| pattern | parameter |
|---|---|
| wave (carry) | amplitude 1.0 ft (min 1.5 px), wavelength 4 ft (min 6 px) |
| zigzag (lateral) | amplitude 1.2 ft (min 1.5 px), wavelength 3 ft (min 5 px) |
| ticks (backskate) | tick every 4 ft (min 6 px), tick half-length 1.2 ft (min 2 px) |
| dashed (pass) | dash 2.5 ft (min 4 px), gap 1.5 ft (min 3 px) |
| double (shot) | rails at ±0.7 ft (min 1.5 px) |
| thin (line) | lineWidth × 0.75 |
| stop end | bar half-length 1.8 ft (min 4 px) |

- [ ] **Step 1: Write the failing geometry tests**

Create `__tests__/lib/utils/canvas/stroke-geometry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildStrokeGeometry, resampleByArcLength, smoothPath, ACTION_PATTERN } from "@/lib/utils/canvas/stroke-geometry";
import { STROKE_ACTIONS, type StrokeAction } from "@/types/practice-planner";

const straight = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
const geom = (action: StrokeAction, end: "arrow" | "stop" | "none" = "arrow", points = straight) =>
    buildStrokeGeometry({ action, path: "straight", end, points, strokeWidth: 2 }, 4);

describe("resampleByArcLength", () => {
    it("spaces points evenly and keeps the endpoint", () => {
        const out = resampleByArcLength(straight, 10);
        expect(out[0]).toEqual({ x: 0, y: 0 });
        expect(out[out.length - 1]).toEqual({ x: 100, y: 0 });
        expect(out.length).toBe(11);
        expect(out[3].x).toBeCloseTo(30);
    });
});

describe("smoothPath", () => {
    it("keeps endpoints and adds points", () => {
        const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }];
        const out = smoothPath(pts);
        expect(out[0]).toEqual(pts[0]);
        expect(out[out.length - 1]).toEqual(pts[2]);
        expect(out.length).toBeGreaterThan(pts.length);
    });
});

describe("buildStrokeGeometry", () => {
    it("has a pattern for every action", () => {
        for (const a of STROKE_ACTIONS) expect(ACTION_PATTERN[a]).toBeDefined();
    });

    it("skate is one straight polyline", () => {
        const g = geom("skate");
        expect(g.polylines).toHaveLength(1);
        expect(g.polylines[0].every((p) => p.y === 0)).toBe(true);
    });

    it("carry is a wave that leaves the centerline on both sides", () => {
        const ys = geom("carry").polylines[0].map((p) => p.y);
        expect(Math.max(...ys)).toBeGreaterThan(1);
        expect(Math.min(...ys)).toBeLessThan(-1);
    });

    it("lateral is a zigzag (piecewise linear, alternating sides)", () => {
        const ys = geom("lateral").polylines[0].map((p) => Math.sign(Math.round(p.y)));
        expect(ys.filter((s) => s > 0).length).toBeGreaterThan(2);
        expect(ys.filter((s) => s < 0).length).toBeGreaterThan(2);
    });

    it("pass is many short dash segments", () => {
        const g = geom("pass");
        expect(g.polylines.length).toBeGreaterThan(5);
        for (const seg of g.polylines) {
            const len = Math.hypot(seg[seg.length - 1].x - seg[0].x, seg[seg.length - 1].y - seg[0].y);
            expect(len).toBeLessThanOrEqual(10.01);
        }
    });

    it("shot is two parallel rails", () => {
        const g = geom("shot");
        expect(g.polylines).toHaveLength(2);
        expect(g.polylines[0][0].y).toBeCloseTo(-g.polylines[1][0].y);
        expect(Math.abs(g.polylines[0][0].y)).toBeGreaterThan(0);
    });

    it("backskate is a centerline plus perpendicular ticks", () => {
        const g = geom("backskate");
        expect(g.polylines.length).toBeGreaterThan(3);
        const tick = g.polylines[1];
        expect(tick[0].x).toBeCloseTo(tick[1].x);
    });

    it("line is thinner than skate", () => {
        expect(geom("line").lineWidth).toBeLessThan(geom("skate").lineWidth);
    });

    it("end cap points along the base path, not the pattern", () => {
        const g = geom("carry", "arrow");
        expect(g.end).toMatchObject({ type: "arrow", tip: { x: 100, y: 0 } });
        expect(g.end!.angle).toBeCloseTo(0);
        expect(geom("skate", "none").end).toBeNull();
        expect(geom("skate", "stop").end?.type).toBe("stop");
    });

    it("straight path keeps every stored point (v1 polylines survive)", () => {
        const bent = [{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 0 }];
        const g = buildStrokeGeometry({ action: "skate", path: "straight", end: "none", points: bent, strokeWidth: 2 }, 4);
        expect(g.polylines[0]).toEqual(bent);
    });

    it("freehand path is smoothed", () => {
        const bent = [{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 0 }];
        const g = buildStrokeGeometry({ action: "skate", path: "freehand", end: "none", points: bent, strokeWidth: 2 }, 4);
        expect(g.polylines[0].length).toBeGreaterThan(3);
    });

    it("degenerate zero-length stroke yields no polylines and no end", () => {
        const g = geom("carry", "arrow", [{ x: 5, y: 5 }, { x: 5, y: 5 }]);
        expect(g.polylines).toEqual([]);
        expect(g.end).toBeNull();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test __tests__/lib/utils/canvas/stroke-geometry.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `stroke-geometry.ts`**

```ts
/**
 * Pure geometry for practice-board strokes. Inputs and outputs are canvas px;
 * `pxPerFt` scales feet-based pattern sizes. No canvas access, so every
 * pattern is unit-testable.
 */
import type { Position, StrokeAction, StrokeEnd, StrokeOptions } from "@/types/practice-planner";

export type StrokePattern = "solid" | "ticks" | "wave" | "dashed" | "double" | "zigzag" | "thin";

export const ACTION_PATTERN: Record<StrokeAction, StrokePattern> = {
    skate: "solid",
    backskate: "ticks",
    carry: "wave",
    pass: "dashed",
    shot: "double",
    lateral: "zigzag",
    line: "thin",
};

export interface StrokeGeometry {
    polylines: Position[][];
    lineWidth: number;
    end: { type: Exclude<StrokeEnd, "none">; tip: Position; angle: number } | null;
}

const ft = (feet: number, pxPerFt: number, minPx: number) => Math.max(feet * pxPerFt, minPx);

export function smoothPath(points: Position[], iterations = 2): Position[] {
    let pts = points;
    for (let n = 0; n < iterations && pts.length > 2; n++) {
        const next: Position[] = [pts[0]];
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            next.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
            next.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
        }
        next.push(pts[pts.length - 1]);
        pts = next;
    }
    return pts;
}

function pathLength(points: Position[]): number {
    let len = 0;
    for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    return len;
}

/** Evenly spaced samples along the polyline; always includes the last point. */
export function resampleByArcLength(points: Position[], spacing: number): Position[] {
    const total = pathLength(points);
    if (total === 0 || spacing <= 0) return [points[0]];
    const count = Math.max(1, Math.round(total / spacing));
    const step = total / count;
    const out: Position[] = [{ ...points[0] }];
    let seg = 1;
    let segStart = 0; // arc length at points[seg - 1]
    for (let k = 1; k < count; k++) {
        const target = k * step;
        while (seg < points.length) {
            const a = points[seg - 1];
            const b = points[seg];
            const segLen = Math.hypot(b.x - a.x, b.y - a.y);
            if (segStart + segLen >= target) {
                const t = segLen === 0 ? 0 : (target - segStart) / segLen;
                out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
                break;
            }
            segStart += segLen;
            seg++;
        }
    }
    out.push({ ...points[points.length - 1] });
    return out;
}

/** Unit normals at each sample, from neighbor differences. */
function normals(samples: Position[]): Position[] {
    return samples.map((_, i) => {
        const a = samples[Math.max(0, i - 1)];
        const b = samples[Math.min(samples.length - 1, i + 1)];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        return { x: -dy / len, y: dx / len };
    });
}

function offsetAlong(samples: Position[], offset: (i: number) => number): Position[] {
    const ns = normals(samples);
    return samples.map((p, i) => ({ x: p.x + ns[i].x * offset(i), y: p.y + ns[i].y * offset(i) }));
}

export function buildStrokeGeometry(
    stroke: StrokeOptions & { points: Position[]; strokeWidth: number },
    pxPerFt: number
): StrokeGeometry {
    const base = stroke.path === "freehand" ? smoothPath(stroke.points) : stroke.points.map((p) => ({ ...p }));
    const total = pathLength(base);
    const pattern = ACTION_PATTERN[stroke.action];
    const lineWidth = pattern === "thin" ? stroke.strokeWidth * 0.75 : stroke.strokeWidth;
    if (base.length < 2 || total === 0) return { polylines: [], lineWidth, end: null };

    let polylines: Position[][];
    switch (pattern) {
        case "solid":
        case "thin":
            polylines = [base];
            break;
        case "wave": {
            const amp = ft(1.0, pxPerFt, 1.5);
            const wavelength = ft(4, pxPerFt, 6);
            const samples = resampleByArcLength(base, wavelength / 12);
            const spacing = total / (samples.length - 1);
            polylines = [offsetAlong(samples, (i) => amp * Math.sin((2 * Math.PI * i * spacing) / wavelength))];
            break;
        }
        case "zigzag": {
            const amp = ft(1.2, pxPerFt, 1.5);
            const half = ft(3, pxPerFt, 5) / 2;
            const samples = resampleByArcLength(base, half);
            polylines = [offsetAlong(samples, (i) => (i === 0 || i === samples.length - 1 ? 0 : i % 2 ? amp : -amp))];
            break;
        }
        case "dashed": {
            const dash = ft(2.5, pxPerFt, 4);
            const gap = ft(1.5, pxPerFt, 3);
            const samples = resampleByArcLength(base, Math.min(dash, gap) / 2);
            const spacing = total / (samples.length - 1);
            polylines = [];
            let current: Position[] = [];
            samples.forEach((p, i) => {
                const inDash = (i * spacing) % (dash + gap) <= dash;
                if (inDash) current.push(p);
                else if (current.length) {
                    if (current.length > 1) polylines.push(current);
                    current = [];
                }
            });
            if (current.length > 1) polylines.push(current);
            break;
        }
        case "double": {
            const rail = ft(0.7, pxPerFt, 1.5);
            const samples = resampleByArcLength(base, ft(1, pxPerFt, 2));
            polylines = [offsetAlong(samples, () => rail), offsetAlong(samples, () => -rail)];
            break;
        }
        case "ticks": {
            const every = ft(4, pxPerFt, 6);
            const half = ft(1.2, pxPerFt, 2);
            const samples = resampleByArcLength(base, every);
            const ns = normals(samples);
            polylines = [base];
            for (let i = 1; i < samples.length - 1; i++) {
                const p = samples[i];
                polylines.push([
                    { x: p.x + ns[i].x * half, y: p.y + ns[i].y * half },
                    { x: p.x - ns[i].x * half, y: p.y - ns[i].y * half },
                ]);
            }
            break;
        }
    }

    let end: StrokeGeometry["end"] = null;
    if (stroke.end !== "none") {
        const tip = base[base.length - 1];
        let k = base.length - 2;
        while (k > 0 && base[k].x === tip.x && base[k].y === tip.y) k--;
        const from = base[k];
        end = { type: stroke.end, tip: { ...tip }, angle: Math.atan2(tip.y - from.y, tip.x - from.x) };
    }

    return { polylines, lineWidth, end };
}
```

- [ ] **Step 4: Run geometry tests**

Run: `bun run test __tests__/lib/utils/canvas/stroke-geometry.test.ts`
Expected: PASS. If the `pass` dash-length assertion fails by a sample's worth, fix the dash segmentation, not the test: dashes are 2.5 ft × 4 = 10 px.

- [ ] **Step 5: Write the failing painter test**

Create `__tests__/lib/utils/canvas/drawing-utils.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { drawStroke } from "@/lib/utils/canvas/drawing-utils";
import { createTransformContext } from "@/lib/utils/canvas/rink-renderer";
import { STROKE_ACTIONS, STROKE_ENDS } from "@/types/practice-planner";

function mockCtx() {
    return {
        beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(), closePath: vi.fn(),
        strokeStyle: "", fillStyle: "", lineWidth: 1, lineCap: "", lineJoin: "",
    } as unknown as CanvasRenderingContext2D & Record<string, ReturnType<typeof vi.fn>>;
}

const transform = createTransformContext(800, 400);
const points = [{ x: 20, y: 40 }, { x: 120, y: 40 }];

describe("drawStroke", () => {
    it.each(STROKE_ACTIONS)("strokes %s without throwing", (action) => {
        const ctx = mockCtx();
        drawStroke(ctx, { action, path: "straight", end: "none", points, color: "#1976D2", strokeWidth: 2 }, transform);
        expect(ctx.stroke).toHaveBeenCalled();
        expect(ctx.strokeStyle).toBe("#1976D2");
    });

    it.each(STROKE_ENDS)("renders end cap %s", (end) => {
        const ctx = mockCtx();
        drawStroke(ctx, { action: "skate", path: "straight", end, points, color: "#000000", strokeWidth: 2 }, transform);
        if (end === "arrow") expect(ctx.fill).toHaveBeenCalledTimes(1);
        else expect(ctx.fill).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 6: Implement `drawStroke` and rewire `drawElement`**

In `lib/utils/canvas/drawing-utils.ts`, delete `drawLine`, `drawCurve` and `drawArrow`, and grep to confirm none are imported elsewhere (`grep -rn "drawLine\|drawCurve\|drawArrow" lib components __tests__`). Keep `drawArrowHead`. Add:

```ts
import { buildStrokeGeometry } from "./stroke-geometry";
import type { StrokeOptions } from "@/types/practice-planner";

export function drawStroke(
    ctx: CanvasRenderingContext2D,
    stroke: StrokeOptions & { points: Position[]; color: string; strokeWidth: number },
    transform: TransformContext
): void {
    if (stroke.points.length < 2) return;
    const pxPerFt = Math.min(transform.scaleX, transform.scaleY);
    const geometry = buildStrokeGeometry(
        { ...stroke, points: stroke.points.map((p) => rinkToCanvas(p, transform)) },
        pxPerFt
    );

    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = geometry.lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const line of geometry.polylines) {
        ctx.beginPath();
        ctx.moveTo(line[0].x, line[0].y);
        for (let i = 1; i < line.length; i++) ctx.lineTo(line[i].x, line[i].y);
        ctx.stroke();
    }

    if (!geometry.end) return;
    const { tip, angle, type } = geometry.end;
    if (type === "arrow") {
        const from = { x: tip.x - Math.cos(angle), y: tip.y - Math.sin(angle) };
        drawArrowHead(ctx, from, tip, stroke.color, geometry.lineWidth);
    } else {
        const half = Math.max(1.8 * pxPerFt, 4);
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        ctx.beginPath();
        ctx.moveTo(tip.x + nx * half, tip.y + ny * half);
        ctx.lineTo(tip.x - nx * half, tip.y - ny * half);
        ctx.stroke();
    }
}
```

In `drawElement`, replace the temporary dispatch with `drawStroke(ctx, element, transform);`. The selection highlight block stays.

In `RinkBoard.tsx` `render`, replace the in-progress drawing block (the manual `beginPath`/`lineTo` loop) with a preview through the same painter. Task 7 replaces this again, with real options:

```ts
        if (isDrawing && currentDrawingPoints.length > 1) {
            drawStroke(ctx, { ...strokeFromV1Type(selectedTool as "line" | "curve" | "arrow"), points: currentDrawingPoints, color: selectedColor, strokeWidth: 2 }, transform);
        }
```

- [ ] **Step 7: Run tests and type-check**

Run: `bun run test __tests__/lib/utils/canvas __tests__/components/features/practice-planner`
Expected: PASS.
Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/utils/canvas/stroke-geometry.ts lib/utils/canvas/drawing-utils.ts components/features/practice-planner/RinkBoard.tsx __tests__/lib/utils/canvas
git commit -m "feat(practice-planner): render strokes by hockey action (carry, pass, shot, ...)

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 4: Player-role and equipment glyphs

**Files:**
- Create: `lib/utils/canvas/glyph-metrics.ts` (sizes in feet, no canvas)
- Create: `lib/utils/canvas/glyphs.ts` (painters)
- Modify: `lib/utils/canvas/drawing-utils.ts` (`drawPlayerIcon` → delegates to `drawPlayerGlyph`; `drawAllElements` takes `PlayData`)
- Modify: `lib/utils/canvas/thumbnail-generator.ts:78-85`, `components/features/practice-planner/RinkBoard.tsx` render (new `drawAllElements` signature)
- Modify: `lib/utils/canvas/interaction-utils.ts:24` (import `PLAYER_RADIUS_FT` from metrics)
- Test: `__tests__/lib/utils/canvas/glyphs.test.ts` (create)

**Interfaces:**
- Produces (`glyph-metrics.ts`): `PLAYER_RADIUS_FT = 6`, `MIN_GLYPH_RADIUS_PX = 8`, `EQUIPMENT_RADIUS_FT: Record<EquipmentKind, number>` = `{ puck: 0.75, puckPile: 2, cone: 1.5, pylon: 1.5, tire: 2, net: 3 }`. `net` is half the 6 ft width; the others are radii. Also `glyphRadiusPx(radiusFt: number, pxPerFt: number): number` = `Math.max(radiusFt * pxPerFt, MIN_GLYPH_RADIUS_PX)`.
- Produces (`glyphs.ts`):
  - `drawPlayerGlyph(ctx, player: PlayerIcon, center: Position, radiusPx: number, isSelected: boolean)`
  - `drawEquipmentGlyph(ctx, item: Pick<EquipmentItem, "kind" | "rotation">, center: Position, radiusPx: number, isSelected: boolean)`
  - `PLAYER_GLYPH_SHAPE: Record<PlayerRole, "disc" | "ring" | "goalie" | "triangle">`
- Changes: `drawAllElements(ctx, playData: PlayData, transform, selectedId?)` draws drawings, then equipment, then players, then annotations.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/utils/canvas/glyphs.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { drawPlayerGlyph, drawEquipmentGlyph, PLAYER_GLYPH_SHAPE } from "@/lib/utils/canvas/glyphs";
import { glyphRadiusPx, PLAYER_RADIUS_FT, MIN_GLYPH_RADIUS_PX } from "@/lib/utils/canvas/glyph-metrics";
import { drawAllElements } from "@/lib/utils/canvas/drawing-utils";
import { createTransformContext } from "@/lib/utils/canvas/rink-renderer";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { EQUIPMENT_KINDS, PLAYER_ROLES } from "@/types/practice-planner";

function mockCtx() {
    const calls: string[] = [];
    const fn = (name: string) => vi.fn(() => { calls.push(name); });
    return Object.assign(
        {
            beginPath: fn("beginPath"), moveTo: fn("moveTo"), lineTo: fn("lineTo"), arc: fn("arc"),
            closePath: fn("closePath"), fill: fn("fill"), stroke: fn("stroke"), fillText: vi.fn(),
            fillRect: fn("fillRect"), strokeRect: fn("strokeRect"), save: fn("save"), restore: fn("restore"),
            translate: fn("translate"), rotate: fn("rotate"), measureText: vi.fn(() => ({ width: 10 })),
            strokeStyle: "", fillStyle: "", lineWidth: 1, font: "", textAlign: "", textBaseline: "",
        },
        { calls }
    ) as unknown as CanvasRenderingContext2D & { calls: string[]; fillText: ReturnType<typeof vi.fn> };
}

describe("glyph metrics", () => {
    it("player radius is 6 ft", () => expect(PLAYER_RADIUS_FT).toBe(6));
    it("never renders below the minimum on-screen size", () => {
        expect(glyphRadiusPx(0.75, 1)).toBe(MIN_GLYPH_RADIUS_PX);
        expect(glyphRadiusPx(6, 4)).toBe(24);
    });
});

describe("drawPlayerGlyph", () => {
    it("has a shape for every role", () => {
        for (const role of PLAYER_ROLES) expect(PLAYER_GLYPH_SHAPE[role]).toBeDefined();
    });

    it.each(PLAYER_ROLES)("draws role %s", (role) => {
        const ctx = mockCtx();
        drawPlayerGlyph(ctx, { id: "p", role, label: "", color: "#1976D2", position: { x: 0, y: 0 } }, { x: 50, y: 50 }, 20, false);
        expect(ctx.calls.length).toBeGreaterThan(0);
    });

    it("shows the label, falling back to the role letter", () => {
        const ctx = mockCtx();
        drawPlayerGlyph(ctx, { id: "p", role: "D", label: "", color: "#0D47A1", position: { x: 0, y: 0 } }, { x: 0, y: 0 }, 20, false);
        expect(ctx.fillText).toHaveBeenCalledWith("D", 0, expect.any(Number));
        const ctx2 = mockCtx();
        drawPlayerGlyph(ctx2, { id: "p", role: "X", label: "LW", color: "#1976D2", position: { x: 0, y: 0 } }, { x: 0, y: 0 }, 20, false);
        expect(ctx2.fillText).toHaveBeenCalledWith("LW", 0, expect.any(Number));
    });

    it("O is a hollow ring (stroked, not filled)", () => {
        const ctx = mockCtx();
        drawPlayerGlyph(ctx, { id: "p", role: "O", label: "", color: "#D32F2F", position: { x: 0, y: 0 } }, { x: 0, y: 0 }, 20, false);
        expect(ctx.calls).toContain("stroke");
        expect(ctx.calls.filter((c) => c === "fill")).toHaveLength(1); // only the white backing disc
    });
});

describe("drawEquipmentGlyph", () => {
    it.each(EQUIPMENT_KINDS)("draws %s", (kind) => {
        const ctx = mockCtx();
        drawEquipmentGlyph(ctx, { kind, rotation: 0 }, { x: 10, y: 10 }, 12, false);
        expect(ctx.calls.length).toBeGreaterThan(0);
    });

    it("rotates nets", () => {
        const ctx = mockCtx();
        drawEquipmentGlyph(ctx, { kind: "net", rotation: 90 }, { x: 10, y: 10 }, 12, false);
        expect(ctx.calls).toContain("rotate");
    });
});

describe("drawAllElements", () => {
    it("paints equipment along with the other layers", () => {
        const ctx = mockCtx();
        const data = { ...createEmptyPlayData(), equipment: [{ id: "c", kind: "cone" as const, position: { x: 50, y: 40 }, rotation: 0 }] };
        drawAllElements(ctx, data, createTransformContext(800, 400));
        expect(ctx.calls).toContain("fill");
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test __tests__/lib/utils/canvas/glyphs.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `glyph-metrics.ts`**

```ts
/** Glyph sizes in rink feet. Shared by renderers and hit-testing. */
import type { EquipmentKind } from "@/types/practice-planner";

export const PLAYER_RADIUS_FT = 6;
export const MIN_GLYPH_RADIUS_PX = 8;

export const EQUIPMENT_RADIUS_FT: Record<EquipmentKind, number> = {
    puck: 0.75,
    puckPile: 2,
    cone: 1.5,
    pylon: 1.5,
    tire: 2,
    net: 3,
};

export function glyphRadiusPx(radiusFt: number, pxPerFt: number): number {
    return Math.max(radiusFt * pxPerFt, MIN_GLYPH_RADIUS_PX);
}
```

- [ ] **Step 4: Implement `glyphs.ts`**

```ts
/**
 * Canvas painters for player-role and equipment glyphs (Digital Playbook look).
 * Callers convert rink feet to canvas px; these draw at a center + radius.
 */
import type { EquipmentItem, PlayerIcon, PlayerRole, Position } from "@/types/practice-planner";
import { BOARD_COLORS } from "./notation";

const SELECTION_COLOR = "#FFD700";
const FONT_FAMILY = `"Source Sans 3", system-ui, sans-serif`;

export const PLAYER_GLYPH_SHAPE: Record<PlayerRole, "disc" | "ring" | "goalie" | "triangle"> = {
    X: "disc",
    F: "disc",
    D: "disc",
    O: "ring",
    G: "goalie",
    C: "triangle",
};

function contrastText(hex: string): string {
    const n = parseInt(hex.slice(1), 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? BOARD_COLORS.ink : "#FFFFFF";
}

function selectionRing(ctx: CanvasRenderingContext2D, c: Position, r: number) {
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startPx: number) {
    let size = startPx;
    ctx.font = `800 ${size}px ${FONT_FAMILY}`;
    while (size > 6 && ctx.measureText(text).width > maxWidth) {
        size -= 1;
        ctx.font = `800 ${size}px ${FONT_FAMILY}`;
    }
}

export function drawPlayerGlyph(
    ctx: CanvasRenderingContext2D,
    player: PlayerIcon,
    c: Position,
    r: number,
    isSelected: boolean
): void {
    if (isSelected) selectionRing(ctx, c, r);
    const shape = PLAYER_GLYPH_SHAPE[player.role];
    const text = player.label || player.role;
    let textColor = contrastText(player.color);

    ctx.lineWidth = Math.max(1.5, r * 0.12);
    switch (shape) {
        case "disc":
        case "goalie":
            ctx.fillStyle = player.color;
            ctx.strokeStyle = BOARD_COLORS.ink;
            ctx.beginPath();
            ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            if (shape === "goalie") {
                ctx.fillStyle = textColor;
                ctx.fillRect(c.x - r * 0.7, c.y + r * 0.45, r * 1.4, r * 0.22);
            }
            break;
        case "ring":
            ctx.fillStyle = "#FFFFFF";
            ctx.strokeStyle = player.color;
            ctx.lineWidth = Math.max(2, r * 0.22);
            ctx.beginPath();
            ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            textColor = player.color;
            break;
        case "triangle":
            ctx.fillStyle = player.color;
            ctx.strokeStyle = BOARD_COLORS.ink;
            ctx.beginPath();
            ctx.moveTo(c.x, c.y - r * 1.1);
            ctx.lineTo(c.x + r, c.y + r * 0.75);
            ctx.lineTo(c.x - r, c.y + r * 0.75);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
    }

    fitText(ctx, text, r * 1.6, Math.floor(r * 1.05));
    ctx.fillStyle = textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, c.x, shape === "triangle" ? c.y + r * 0.15 : c.y);
}

export function drawEquipmentGlyph(
    ctx: CanvasRenderingContext2D,
    item: Pick<EquipmentItem, "kind" | "rotation">,
    c: Position,
    r: number,
    isSelected: boolean
): void {
    if (isSelected) selectionRing(ctx, c, r);
    ctx.lineWidth = Math.max(1.5, r * 0.15);
    ctx.strokeStyle = BOARD_COLORS.ink;

    switch (item.kind) {
        case "puck":
            ctx.fillStyle = BOARD_COLORS.ink;
            ctx.beginPath();
            ctx.arc(c.x, c.y, r * 0.6, 0, Math.PI * 2);
            ctx.fill();
            break;
        case "puckPile":
            ctx.fillStyle = BOARD_COLORS.ink;
            for (const [dx, dy] of [[-0.4, 0.25], [0.4, 0.25], [0, -0.35]]) {
                ctx.beginPath();
                ctx.arc(c.x + dx * r, c.y + dy * r, r * 0.38, 0, Math.PI * 2);
                ctx.fill();
            }
            break;
        case "cone":
        case "pylon": {
            const w = item.kind === "cone" ? r : r * 0.6;
            ctx.fillStyle = "#F57C00";
            ctx.beginPath();
            ctx.moveTo(c.x, c.y - r);
            ctx.lineTo(c.x + w, c.y + r * 0.8);
            ctx.lineTo(c.x - w, c.y + r * 0.8);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        }
        case "tire":
            ctx.lineWidth = Math.max(2.5, r * 0.35);
            ctx.beginPath();
            ctx.arc(c.x, c.y, r * 0.8, 0, Math.PI * 2);
            ctx.stroke();
            break;
        case "net":
            ctx.save();
            ctx.translate(c.x, c.y);
            ctx.rotate((item.rotation * Math.PI) / 180);
            ctx.strokeStyle = BOARD_COLORS.penaltyRed;
            ctx.beginPath();
            ctx.moveTo(-r * 0.4, -r);
            ctx.lineTo(r * 0.4, -r);
            ctx.lineTo(r * 0.4, r);
            ctx.lineTo(-r * 0.4, r);
            ctx.stroke();
            ctx.restore();
            break;
    }
}
```

The net is drawn open on its left side (−x) at rotation 0, which is the mouth facing the left goal line. Rotation 180 faces right.

- [ ] **Step 5: Rewire `drawing-utils.ts`, `thumbnail-generator.ts`, `RinkBoard.tsx`, `interaction-utils.ts`**

In `drawing-utils.ts`: delete the local `PLAYER_ICON_RADIUS`. Make `drawPlayerIcon` delegate:

```ts
export function drawPlayerIcon(ctx: CanvasRenderingContext2D, player: PlayerIcon, transform: TransformContext, isSelected = false): void {
    const pxPerFt = Math.min(transform.scaleX, transform.scaleY);
    drawPlayerGlyph(ctx, player, rinkToCanvas(player.position, transform), glyphRadiusPx(PLAYER_RADIUS_FT, pxPerFt), isSelected);
}

export function drawEquipmentItem(ctx: CanvasRenderingContext2D, item: EquipmentItem, transform: TransformContext, isSelected = false): void {
    const pxPerFt = Math.min(transform.scaleX, transform.scaleY);
    drawEquipmentGlyph(ctx, item, rinkToCanvas(item.position, transform), glyphRadiusPx(EQUIPMENT_RADIUS_FT[item.kind], pxPerFt), isSelected);
}
```

and change `drawAllElements`:

```ts
export function drawAllElements(
    ctx: CanvasRenderingContext2D,
    playData: PlayData,
    transform: TransformContext,
    selectedId?: string
): void {
    playData.drawings.forEach((d) => drawElement(ctx, d, transform, d.id === selectedId));
    playData.equipment.forEach((e) => drawEquipmentItem(ctx, e, transform, e.id === selectedId));
    playData.players.forEach((p) => drawPlayerIcon(ctx, p, transform, p.id === selectedId));
    playData.annotations.forEach((a) => drawTextAnnotation(ctx, a, transform, a.id === selectedId));
}
```

`thumbnail-generator.ts`: `drawAllElements(ctx, playData, transform);`.

`RinkBoard.tsx` `render`: call `drawAllElements(ctx, { ...playData, players: renderPlayers, annotations: renderAnnotations }, transform, selectedElementId || undefined);`. Task 7 replaces the preview logic.

`interaction-utils.ts`: replace `const PLAYER_ICON_RADIUS = 12;` with `import { PLAYER_RADIUS_FT } from "./glyph-metrics";` and use `PLAYER_RADIUS_FT` in `hitTestPlayer`.

Grep for other `drawAllElements(` callers and update them all: `grep -rn "drawAllElements(" lib components app __tests__`.

- [ ] **Step 6: Run tests and type-check**

Run: `bun run test __tests__/lib/utils/canvas __tests__/components/features/practice-planner`
Expected: PASS. An existing `interaction-utils` test that hard-codes a 12 ft hit radius must be updated to 6 ft. That's the intended change.
Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/utils/canvas __tests__/lib/utils/canvas components/features/practice-planner/RinkBoard.tsx
git commit -m "feat(practice-planner): role glyphs and equipment rendering

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 5: Element operations and equipment hit-testing

**Files:**
- Create: `lib/utils/canvas/element-ops.ts`
- Modify: `lib/utils/canvas/interaction-utils.ts` (`hitTest` covers equipment, takes optional `minHitRadiusFt`)
- Test: `__tests__/lib/utils/canvas/element-ops.test.ts` (create), `__tests__/lib/utils/canvas/interaction-utils.test.ts` (extend)

**Interfaces:**
- Produces (`element-ops.ts`):
  - `type ElementKind = "player" | "drawing" | "equipment" | "annotation"`
  - `type SelectedElement = { kind: "player"; element: PlayerIcon } | { kind: "drawing"; element: DrawingElement } | { kind: "equipment"; element: EquipmentItem } | { kind: "annotation"; element: TextAnnotation }`
  - `type ElementPatch = Partial<Pick<PlayerIcon, "role" | "label" | "color">> & Partial<Pick<DrawingElement, "action" | "end" | "color">> & Partial<Pick<EquipmentItem, "kind" | "rotation">> & Partial<Pick<TextAnnotation, "text" | "color">>`
  - `findElement(data: PlayData, id: string): SelectedElement | null`
  - `updateElement(data: PlayData, id: string, patch: ElementPatch): PlayData`. It applies only the fields valid for that kind, returns the same reference when the id isn't found, and never mutates.
  - `removeElement(data: PlayData, id: string): PlayData`
  - `moveElement(data: PlayData, id: string, position: Position): PlayData` (players, equipment, annotations; drawings are unchanged)
- Changes: `HitTestResult.elementType` gains `"equipment"`; `hitTest(point, playData, minHitRadiusFt = 0)`.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/utils/canvas/element-ops.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { findElement, updateElement, removeElement, moveElement } from "@/lib/utils/canvas/element-ops";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import type { PlayData } from "@/types/practice-planner";

const data: PlayData = {
    ...createEmptyPlayData(),
    players: [{ id: "p", position: { x: 10, y: 10 }, role: "X", label: "A", color: "#1976D2" }],
    drawings: [{ id: "d", action: "skate", path: "straight", end: "arrow", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], color: "#000000", strokeWidth: 2 }],
    equipment: [{ id: "e", kind: "net", position: { x: 50, y: 40 }, rotation: 0 }],
    annotations: [{ id: "a", text: "hi", position: { x: 1, y: 1 }, fontSize: 8, color: "#000000" }],
};

describe("element-ops", () => {
    it("finds each kind", () => {
        expect(findElement(data, "p")?.kind).toBe("player");
        expect(findElement(data, "d")?.kind).toBe("drawing");
        expect(findElement(data, "e")?.kind).toBe("equipment");
        expect(findElement(data, "a")?.kind).toBe("annotation");
        expect(findElement(data, "zzz")).toBeNull();
    });

    it("updates a stroke's action and end without touching points", () => {
        const next = updateElement(data, "d", { action: "pass", end: "stop" });
        expect(next.drawings[0]).toMatchObject({ action: "pass", end: "stop", points: data.drawings[0].points });
        expect(data.drawings[0].action).toBe("skate"); // not mutated
    });

    it("ignores fields that don't apply to the element kind", () => {
        const next = updateElement(data, "e", { rotation: 90, label: "nope" } as never);
        expect(next.equipment[0]).toEqual({ ...data.equipment[0], rotation: 90 });
    });

    it("returns the same reference for an unknown id", () => {
        expect(updateElement(data, "zzz", { color: "#000000" })).toBe(data);
    });

    it("removes from whichever collection holds the id", () => {
        expect(removeElement(data, "e").equipment).toEqual([]);
        expect(removeElement(data, "p").players).toEqual([]);
    });

    it("moves equipment, players, annotations", () => {
        expect(moveElement(data, "e", { x: 1, y: 2 }).equipment[0].position).toEqual({ x: 1, y: 2 });
        expect(moveElement(data, "d", { x: 1, y: 2 })).toEqual(data);
    });
});
```

Append to `__tests__/lib/utils/canvas/interaction-utils.test.ts`:

```ts
describe("hitTest equipment", () => {
    const withCone = {
        ...createEmptyPlayData(),
        equipment: [{ id: "cone", kind: "cone" as const, position: { x: 100, y: 40 }, rotation: 0 }],
    };

    it("hits equipment within its radius", () => {
        expect(hitTest({ x: 100.5, y: 40 }, withCone)).toMatchObject({ hit: true, elementType: "equipment", elementId: "cone" });
    });

    it("misses a tiny glyph without a minimum hit radius", () => {
        expect(hitTest({ x: 104, y: 40 }, withCone).hit).toBe(false);
    });

    it("honors minHitRadiusFt so small glyphs stay tappable when zoomed out", () => {
        expect(hitTest({ x: 104, y: 40 }, withCone, 5).hit).toBe(true);
    });
});
```

Import `createEmptyPlayData` from `@/lib/utils/play-data` at the top of that file.

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test __tests__/lib/utils/canvas/element-ops.test.ts __tests__/lib/utils/canvas/interaction-utils.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `element-ops.ts`**

```ts
/** Pure, immutable edits on PlayData elements by id. */
import type { DrawingElement, EquipmentItem, PlayData, PlayerIcon, Position, TextAnnotation } from "@/types/practice-planner";

export type ElementKind = "player" | "drawing" | "equipment" | "annotation";

export type SelectedElement =
    | { kind: "player"; element: PlayerIcon }
    | { kind: "drawing"; element: DrawingElement }
    | { kind: "equipment"; element: EquipmentItem }
    | { kind: "annotation"; element: TextAnnotation };

export type ElementPatch = Partial<Pick<PlayerIcon, "role" | "label" | "color">> &
    Partial<Pick<DrawingElement, "action" | "end" | "color">> &
    Partial<Pick<EquipmentItem, "kind" | "rotation">> &
    Partial<Pick<TextAnnotation, "text" | "color">>;

const ALLOWED: Record<ElementKind, readonly (keyof ElementPatch)[]> = {
    player: ["role", "label", "color"],
    drawing: ["action", "end", "color"],
    equipment: ["kind", "rotation"],
    annotation: ["text", "color"],
};

export function findElement(data: PlayData, id: string): SelectedElement | null {
    const p = data.players.find((e) => e.id === id);
    if (p) return { kind: "player", element: p };
    const d = data.drawings.find((e) => e.id === id);
    if (d) return { kind: "drawing", element: d };
    const q = data.equipment.find((e) => e.id === id);
    if (q) return { kind: "equipment", element: q };
    const a = data.annotations.find((e) => e.id === id);
    if (a) return { kind: "annotation", element: a };
    return null;
}

function pick(patch: ElementPatch, kind: ElementKind): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of ALLOWED[kind]) if (patch[key] !== undefined) out[key] = patch[key];
    return out;
}

export function updateElement(data: PlayData, id: string, patch: ElementPatch): PlayData {
    const found = findElement(data, id);
    if (!found) return data;
    const fields = pick(patch, found.kind);
    const apply = <T extends { id: string }>(list: T[]) => list.map((e) => (e.id === id ? { ...e, ...fields } : e));
    switch (found.kind) {
        case "player":
            return { ...data, players: apply(data.players) };
        case "drawing":
            return { ...data, drawings: apply(data.drawings) };
        case "equipment":
            return { ...data, equipment: apply(data.equipment) };
        case "annotation":
            return { ...data, annotations: apply(data.annotations) };
    }
}

export function removeElement(data: PlayData, id: string): PlayData {
    return {
        ...data,
        players: data.players.filter((e) => e.id !== id),
        drawings: data.drawings.filter((e) => e.id !== id),
        equipment: data.equipment.filter((e) => e.id !== id),
        annotations: data.annotations.filter((e) => e.id !== id),
    };
}

export function moveElement(data: PlayData, id: string, position: Position): PlayData {
    const move = <T extends { id: string; position: Position }>(list: T[]) =>
        list.map((e) => (e.id === id ? { ...e, position: { ...position } } : e));
    return { ...data, players: move(data.players), equipment: move(data.equipment), annotations: move(data.annotations) };
}
```

- [ ] **Step 4: Extend `hitTest`**

In `interaction-utils.ts`: import `EQUIPMENT_RADIUS_FT` from `./glyph-metrics` and `EquipmentItem` from types. Add `"equipment"` to `HitTestResult.elementType`, and add `EquipmentItem` to `SelectableElement`. Change `hitTestPlayer(point, player, minHitRadiusFt = 0)` to use `Math.max(PLAYER_RADIUS_FT, minHitRadiusFt)`. Add:

```ts
export function hitTestEquipment(point: Position, item: EquipmentItem, minHitRadiusFt = 0): boolean {
    const r = Math.max(EQUIPMENT_RADIUS_FT[item.kind], minHitRadiusFt);
    return Math.hypot(point.x - item.position.x, point.y - item.position.y) <= r;
}
```

Change `hitTest(point, playData, minHitRadiusFt = 0)`. The order (topmost first) is annotations, players (with `minHitRadiusFt`), equipment (with `minHitRadiusFt`), then drawings (`HIT_THRESHOLD` or `minHitRadiusFt`, whichever is larger: `distance <= Math.max(HIT_THRESHOLD, minHitRadiusFt)`). For that, give `hitTestDrawing` an optional third parameter `threshold = HIT_THRESHOLD`.

- [ ] **Step 5: Run tests and type-check**

Run: `bun run test __tests__/lib/utils/canvas`
Expected: PASS.
Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/utils/canvas/element-ops.ts lib/utils/canvas/interaction-utils.ts __tests__/lib/utils/canvas
git commit -m "feat(practice-planner): pure element ops and equipment hit-testing

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 6: Grouped toolbar with contextual options

**Files:**
- Modify: `types/practice-planner.ts` (`DrawingTool`)
- Modify: `components/features/practice-planner/DrawingToolbar.tsx`
- Test: `__tests__/components/features/practice-planner/DrawingToolbar.test.tsx`

To keep `RinkBoard.tsx` compiling, this task **widens** `DrawingTool` to a superset that still includes the legacy `"line" | "curve" | "arrow"`. The toolbar only ever emits the new values. Task 7 removes the legacy members.

**Interfaces:**
- Consumes: `PLAYER_ROLES`, `STROKE_ACTIONS`, `STROKE_PATHS`, `STROKE_ENDS`, `EQUIPMENT_KINDS`, `StrokeOptions` (Task 1); `ROLE_LABELS`, `ACTION_LABELS`, `END_LABELS`, `EQUIPMENT_LABELS`, `DEFAULT_END_FOR_ACTION` (Task 1)
- Produces:
  - `type DrawingTool = "select" | "player" | "stroke" | "equipment" | "text" | "eraser"`
  - `DrawingToolbarProps` adds `playerRole: PlayerRole; onPlayerRoleChange(role: PlayerRole): void; strokeOptions: StrokeOptions; onStrokeOptionsChange(options: StrokeOptions): void; equipmentKind: EquipmentKind; onEquipmentKindChange(kind: EquipmentKind): void`
  - Accessible names: tool buttons `"select tool"`, `"player tool"`, `"movement tool"`, `"equipment tool"`, `"text tool"`, `"eraser tool"`; option groups `aria-label` `"player role"`, `"stroke action"`, `"stroke path"`, `"stroke end"`, `"equipment kind"`; each option button's `aria-label` is its display label (e.g., `"Puck carry"`, `"Defense"`, `"Cone"`)

- [ ] **Step 1: Update the tests first**

In `DrawingToolbar.test.tsx`, extend `createDefaultProps`:

```ts
    playerRole: "X",
    onPlayerRoleChange: vi.fn(),
    strokeOptions: { action: "skate", path: "straight", end: "arrow" },
    onStrokeOptionsChange: vi.fn(),
    equipmentKind: "cone",
    onEquipmentKindChange: vi.fn(),
```

Replace the "renders all tool buttons" expectations with the six new tool names. Delete or retarget any test that clicks `line tool` / `curve tool` / `arrow tool` so it uses `movement tool`. Add:

```ts
    describe("Contextual options", () => {
        it("shows role options only for the player tool", () => {
            const { unmount } = renderWithTheme(createDefaultProps({ selectedTool: "player" }));
            expect(screen.getByRole("group", { name: "player role" })).toBeInTheDocument();
            expect(screen.queryByRole("group", { name: "stroke action" })).not.toBeInTheDocument();
            unmount();
            renderWithTheme(createDefaultProps({ selectedTool: "select" }));
            expect(screen.queryByRole("group", { name: "player role" })).not.toBeInTheDocument();
        });

        it("picking a role reports it", async () => {
            const onPlayerRoleChange = vi.fn();
            renderWithTheme(createDefaultProps({ selectedTool: "player", onPlayerRoleChange }));
            await userEvent.click(screen.getByLabelText("Defense"));
            expect(onPlayerRoleChange).toHaveBeenCalledWith("D");
        });

        it("picking an action also applies that action's default end", async () => {
            const onStrokeOptionsChange = vi.fn();
            renderWithTheme(createDefaultProps({
                selectedTool: "stroke",
                strokeOptions: { action: "skate", path: "freehand", end: "arrow" },
                onStrokeOptionsChange,
            }));
            await userEvent.click(screen.getByLabelText("Line"));
            expect(onStrokeOptionsChange).toHaveBeenCalledWith({ action: "line", path: "freehand", end: "none" });
        });

        it("path and end are independent of action", async () => {
            const onStrokeOptionsChange = vi.fn();
            renderWithTheme(createDefaultProps({ selectedTool: "stroke", onStrokeOptionsChange }));
            await userEvent.click(screen.getByLabelText("Stop"));
            expect(onStrokeOptionsChange).toHaveBeenCalledWith({ action: "skate", path: "straight", end: "stop" });
        });

        it("picking equipment reports it", async () => {
            const onEquipmentKindChange = vi.fn();
            renderWithTheme(createDefaultProps({ selectedTool: "equipment", onEquipmentKindChange }));
            await userEvent.click(screen.getByLabelText("Net"));
            expect(onEquipmentKindChange).toHaveBeenCalledWith("net");
        });

        it("option buttons meet the 44px touch target", () => {
            renderWithTheme(createDefaultProps({ selectedTool: "equipment" }));
            expect(screen.getByLabelText("Cone")).toHaveStyle({ minWidth: "44px", minHeight: "44px" });
        });
    });
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test __tests__/components/features/practice-planner/DrawingToolbar.test.tsx`
Expected: FAIL. There's no "movement tool", and no option groups.

- [ ] **Step 3: Implement**

`types/practice-planner.ts`:

```ts
/** Legacy "line" | "curve" | "arrow" are removed in Task 7 once RinkBoard switches to "stroke". */
export type DrawingTool = "select" | "player" | "stroke" | "equipment" | "text" | "eraser" | "line" | "curve" | "arrow";
```

In `DrawingToolbar.tsx`:
- Replace the line/curve/arrow toggle buttons with one `ToggleButton value="stroke" aria-label="movement tool"` (icon: `Timeline` from `@mui/icons-material`), and add `ToggleButton value="equipment" aria-label="equipment tool"` (icon: `SportsHockey`). Remove the unused `LineIcon`/`CurveIcon`/`ArrowIcon` imports.
- Swap `COLOR_PALETTE` for theme-aligned colors: `["#212121", "#0D47A1", "#1976D2", "#D32F2F", "#2E7D32", "#F57C00", "#6A1B9A", "#FFFFFF"]`.
- Below the existing toolbar `Box`, render the options row when the tool has options:

```tsx
const OPTION_SX = { minWidth: 44, minHeight: 44, px: 1.25, fontWeight: 800 } as const;

function OptionGroup<T extends string>({ label, value, options, labels, onChange }: {
    label: string;
    value: T;
    options: readonly T[];
    labels: Record<T, string>;
    onChange: (value: T) => void;
}) {
    return (
        <ToggleButtonGroup
            value={value}
            exclusive
            onChange={(_e, next: T | null) => next !== null && onChange(next)}
            aria-label={label}
            role="group"
            size="small"
            sx={{ flexWrap: "wrap" }}
        >
            {options.map((option) => (
                <ToggleButton key={option} value={option} aria-label={labels[option]} sx={OPTION_SX}>
                    {labels[option]}
                </ToggleButton>
            ))}
        </ToggleButtonGroup>
    );
}
```

and inside the component:

```tsx
            {selectedTool === "player" && (
                <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
                    <OptionGroup label="player role" value={playerRole} options={PLAYER_ROLES} labels={ROLE_LABELS} onChange={onPlayerRoleChange} />
                </Box>
            )}
            {selectedTool === "stroke" && (
                <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
                    <OptionGroup
                        label="stroke action"
                        value={strokeOptions.action}
                        options={STROKE_ACTIONS}
                        labels={ACTION_LABELS}
                        onChange={(action) => onStrokeOptionsChange({ ...strokeOptions, action, end: DEFAULT_END_FOR_ACTION[action] })}
                    />
                    <OptionGroup
                        label="stroke path"
                        value={strokeOptions.path}
                        options={STROKE_PATHS}
                        labels={{ straight: "Straight", freehand: "Freehand" }}
                        onChange={(path) => onStrokeOptionsChange({ ...strokeOptions, path })}
                    />
                    <OptionGroup
                        label="stroke end"
                        value={strokeOptions.end}
                        options={STROKE_ENDS}
                        labels={END_LABELS}
                        onChange={(end) => onStrokeOptionsChange({ ...strokeOptions, end })}
                    />
                </Box>
            )}
            {selectedTool === "equipment" && (
                <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
                    <OptionGroup label="equipment kind" value={equipmentKind} options={EQUIPMENT_KINDS} labels={EQUIPMENT_LABELS} onChange={onEquipmentKindChange} />
                </Box>
            )}
```

Wrap the existing toolbar `Box` and this new block in a fragment or `Stack`. The clear-confirmation `Dialog` stays.

- [ ] **Step 4: Run toolbar tests**

Run: `bun run test __tests__/components/features/practice-planner/DrawingToolbar.test.tsx`
Expected: PASS.

Run: `bun run type-check`
Expected: no errors. `PlayEditor` still passes the old tool values, which are still in the union.

- [ ] **Step 5: Commit**

```bash
git add types/practice-planner.ts components/features/practice-planner/DrawingToolbar.tsx __tests__/components/features/practice-planner/DrawingToolbar.test.tsx
git commit -m "feat(practice-planner): grouped toolbar with role, movement, and equipment options

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 7: RinkBoard behaviors and PlayEditor wiring

**Files:**
- Modify: `components/features/practice-planner/RinkBoard.tsx`
- Modify: `components/features/practice-planner/PlayEditor.tsx`
- Test: `__tests__/components/features/practice-planner/RinkBoard.test.tsx`, `PlayEditor.test.tsx`

**Interfaces:**
- Consumes: Tasks 1, 3, 4, 5, 6 (`drawStroke`, `drawAllElements(ctx, playData, …)`, `hitTest(point, data, minHitRadiusFt)`, `moveElement`, `removeElement`, `updateElement`, `findElement`, `simplifyPoints`, `ROLE_DEFAULT_COLORS`)
- Produces:
  - `RinkBoardProps` adds `playerRole?: PlayerRole` (default `"X"`), `strokeOptions?: StrokeOptions` (default `{ action: "skate", path: "freehand", end: "arrow" }`), `equipmentKind?: EquipmentKind` (default `"cone"`), and `onSelectionChange?: (id: string | null) => void`
  - `RinkBoardHandle` adds `updateElement(id: string, patch: ElementPatch): void`. It goes through `updatePlayData`, so it lands in undo history.
  - `RinkBoardProps` adds `onLimitReached?: (message: string) => void`
  - `lib/utils/canvas/element-ops.ts` adds `limitMessage(data: PlayData, kind: "player" | "drawing" | "equipment" | "annotation"): string | null`. It returns e.g. `"A play can have at most 50 equipment items."` when adding one more of `kind` would break that collection's cap or `MAX_ELEMENTS_PER_PLAY`, and `null` otherwise.

Limits: before placing a player, equipment item, annotation, or finished stroke, the board calls `limitMessage`. If it returns a string, the board skips the add and calls `onLimitReached(message)`. `PlayEditor` shows the message in an MUI `Snackbar` + `Alert severity="warning"` (autoHideDuration 4000). Unit-test `limitMessage` in `element-ops.test.ts`. Cases: 50 equipment items + equipment → message; 49 + equipment → null; 100 total elements + annotation → the total-elements message. Add a RinkBoard test that a 51st cone isn't added and `onLimitReached` is called.

Behavior:
- `player` tool places `{ role: playerRole, label: "", color: ROLE_DEFAULT_COLORS[playerRole] }`.
- `stroke` tool records points. On pointer-up it stores `{ ...strokeOptions, points, color: selectedColor, strokeWidth: 2 }`, where `points` is `[first, last]` for `straight` and `simplifyPoints(points, 0.5)` for `freehand`.
- `equipment` tool places `{ kind: equipmentKind, rotation: 0 }`.
- `select` drags players, equipment and annotations, using the existing preview/commit-on-up pattern with `moveElement`.
- The eraser and Delete key use `removeElement`.
- Hit-testing passes `minHitRadiusFt = 22 / (Math.min(transform.scaleX, transform.scaleY) * scale)`.
- `onSelectionChange` fires whenever `selectedElementId` changes. Changing tool away from `select` clears the selection.
- The in-progress preview uses `drawStroke` with the current `strokeOptions`. For `straight` it previews `[first, current]`.

- [ ] **Step 1: Write the failing pure placement tests**

Placement logic lives in `element-ops.ts` so it's testable without a canvas. Add these to the Interfaces as well:
- `placePlayer(data: PlayData, position: Position, role: PlayerRole, id: string): PlayData`, which uses `label: ""` and `color: ROLE_DEFAULT_COLORS[role]`
- `placeEquipment(data: PlayData, position: Position, kind: EquipmentKind, id: string): PlayData`, which uses `rotation: 0`
- `finishStroke(data: PlayData, rawPoints: Position[], options: StrokeOptions, color: string, id: string): PlayData`. It stores `[first, last]` for `straight` and `simplifyPoints(rawPoints, 0.5)` for `freehand`, with `strokeWidth: 2`. It returns `data` unchanged (same reference) when fewer than 2 points are given or first→last is shorter than 1 ft.

Append to `__tests__/lib/utils/canvas/element-ops.test.ts`:

```ts
import { placePlayer, placeEquipment, finishStroke, limitMessage } from "@/lib/utils/canvas/element-ops";
import { ROLE_DEFAULT_COLORS } from "@/lib/utils/canvas/notation";

describe("placement", () => {
    const empty = createEmptyPlayData();

    it("places a player with the role's default color and empty label", () => {
        expect(placePlayer(empty, { x: 5, y: 5 }, "D", "p").players[0]).toEqual({
            id: "p", position: { x: 5, y: 5 }, role: "D", label: "", color: ROLE_DEFAULT_COLORS.D,
        });
    });

    it("places equipment unrotated", () => {
        expect(placeEquipment(empty, { x: 5, y: 5 }, "net", "n").equipment[0]).toEqual({ id: "n", kind: "net", position: { x: 5, y: 5 }, rotation: 0 });
    });

    it("stores a straight stroke as its endpoints", () => {
        const raw = [{ x: 20, y: 20 }, { x: 40, y: 30 }, { x: 60, y: 20 }];
        const s = finishStroke(empty, raw, { action: "pass", path: "straight", end: "arrow" }, "#1976D2", "s").drawings[0];
        expect(s).toMatchObject({ action: "pass", path: "straight", end: "arrow", color: "#1976D2", strokeWidth: 2 });
        expect(s.points).toEqual([{ x: 20, y: 20 }, { x: 60, y: 20 }]);
    });

    it("simplifies freehand strokes", () => {
        const raw = Array.from({ length: 200 }, (_, i) => ({ x: 10 + i * 0.1, y: 10 }));
        const s = finishStroke(empty, raw, { action: "carry", path: "freehand", end: "arrow" }, "#000000", "s").drawings[0];
        expect(s.points.length).toBeLessThan(raw.length);
    });

    it("ignores taps shorter than 1 ft", () => {
        expect(finishStroke(empty, [{ x: 5, y: 5 }, { x: 5.4, y: 5 }], { action: "skate", path: "freehand", end: "arrow" }, "#000000", "s")).toBe(empty);
    });
});

describe("limitMessage", () => {
    const cones = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, kind: "cone" as const, position: { x: 1, y: 1 }, rotation: 0 }));

    it("blocks the 51st equipment item", () => {
        expect(limitMessage({ ...createEmptyPlayData(), equipment: cones(50) }, "equipment")).toMatch(/50 equipment/);
        expect(limitMessage({ ...createEmptyPlayData(), equipment: cones(49) }, "equipment")).toBeNull();
    });

    it("blocks anything past the total element cap", () => {
        const players = Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, position: { x: 1, y: 1 }, role: "X" as const, label: "", color: "#000000" }));
        expect(limitMessage({ ...createEmptyPlayData(), players, equipment: cones(50) }, "annotation")).toMatch(/100/);
    });
});
```

Implement these four functions in `element-ops.ts`, plus `limitMessage` from the Interfaces block above. Run `bun run test __tests__/lib/utils/canvas/element-ops.test.ts` and confirm it passes.

- [ ] **Step 1b: Board DOM tests (smoke level)**

In jsdom, `handleResize` (`RinkBoard.tsx:166`) reads `containerRef.current.clientWidth`, which is **0**, so the transform is degenerate and pointer events can't map to rink coordinates. The DOM tests must stub the container size. Run this probe first: one test with the player tool and one click, asserting one `onPlayDataChange` call. Only write the rest once it passes. If the probe can't be made to work after reading `getTransformedRinkPosition`, keep only the handle-based undo test (it needs no pointer mapping) and report back. The placement logic itself is already covered by Step 1.

Extend `RinkBoard.test.tsx` (its fixture setup and mocked 2D context already exist):

```tsx
describe("hockey notation tools", () => {
    // Restore only these two spies: vi.restoreAllMocks() could also reset the
    // file's getContext vi.fn mocks, depending on the Vitest version.
    let widthSpy: ReturnType<typeof vi.spyOn>;
    let heightSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        widthSpy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
        heightSpy = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
    });
    afterEach(() => {
        widthSpy.mockRestore();
        heightSpy.mockRestore();
    });

    function setup(props: Partial<RinkBoardProps> = {}) {
        const onPlayDataChange = vi.fn();
        const ref = React.createRef<RinkBoardHandle>();
        const utils = render(
            <RinkBoard ref={ref} mode="edit" width={800} height={400} playData={createEmptyPlayData()} onPlayDataChange={onPlayDataChange} {...props} />
        );
        const canvas = utils.container.querySelector("canvas")!;
        canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
        const at = (x: number, y: number) => {
            const p = rinkToCanvas({ x, y }, createTransformContext(800, 400));
            return { clientX: p.x, clientY: p.y };
        };
        return { ...utils, canvas, at, onPlayDataChange, ref };
    }

    // PROBE: write and pass this one first (see Step 1b).
    it("places a player with the chosen role (pointer → rink mapping works)", () => {
        const { canvas, at, onPlayDataChange } = setup({ selectedTool: "player", playerRole: "D" });
        fireEvent.mouseDown(canvas, at(50, 40));
        expect(onPlayDataChange).toHaveBeenCalledTimes(1);
        const data = onPlayDataChange.mock.calls[0][0];
        expect(data.players[0]).toMatchObject({ role: "D", color: ROLE_DEFAULT_COLORS.D });
        expect(data.players[0].position.x).toBeCloseTo(50, 0);
    });

    it("blocks the 51st cone and reports the limit", () => {
        const cones = Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, kind: "cone" as const, position: { x: 1, y: 1 }, rotation: 0 }));
        const onLimitReached = vi.fn();
        const { canvas, at, onPlayDataChange } = setup({
            playData: { ...createEmptyPlayData(), equipment: cones },
            selectedTool: "equipment",
            equipmentKind: "cone",
            onLimitReached,
        });
        fireEvent.mouseDown(canvas, at(100, 40));
        expect(onPlayDataChange).not.toHaveBeenCalled();
        expect(onLimitReached).toHaveBeenCalledWith(expect.stringMatching(/50 equipment/));
    });

    it("updateElement via the handle is undoable", () => {
        const start = { ...createEmptyPlayData(), equipment: [{ id: "n", kind: "net" as const, position: { x: 100, y: 40 }, rotation: 0 }] };
        const { ref, onPlayDataChange, rerender } = setup({ playData: start });
        act(() => ref.current!.updateElement("n", { rotation: 180 }));
        const edited = onPlayDataChange.mock.calls.at(-1)![0];
        expect(edited.equipment[0].rotation).toBe(180);
        rerender(<RinkBoard ref={ref} mode="edit" width={800} height={400} playData={edited} onPlayDataChange={onPlayDataChange} />);
        act(() => ref.current!.undo());
        expect(onPlayDataChange.mock.calls.at(-1)![0].equipment[0].rotation).toBe(0);
    });

    it("reports selection changes", () => {
        const onSelectionChange = vi.fn();
        const start = { ...createEmptyPlayData(), equipment: [{ id: "c", kind: "cone" as const, position: { x: 100, y: 40 }, rotation: 0 }] };
        const { canvas, at } = setup({ playData: start, selectedTool: "select", onSelectionChange });
        fireEvent.mouseDown(canvas, at(100, 40));
        fireEvent.mouseUp(canvas);
        expect(onSelectionChange).toHaveBeenLastCalledWith("c");
    });
});
```

Add the imports this needs: `React`, `act`, `fireEvent`, `RinkBoardHandle`, `RinkBoardProps`, `createEmptyPlayData`, `rinkToCanvas`, `createTransformContext`, `ROLE_DEFAULT_COLORS`. Update existing tests that pass `selectedTool="line"`/`"arrow"`/`"curve"` to `"stroke"`.

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test __tests__/components/features/practice-planner/RinkBoard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement in `RinkBoard.tsx`**

- Narrow `DrawingTool` in `types/practice-planner.ts` to `"select" | "player" | "stroke" | "equipment" | "text" | "eraser"` by removing Task 6's legacy members and comment.
- Add the five new props (`playerRole`, `strokeOptions`, `equipmentKind`, `onSelectionChange`, `onLimitReached`), with defaults, to the destructuring.
- Every add goes through `limitMessage` and then the pure placement function. For example, in the player case:
  ```ts
  const blocked = limitMessage(playData, "player");
  if (blocked) { onLimitReached?.(blocked); break; }
  updatePlayData(placePlayer(playData, clampedPos, playerRole, generateId()));
  ```
  Do the same for equipment (`placeEquipment`), text (`"annotation"`, before the `prompt`), and stroke finish (`finishStroke`, only updating when the result `!==` `playData`). These replace the inline literals described below.
- `useImperativeHandle` adds:
  ```ts
  updateElement: (id: string, patch: ElementPatch) => {
      updatePlayData(updateElement(playDataRef.current, id, patch));
  },
  ```
  Import `updateElement` from `element-ops` as `applyElementPatch`, to avoid shadowing.
- Add a helper `const minHitRadiusFt = () => (transform ? 22 / (Math.min(transform.scaleX, transform.scaleY) * scaleRef.current) : 0);`. Use `hitTest(clampedPos, playData, minHitRadiusFt())` everywhere `hitTest` is called.
- `select` case: on hit, set the drag offset from `findElement(playData, id)` when the element has a `position` (player, equipment, annotation), so equipment drags like players.
- `player` case: replace the `newPlayer` literal with the role-based one.
- Replace the `case "line": case "curve": case "arrow":` with `case "stroke":`. Make the same change in `handleMouseMove`'s `isDrawing && selectedTool === "stroke"` check.
- Add `case "equipment":`, which places `{ id: generateId(), kind: equipmentKind, position: clampedPos, rotation: 0 }` into `equipment`.
- `eraser` case: `updatePlayData(removeElement(playData, eraserHitResult.elementId))`.
- `handleMouseUp`:
  ```ts
            if (isDrawing && currentDrawingPoints.length >= 2) {
                const points = strokeOptions.path === "straight"
                    ? [currentDrawingPoints[0], currentDrawingPoints[currentDrawingPoints.length - 1]]
                    : simplifyPoints(currentDrawingPoints, 0.5);
                const first = points[0];
                const last = points[points.length - 1];
                if (Math.hypot(last.x - first.x, last.y - first.y) >= 1) {
                    updatePlayData({
                        ...playData,
                        drawings: [...playData.drawings, { id: generateId(), ...strokeOptions, points, color: selectedColor, strokeWidth: 2 }],
                    });
                }
            }
            if (isDragging && selectedElementId && dragPreviewPosition) {
                updatePlayData(moveElement(playDataRef.current, selectedElementId, dragPreviewPosition));
            }
  ```
  The `>= 1` ft guard drops accidental taps.
- `render`: build the preview data with `const renderData = isDragging && selectedElementId && dragPreviewPosition ? moveElement(playData, selectedElementId, dragPreviewPosition) : playData;`, then call `drawAllElements(ctx, renderData, transform, selectedElementId || undefined)`. The in-progress stroke becomes:
  ```ts
        if (isDrawing && currentDrawingPoints.length > 1) {
            const previewPoints = strokeOptions.path === "straight"
                ? [currentDrawingPoints[0], currentDrawingPoints[currentDrawingPoints.length - 1]]
                : currentDrawingPoints;
            drawStroke(ctx, { ...strokeOptions, points: previewPoints, color: selectedColor, strokeWidth: 2 }, transform);
        }
  ```
  Add `strokeOptions` to the dependency list.
- Delete-key handler: `updatePlayData(removeElement(playData, selectedElementId))`.
- Selection reporting and clearing:
  ```ts
    useEffect(() => { onSelectionChange?.(selectedElementId); }, [selectedElementId, onSelectionChange]);
    useEffect(() => { if (selectedTool !== "select") setSelectedElementId(null); }, [selectedTool]);
  ```
- Remove the now-unused `strokeFromV1Type` import and the `PlayerIcon`/`DrawingElement`/`TextAnnotation` imports that lint flags.

- [ ] **Step 4: Wire `PlayEditor.tsx`**

Add state, and pass it to both the toolbar and the board:

```tsx
    const [playerRole, setPlayerRole] = useState<PlayerRole>("X");
    const [strokeOptions, setStrokeOptions] = useState<StrokeOptions>({ action: "skate", path: "freehand", end: "arrow" });
    const [equipmentKind, setEquipmentKind] = useState<EquipmentKind>("cone");
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
```

The toolbar gets `playerRole`, `onPlayerRoleChange={setPlayerRole}`, `strokeOptions`, `onStrokeOptionsChange={setStrokeOptions}`, `equipmentKind` and `onEquipmentKindChange={setEquipmentKind}`. `RinkBoard` gets `playerRole`, `strokeOptions`, `equipmentKind` and `onSelectionChange={setSelectedElementId}`. Task 8 uses `selectedElementId`. Keep it now, prefixed with `void selectedElementId;` only if lint complains about an unused variable.

- [ ] **Step 5: Run tests, type-check, lint**

Run: `bun run test __tests__/components/features/practice-planner __tests__/lib/utils/canvas`
Expected: PASS.
Run: `bun run type-check && bun run lint`
Expected: no errors. This is the checkpoint that clears Task 6's red state.

- [ ] **Step 6: Commit**

```bash
git add components/features/practice-planner/RinkBoard.tsx components/features/practice-planner/PlayEditor.tsx __tests__/components/features/practice-planner
git commit -m "feat(practice-planner): board places roles, equipment, and semantic strokes

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 8: Element inspector

**Files:**
- Create: `components/features/practice-planner/ElementInspector.tsx`
- Modify: `components/features/practice-planner/PlayEditor.tsx` (render the inspector between toolbar and board)
- Test: `__tests__/components/features/practice-planner/ElementInspector.test.tsx` (create), `PlayEditor.test.tsx` (extend)

**Interfaces:**
- Consumes: `SelectedElement`, `ElementPatch`, `findElement` (Task 5); `RinkBoardHandle.updateElement` (Task 7); notation labels (Task 1)
- Produces: `ElementInspector({ selected: SelectedElement | null; onChange: (patch: ElementPatch) => void })`. It renders nothing when `selected` is null. The root has `role="region"` and `aria-label="selected element"`.

Controls:

| kind | controls |
|---|---|
| drawing | action (`OptionGroup`-style toggle, `aria-label="stroke action"`), end (`"stroke end"`), color swatches (`aria-label="element color"`) |
| player | role (`"player role"`), label (`TextField` label "Label", maxLength 50, commits on blur/Enter), color |
| equipment | kind (`"equipment kind"`); for `net`, rotation toggle (`aria-label="net rotation"`) with options 0/90/180/270 labeled "Faces left"/"Faces up"/"Faces right"/"Faces down". Map to rotation values (0 = mouth left per Task 4; confirm the 90/270 labels visually in Task 10 and swap them if inverted). |
| annotation | text (`TextField` label "Text", commits on blur/Enter, rejects empty), color |

Changing a drawing's action **does not** reset its end. A coach re-tagging a stroke keeps the cap they chose. This is unlike the toolbar, which sets defaults for *new* strokes.

Reuse the `OptionGroup` from Task 6 by moving it into `components/features/practice-planner/OptionGroup.tsx` as a named export, and import it in both the toolbar and the inspector. Do this move as the first step of this task.

- [ ] **Step 1: Move `OptionGroup` to its own file, update the toolbar import, rerun the toolbar tests**

Run: `bun run test __tests__/components/features/practice-planner/DrawingToolbar.test.tsx`
Expected: PASS.

- [ ] **Step 2: Write the failing tests**

Create `__tests__/components/features/practice-planner/ElementInspector.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { ElementInspector } from "@/components/features/practice-planner/ElementInspector";
import type { SelectedElement } from "@/lib/utils/canvas/element-ops";

const wrap = (selected: SelectedElement | null, onChange = vi.fn()) => {
    render(<ThemeProvider theme={createTheme()}><ElementInspector selected={selected} onChange={onChange} /></ThemeProvider>);
    return onChange;
};

const stroke: SelectedElement = {
    kind: "drawing",
    element: { id: "d", action: "skate", path: "straight", end: "stop", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#212121", strokeWidth: 2 },
};

describe("ElementInspector", () => {
    it("renders nothing without a selection", () => {
        wrap(null);
        expect(screen.queryByRole("region", { name: "selected element" })).not.toBeInTheDocument();
    });

    it("re-tags a stroke's action without resetting its end", async () => {
        const onChange = wrap(stroke);
        await userEvent.click(screen.getByLabelText("Pass"));
        expect(onChange).toHaveBeenCalledWith({ action: "pass" });
    });

    it("changes a player's role and commits the label on blur", async () => {
        const onChange = wrap({ kind: "player", element: { id: "p", role: "X", label: "", color: "#1976D2", position: { x: 1, y: 1 } } });
        await userEvent.click(screen.getByLabelText("Goalie"));
        expect(onChange).toHaveBeenCalledWith({ role: "G" });
        const label = screen.getByLabelText("Label");
        await userEvent.type(label, "G1");
        await userEvent.tab();
        expect(onChange).toHaveBeenCalledWith({ label: "G1" });
    });

    it("offers rotation only for nets", () => {
        wrap({ kind: "equipment", element: { id: "c", kind: "cone", position: { x: 1, y: 1 }, rotation: 0 } });
        expect(screen.queryByRole("group", { name: "net rotation" })).not.toBeInTheDocument();
    });

    it("rotates a net", async () => {
        const onChange = wrap({ kind: "equipment", element: { id: "n", kind: "net", position: { x: 1, y: 1 }, rotation: 0 } });
        await userEvent.click(screen.getByLabelText("Faces right"));
        expect(onChange).toHaveBeenCalledWith({ rotation: 180 });
    });

    it("refuses to blank an annotation", async () => {
        const onChange = wrap({ kind: "annotation", element: { id: "a", text: "Go", position: { x: 1, y: 1 }, fontSize: 8, color: "#212121" } });
        const field = screen.getByLabelText("Text");
        await userEvent.clear(field);
        await userEvent.tab();
        expect(onChange).not.toHaveBeenCalledWith({ text: "" });
    });
});
```

Create `__tests__/components/features/practice-planner/PlayEditor.inspector.test.tsx`. It's separate because the existing `PlayEditor.test.tsx` renders the real board. Here the board is mocked: it selects the net on mount, and `updateElement` applies the patch the way the real handle does.

```tsx
import React, { forwardRef, useEffect, useImperativeHandle } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { updateElement } from "@/lib/utils/canvas/element-ops";
import type { RinkBoardProps } from "@/components/features/practice-planner/RinkBoard";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "data:image/png;base64,AA==" }));
vi.mock("@/components/features/practice-planner/RinkBoard", () => ({
    RinkBoard: forwardRef(function MockBoard(props: RinkBoardProps, ref) {
        useEffect(() => { props.onSelectionChange?.("n"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
        useImperativeHandle(ref, () => ({
            undo: () => {}, redo: () => {}, clear: () => {},
            updateElement: (id: string, patch: object) => props.onPlayDataChange?.(updateElement(props.playData, id, patch)),
        }));
        return <div data-testid="board" data-rotation={props.playData.equipment[0]?.rotation} />;
    }),
}));

import { PlayEditor } from "@/components/features/practice-planner/PlayEditor";

describe("PlayEditor + inspector", () => {
    it("edits the selected net through the board handle", async () => {
        const playData = { ...createEmptyPlayData(), equipment: [{ id: "n", kind: "net" as const, position: { x: 100, y: 40 }, rotation: 0 }] };
        render(
            <ThemeProvider theme={createTheme()}>
                <PlayEditor teamId="t" initialData={{ name: "Drill", playData }} />
            </ThemeProvider>
        );
        expect(await screen.findByRole("region", { name: "selected element" })).toBeInTheDocument();
        await userEvent.click(screen.getByLabelText("Faces right"));
        expect(screen.getByTestId("board")).toHaveAttribute("data-rotation", "180");
    });
});
```

If `PlayEditor` imports the board as `./RinkBoard` and Vitest doesn't apply the aliased mock to it, change the `vi.mock` path to match the import exactly as written in `PlayEditor.tsx`.

- [ ] **Step 3: Run to verify it fails**

Run: `bun run test __tests__/components/features/practice-planner/ElementInspector.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Implement `ElementInspector.tsx`**

```tsx
"use client";

/**
 * ElementInspector: edit the selected board element's meaning (action, end,
 * role, label, kind, rotation, text) and color. Edits are emitted as patches;
 * the parent applies them through RinkBoardHandle.updateElement so they are
 * undoable.
 */
import React, { useEffect, useState } from "react";
import { Box, Paper, Stack, TextField, Typography, ButtonBase } from "@mui/material";
import { OptionGroup } from "./OptionGroup";
import type { ElementPatch, SelectedElement } from "@/lib/utils/canvas/element-ops";
import { EQUIPMENT_KINDS, PLAYER_ROLES, STROKE_ACTIONS, STROKE_ENDS, VALIDATION_CONSTRAINTS } from "@/types/practice-planner";
import { ACTION_LABELS, END_LABELS, EQUIPMENT_LABELS, ROLE_LABELS } from "@/lib/utils/canvas/notation";

const SWATCHES = ["#212121", "#0D47A1", "#1976D2", "#D32F2F", "#2E7D32", "#F57C00", "#6A1B9A"];
const NET_ROTATIONS = ["0", "90", "180", "270"] as const;
const NET_ROTATION_LABELS: Record<(typeof NET_ROTATIONS)[number], string> = {
    "0": "Faces left",
    "90": "Faces up",
    "180": "Faces right",
    "270": "Faces down",
};
const KIND_TITLES = { drawing: "Movement", player: "Player", equipment: "Equipment", annotation: "Text" } as const;

function CommitField({ label, value, maxLength, allowEmpty, onCommit }: {
    label: string; value: string; maxLength: number; allowEmpty: boolean; onCommit: (v: string) => void;
}) {
    const [draft, setDraft] = useState(value);
    useEffect(() => setDraft(value), [value]);
    const commit = () => {
        if (draft === value) return;
        if (!allowEmpty && draft.trim() === "") { setDraft(value); return; }
        onCommit(draft);
    };
    return (
        <TextField
            label={label}
            size="small"
            value={draft}
            inputProps={{ maxLength }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
        />
    );
}

function ColorRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
    return (
        <Stack direction="row" spacing={0.5} role="group" aria-label="element color" sx={{ flexWrap: "wrap" }}>
            {SWATCHES.map((c) => (
                <ButtonBase
                    key={c}
                    aria-label={`color ${c}`}
                    aria-pressed={value.toUpperCase() === c}
                    onClick={() => onChange(c)}
                    sx={{
                        width: 44, height: 44, borderRadius: "50%", bgcolor: c,
                        outline: value.toUpperCase() === c ? "3px solid #FFD700" : "1px solid rgba(0,0,0,0.2)",
                        outlineOffset: 2,
                    }}
                />
            ))}
        </Stack>
    );
}

export interface ElementInspectorProps {
    selected: SelectedElement | null;
    onChange: (patch: ElementPatch) => void;
}

export function ElementInspector({ selected, onChange }: ElementInspectorProps) {
    if (!selected) return null;

    return (
        <Paper elevation={2} sx={{ p: 2 }} role="region" aria-label="selected element">
            <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: 2 }}>
                {KIND_TITLES[selected.kind]}
            </Typography>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", mt: 1 }}>
                {selected.kind === "drawing" && (
                    <>
                        <OptionGroup label="stroke action" value={selected.element.action} options={STROKE_ACTIONS} labels={ACTION_LABELS} onChange={(action) => onChange({ action })} />
                        <OptionGroup label="stroke end" value={selected.element.end} options={STROKE_ENDS} labels={END_LABELS} onChange={(end) => onChange({ end })} />
                        <ColorRow value={selected.element.color} onChange={(color) => onChange({ color })} />
                    </>
                )}
                {selected.kind === "player" && (
                    <>
                        <OptionGroup label="player role" value={selected.element.role} options={PLAYER_ROLES} labels={ROLE_LABELS} onChange={(role) => onChange({ role })} />
                        <CommitField label="Label" value={selected.element.label} maxLength={VALIDATION_CONSTRAINTS.MAX_PLAYER_LABEL_LENGTH} allowEmpty onCommit={(label) => onChange({ label })} />
                        <ColorRow value={selected.element.color} onChange={(color) => onChange({ color })} />
                    </>
                )}
                {selected.kind === "equipment" && (
                    <>
                        <OptionGroup label="equipment kind" value={selected.element.kind} options={EQUIPMENT_KINDS} labels={EQUIPMENT_LABELS} onChange={(kind) => onChange({ kind })} />
                        {selected.element.kind === "net" && (
                            <OptionGroup
                                label="net rotation"
                                value={String(selected.element.rotation) as (typeof NET_ROTATIONS)[number]}
                                options={NET_ROTATIONS}
                                labels={NET_ROTATION_LABELS}
                                onChange={(r) => onChange({ rotation: Number(r) })}
                            />
                        )}
                    </>
                )}
                {selected.kind === "annotation" && (
                    <>
                        <CommitField label="Text" value={selected.element.text} maxLength={VALIDATION_CONSTRAINTS.MAX_ANNOTATION_LENGTH} allowEmpty={false} onCommit={(text) => onChange({ text })} />
                        <ColorRow value={selected.element.color} onChange={(color) => onChange({ color })} />
                    </>
                )}
            </Box>
        </Paper>
    );
}
```

A net's `rotation` may be a non-quarter value only if it was hand-edited. `OptionGroup` then shows nothing selected, which is acceptable.

- [ ] **Step 5: Render it in `PlayEditor.tsx`**

Between the toolbar `Paper` and the board `Paper`:

```tsx
            <ElementInspector
                selected={selectedElementId ? findElement(playData, selectedElementId) : null}
                onChange={(patch) => selectedElementId && rinkBoardRef.current?.updateElement(selectedElementId, patch)}
            />
```

- [ ] **Step 6: Run tests, type-check, lint**

Run: `bun run test __tests__/components/features/practice-planner`
Expected: PASS.
Run: `bun run type-check && bun run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/features/practice-planner/ElementInspector.tsx components/features/practice-planner/OptionGroup.tsx components/features/practice-planner/DrawingToolbar.tsx components/features/practice-planner/PlayEditor.tsx __tests__/components/features/practice-planner
git commit -m "feat(practice-planner): inspector to re-tag strokes, roles, and equipment

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 9: Drill legend

**Files:**
- Create: `lib/utils/canvas/legend.ts` (pure `buildLegend`)
- Create: `components/features/practice-planner/PlayLegend.tsx`
- Modify: `components/features/practice-planner/PlayEditor.tsx` (legend under the board)
- Modify: `app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx` (legend under the active play's thumbnail; type for `play.playData`)
- Test: `__tests__/lib/utils/canvas/legend.test.ts` (create), `__tests__/components/features/practice-planner/PlayLegend.test.tsx` (create)

**Interfaces:**
- Consumes: `PlayData | null` (Task 1/2), `drawStroke` (Task 3), `drawPlayerGlyph` / `drawEquipmentGlyph` (Task 4), notation labels (Task 1)
- Produces:
  - `type LegendEntry = { key: string; label: string } & ({ type: "action"; action: StrokeAction } | { type: "end"; end: "stop" } | { type: "role"; role: PlayerRole } | { type: "equipment"; kind: EquipmentKind })`
  - `buildLegend(data: PlayData): LegendEntry[]`, in fixed order: actions in `STROKE_ACTIONS` order, then "stop" if used, then roles in `PLAYER_ROLES` order, then equipment in `EQUIPMENT_KINDS` order. `line` and the `arrow` end are omitted, since they need no explanation.
  - `PlayLegend({ playData: PlayData | null; defaultExpanded?: boolean })`. It renders nothing for `null` or an empty legend. It's an MUI `Accordion`, with summary "Legend (N)". Each entry is a 40×20 canvas swatch (`aria-hidden`) plus a text label.

- [ ] **Step 1: Write the failing tests**

`__tests__/lib/utils/canvas/legend.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildLegend } from "@/lib/utils/canvas/legend";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const s = (id: string, action: "pass" | "carry" | "line" | "skate", end: "arrow" | "stop" | "none" = "arrow") =>
    ({ id, action, path: "straight" as const, end, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#000000", strokeWidth: 2 });

describe("buildLegend", () => {
    it("is empty for an empty play", () => {
        expect(buildLegend(createEmptyPlayData())).toEqual([]);
    });

    it("lists each used symbol once, in a stable order, omitting self-explanatory ones", () => {
        const data = {
            ...createEmptyPlayData(),
            drawings: [s("1", "pass"), s("2", "carry"), s("3", "pass"), s("4", "line"), s("5", "skate", "stop")],
            players: [
                { id: "p1", role: "O" as const, label: "", color: "#D32F2F", position: { x: 1, y: 1 } },
                { id: "p2", role: "D" as const, label: "", color: "#0D47A1", position: { x: 1, y: 1 } },
            ],
            equipment: [{ id: "e", kind: "cone" as const, position: { x: 1, y: 1 }, rotation: 0 }],
        };
        expect(buildLegend(data).map((e) => e.label)).toEqual([
            "Skate", "Puck carry", "Pass", "Stop", "Opponent", "Defense", "Cone",
        ]);
    });
});
```

`__tests__/components/features/practice-planner/PlayLegend.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { PlayLegend } from "@/components/features/practice-planner/PlayLegend";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const wrap = (ui: React.ReactElement) => render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);

describe("PlayLegend", () => {
    it("renders nothing for an empty or unreadable play", () => {
        const { container } = wrap(<PlayLegend playData={createEmptyPlayData()} />);
        expect(container).toBeEmptyDOMElement();
        const { container: c2 } = wrap(<PlayLegend playData={null} />);
        expect(c2).toBeEmptyDOMElement();
    });

    it("lists the symbols the drill uses", () => {
        const data = { ...createEmptyPlayData(), equipment: [{ id: "n", kind: "net" as const, position: { x: 1, y: 1 }, rotation: 0 }] };
        wrap(<PlayLegend playData={data} defaultExpanded />);
        expect(screen.getByText("Legend (1)")).toBeInTheDocument();
        expect(screen.getByText("Net")).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test __tests__/lib/utils/canvas/legend.test.ts __tests__/components/features/practice-planner/PlayLegend.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `legend.ts`**

```ts
import { EQUIPMENT_KINDS, PLAYER_ROLES, STROKE_ACTIONS, type EquipmentKind, type PlayData, type PlayerRole, type StrokeAction } from "@/types/practice-planner";
import { ACTION_LABELS, END_LABELS, EQUIPMENT_LABELS, ROLE_LABELS } from "./notation";

export type LegendEntry = { key: string; label: string } & (
    | { type: "action"; action: StrokeAction }
    | { type: "end"; end: "stop" }
    | { type: "role"; role: PlayerRole }
    | { type: "equipment"; kind: EquipmentKind }
);

export function buildLegend(data: PlayData): LegendEntry[] {
    const actions = new Set(data.drawings.map((d) => d.action));
    const roles = new Set(data.players.map((p) => p.role));
    const kinds = new Set(data.equipment.map((e) => e.kind));
    const entries: LegendEntry[] = [];
    for (const action of STROKE_ACTIONS) {
        if (action !== "line" && actions.has(action)) entries.push({ key: `action-${action}`, label: ACTION_LABELS[action], type: "action", action });
    }
    if (data.drawings.some((d) => d.end === "stop")) entries.push({ key: "end-stop", label: END_LABELS.stop, type: "end", end: "stop" });
    for (const role of PLAYER_ROLES) {
        if (roles.has(role)) entries.push({ key: `role-${role}`, label: ROLE_LABELS[role], type: "role", role });
    }
    for (const kind of EQUIPMENT_KINDS) {
        if (kinds.has(kind)) entries.push({ key: `equipment-${kind}`, label: EQUIPMENT_LABELS[kind], type: "equipment", kind });
    }
    return entries;
}
```

- [ ] **Step 4: Implement `PlayLegend.tsx`**

```tsx
"use client";

/** Collapsible legend listing only the notation a drill actually uses. */
import React, { useEffect, useRef } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from "@mui/material";
import { ExpandMore as ExpandMoreIcon } from "@mui/icons-material";
import type { PlayData } from "@/types/practice-planner";
import { buildLegend, type LegendEntry } from "@/lib/utils/canvas/legend";
import { createTransformContext } from "@/lib/utils/canvas/rink-renderer";
import { drawStroke } from "@/lib/utils/canvas/drawing-utils";
import { drawEquipmentGlyph, drawPlayerGlyph } from "@/lib/utils/canvas/glyphs";
import { BOARD_COLORS, ROLE_DEFAULT_COLORS } from "@/lib/utils/canvas/notation";

const W = 40;
const H = 20;

function Swatch({ entry }: { entry: LegendEntry }) {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const ctx = ref.current?.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, W, H);
        // A 200x85 ft rink fitted to the swatch gives ~0.2 px/ft; patterns clamp to their px minimums.
        const t = createTransformContext(W, H, 0);
        const pxToFt = (px: number) => px / Math.min(t.scaleX, t.scaleY);
        const y = pxToFt(H / 2 - t.offsetY);
        const x0 = pxToFt(4 - t.offsetX);
        const x1 = pxToFt(W - 6 - t.offsetX);
        switch (entry.type) {
            case "action":
                drawStroke(ctx, { action: entry.action, path: "straight", end: "arrow", points: [{ x: x0, y }, { x: x1, y }], color: BOARD_COLORS.ink, strokeWidth: 2 }, t);
                break;
            case "end":
                drawStroke(ctx, { action: "skate", path: "straight", end: "stop", points: [{ x: x0, y }, { x: x1, y }], color: BOARD_COLORS.ink, strokeWidth: 2 }, t);
                break;
            case "role":
                drawPlayerGlyph(ctx, { id: "", role: entry.role, label: "", color: ROLE_DEFAULT_COLORS[entry.role], position: { x: 0, y: 0 } }, { x: W / 2, y: H / 2 }, 8, false);
                break;
            case "equipment":
                drawEquipmentGlyph(ctx, { kind: entry.kind, rotation: 0 }, { x: W / 2, y: H / 2 }, 8, false);
                break;
        }
    }, [entry]);
    return <canvas ref={ref} width={W} height={H} aria-hidden="true" />;
}

export function PlayLegend({ playData, defaultExpanded = false }: { playData: PlayData | null; defaultExpanded?: boolean }) {
    if (!playData) return null;
    const entries = buildLegend(playData);
    if (entries.length === 0) return null;
    return (
        <Accordion defaultExpanded={defaultExpanded} disableGutters elevation={0} sx={{ border: 1, borderColor: "divider" }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{`Legend (${entries.length})`}</Typography>
            </AccordionSummary>
            <AccordionDetails>
                <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 1 }}>
                    {entries.map((entry) => (
                        <Box component="li" key={entry.key} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Swatch entry={entry} />
                            <Typography variant="body2">{entry.label}</Typography>
                        </Box>
                    ))}
                </Box>
            </AccordionDetails>
        </Accordion>
    );
}
```

Before relying on `createTransformContext(W, H, 0)`'s `offsetX`/`offsetY`/`scaleX` fields, check them in `rink-renderer.ts:79-113`. If the swatch math is awkward, draw strokes in raw canvas px through `buildStrokeGeometry` instead. Either is fine as long as the swatch uses the same pattern code as the board.

- [ ] **Step 5: Mount it**

`PlayEditor.tsx`: render `<Box sx={{ mt: 2 }}><PlayLegend playData={playData} /></Box>` directly after the `RinkBoardErrorBoundary`, inside the board `Paper`.

`SessionDetailView.tsx`: add `playData: PlayData | null;` to its local play type (around line 59, next to `thumbnail`). Render `<PlayLegend playData={activePlay.play.playData} />` under the active play's thumbnail (around line 552–575). Read that block first and match its spacing. The prop comes from `getPracticeSessionDetail` (Task 2), passed through by `[sessionId]/page.tsx`. Check that page passes `session` through unchanged.

- [ ] **Step 6: Run tests, type-check, lint**

Run: `bun run test __tests__/lib/utils/canvas __tests__/components/features/practice-planner`
Expected: PASS.
Run: `bun run type-check && bun run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/utils/canvas/legend.ts components/features/practice-planner/PlayLegend.tsx components/features/practice-planner/PlayEditor.tsx "app/(dashboard)/practice-planner/[sessionId]/SessionDetailView.tsx" __tests__
git commit -m "feat(practice-planner): drill legend on the editor and session view

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```

---

### Task 10: Spec amendments, full gates, visual check

**Files:**
- Modify: `docs/superpowers/specs/2026-10-02-practice-board-notation-design.md`

- [ ] **Step 1: Amend the spec**

Fold the six "Spec deviations" items at the top of this plan into the spec's relevant sections (Data model → `StrokePath` note; Validation; Components → toolbar, inspector; Rendering → role glyph table; Testing → `validatePracticeSessionData`; Risks → stale thumbnails). Mark the Status line `Implemented (phase 1)`.

- [ ] **Step 2: Run every gate**

Run: `bun run type-check && bun run lint && bun run test && bun run build`
Expected: all green. `bun run build` catches Next route/RSC issues that type-check misses. Report any failure verbatim. If a failure is outside the practice planner, check `gh run list --branch main --limit 3` to see whether it also fails on main before attributing it to this branch.

- [ ] **Step 3: Visual check of the glyphs and patterns**

The dev database is far behind on migrations, so don't click through live pages. Instead, add a temporary Vitest render that writes one PNG per action, role and equipment kind:

1. Create `scratch/notation-preview.test.ts`, outside `__tests__`, and delete it afterwards.
2. Use `node-canvas` only if it's already installed (`ls node_modules/canvas`). If it isn't, skip this step: don't add a dependency.
3. Inspect the images. In particular, confirm which way the net mouth faces at 90/270, and swap the `NET_ROTATION_LABELS` text in Task 8 if it's inverted.

Report which of these you did.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-10-02-practice-board-notation-design.md
git commit -m "docs(practice-planner): record phase 1 implementation decisions in spec

Claude-Session: https://claude.ai/code/session_01TqKuhs6SuVkWyirkz3ZdQX"
```
