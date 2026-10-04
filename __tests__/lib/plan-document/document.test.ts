/** The portable practice-plan document (ADR-0020): parse, serialize, limits, file name. */
import { describe, expect, it } from "vitest";
import {
    INVALID_PLAN_MESSAGE,
    MAX_DRILL_DESCRIPTION_LENGTH,
    MAX_PLAN_DRILLS,
    NEWER_VERSION_MESSAGE,
    NOT_A_PLAN_MESSAGE,
    ROW_KIND_MESSAGE,
    PLAN_FORMAT,
    PLAN_VERSION,
    parsePlan,
    planByteLength,
    planExportFileName,
    planFileName,
    planSlug,
    planToEditorSession,
    serializePlan,
    type PlanSessionInput,
} from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { BLOCK_STATION_ERROR, FIRST_DRILL_STATION_ERROR, ROTATION_PLACEMENT_ERROR, STATION_GROUP_CAP_ERROR, groupStations } from "@/lib/utils/session-timeline";
import { drillRows } from "@/lib/utils/session-rows";
import type { PlayData } from "@/types/practice-planner";

const NOW = new Date("2026-10-03T18:00:00.000Z");

const BOARD: PlayData = {
    version: 2,
    players: [{ id: "p1", position: { x: 50, y: 40 }, role: "X", label: "F1", color: "#1976D2" }],
    drawings: [],
    equipment: [],
    annotations: [],
};

/** A v1 diagram: no version key, a player off the rink, an old-style arrow. */
const V1_BOARD = {
    players: [{ id: "p1", position: { x: 250, y: 40 }, label: "A", color: "#FF0000" }],
    drawings: [{ id: "d1", type: "arrow", points: [{ x: 10, y: 10 }, { x: 20, y: 20 }], color: "#000000", strokeWidth: 2 }],
    annotations: [],
};

function input(overrides: Partial<PlanSessionInput> = {}): PlanSessionInput {
    return {
        title: "Tuesday Skills Practice",
        durationMinutes: 60,
        date: "2026-10-06",
        startTime: "19:00",
        drills: [
            { sequence: 0, duration: 10, runsWithPrevious: false, instructions: "Two laps", name: "Warmup Laps", description: "", playData: BOARD },
            { sequence: 1, duration: 15, runsWithPrevious: false, instructions: null, name: "Breakout", description: "D to D", playData: BOARD },
            { sequence: 2, duration: 10, runsWithPrevious: true, instructions: "", name: "Regroup", description: null, playData: null },
        ],
        ...overrides,
    };
}

type RawDrill = {
    sequence: unknown;
    durationMinutes: unknown;
    runsWithPrevious: unknown;
    instructions: unknown;
    drill: { name: unknown; description: unknown; playData: unknown; [key: string]: unknown };
    [key: string]: unknown;
};
type RawDoc = {
    format: unknown;
    version: unknown;
    session: { title: unknown; durationMinutes: unknown; date?: unknown; startTime?: unknown; drills: RawDrill[]; [key: string]: unknown };
    [key: string]: unknown;
};

/** A serialized document as plain JSON, so a test can break it the way a hand-edited file would. */
function rawDoc(mutate?: (doc: RawDoc) => void): RawDoc {
    const doc = JSON.parse(JSON.stringify(serializePlan(input(), "openleague-hosted", NOW))) as RawDoc;
    mutate?.(doc);
    return doc;
}

function drill(sequence: number, overrides: Partial<RawDrill> = {}): RawDrill {
    return {
        sequence,
        durationMinutes: 1,
        runsWithPrevious: false,
        instructions: "",
        drill: { name: `Drill ${sequence}`, description: "", playData: BOARD },
        ...overrides,
    };
}

function issuesOf(raw: unknown): string[] {
    const result = parsePlan(raw);
    if (result.ok) throw new Error("expected the plan to be rejected");
    expect(result.error.code).toBe("invalid");
    expect(result.error.message).toBe(INVALID_PLAN_MESSAGE);
    return result.error.issues ?? [];
}

describe("serializePlan", () => {
    it("builds the documented envelope", () => {
        const doc = serializePlan(input(), "openleague-hosted", NOW);
        expect(doc.format).toBe(PLAN_FORMAT);
        expect(doc.version).toBe(PLAN_VERSION);
        expect(doc.exportedAt).toBe("2026-10-03T18:00:00.000Z");
        expect(doc.generator).toBe("openleague-hosted");
        expect(doc.session).toMatchObject({ title: "Tuesday Skills Practice", durationMinutes: 60, date: "2026-10-06", startTime: "19:00" });
    });

    it("sorts by sequence, renumbers from 0, and never flags the first drill", () => {
        const doc = serializePlan(
            input({
                drills: [
                    { sequence: 7, duration: 5, runsWithPrevious: false, instructions: null, name: "Late", description: null, playData: BOARD },
                    { sequence: 3, duration: 5, runsWithPrevious: true, instructions: null, name: "Early", description: null, playData: BOARD },
                ],
            }),
            "openleague-static",
            NOW,
        );
        expect(drillRows(doc.session.drills).map((d) => [d.sequence, d.drill.name, d.runsWithPrevious])).toEqual([
            [0, "Early", false],
            [1, "Late", false],
        ]);
    });

    it("fills a missing diagram with an empty board and nulls with empty strings", () => {
        const regroup = drillRows(serializePlan(input(), "openleague-hosted", NOW).session.drills)[2];
        expect(regroup.drill.playData).toEqual(createEmptyPlayData());
        expect(regroup.drill.description).toBe("");
        expect(regroup.instructions).toBe("");
    });

    it("carries no ids, thumbnails or other extra fields", () => {
        const base = input();
        const withIds = Object.assign({}, base.drills[0], { id: "row-1", playId: "cplayxxxxxxxxxxxxxxxxxxxx", thumbnail: "data:image/png;base64,AA==" });
        const doc = serializePlan(Object.assign({}, base, { drills: [withIds], teamId: "cteamxxxxxxxxxxxxxxxxxxxx" }), "openleague-hosted", NOW);
        expect(Object.keys(doc).sort()).toEqual(["exportedAt", "format", "generator", "session", "version"]);
        expect(Object.keys(doc.session).sort()).toEqual(["date", "drills", "durationMinutes", "goaliesAttending", "startTime", "title", "transitionMinutes"]);
        expect(Object.keys(doc.session.drills[0]).sort()).toEqual(["drill", "durationMinutes", "instructions", "kind", "rotateEveryMinutes", "runsWithPrevious", "sequence", "stays"]);
        expect(Object.keys(drillRows(doc.session.drills)[0].drill).sort()).toEqual(["description", "focus", "goalies", "name", "playData"]);
    });
});

describe("parsePlan", () => {
    it("round-trips: parse(serialize(x)) equals the normalized document", () => {
        const doc = serializePlan(input(), "openleague-hosted", NOW);
        const result = parsePlan(JSON.parse(JSON.stringify(doc)));
        expect(result).toEqual({ ok: true, plan: doc });
    });

    it("accepts a plan with no drills", () => {
        const result = parsePlan(rawDoc((doc) => { doc.session.drills = []; }));
        expect(result.ok && result.plan.session.drills).toEqual([]);
    });

    it("upgrades a v1 diagram", () => {
        const result = parsePlan(rawDoc((doc) => { doc.session.drills[0].drill.playData = V1_BOARD; }));
        if (!result.ok) throw new Error(JSON.stringify(result.error));
        const board = drillRows(result.plan.session.drills)[0].drill.playData;
        expect(board.version).toBe(2);
        expect(board.players[0].position.x).toBe(200);
        expect(board.drawings[0]).toMatchObject({ action: "skate", end: "arrow" });
    });

    it("strips unknown keys at every level", () => {
        const result = parsePlan(
            rawDoc((doc) => {
                doc.teamId = "cteamxxxxxxxxxxxxxxxxxxxx";
                doc.session.id = "csessionxxxxxxxxxxxxxxxxx";
                doc.session.venueId = "cvenuexxxxxxxxxxxxxxxxxxx";
                doc.session.drills[0].playId = "cplayxxxxxxxxxxxxxxxxxxxx";
                doc.session.drills[0].drill.thumbnail = "data:image/png;base64,AA==";
                doc.session.drills[0].drill.id = "cplayxxxxxxxxxxxxxxxxxxxx";
            }),
        );
        if (!result.ok) throw new Error(JSON.stringify(result.error));
        expect(result.plan).not.toHaveProperty("teamId");
        expect(result.plan.session).not.toHaveProperty("id");
        expect(result.plan.session).not.toHaveProperty("venueId");
        expect(result.plan.session.drills[0]).not.toHaveProperty("playId");
        expect(drillRows(result.plan.session.drills)[0].drill).not.toHaveProperty("thumbnail");
        expect(drillRows(result.plan.session.drills)[0].drill).not.toHaveProperty("id");
    });

    it("returns drills in sequence order", () => {
        const result = parsePlan(rawDoc((doc) => { doc.session.drills.reverse(); }));
        expect(result.ok && drillRows(result.plan.session.drills).map((d) => d.drill.name)).toEqual(["Warmup Laps", "Breakout", "Regroup"]);
    });

    it("reads a missing date, start time, instructions or description as empty", () => {
        const result = parsePlan(
            rawDoc((doc) => {
                delete doc.session.date;
                delete doc.session.startTime;
                delete doc.session.drills[0].instructions;
                delete doc.session.drills[0].drill.description;
            }),
        );
        if (!result.ok) throw new Error(JSON.stringify(result.error));
        expect([result.plan.session.date, result.plan.session.startTime]).toEqual([null, null]);
        expect([result.plan.session.drills[0].instructions, drillRows(result.plan.session.drills)[0].drill.description]).toEqual(["", ""]);
    });

    it.each([null, [], "plan", 42, {}, { format: "openleague.something-else", version: 1 }])("rejects %j as not a plan", (raw) => {
        expect(parsePlan(raw)).toEqual({ ok: false, error: { code: "not-a-plan", message: NOT_A_PLAN_MESSAGE } });
    });

    it("rejects a newer version before looking at anything else", () => {
        expect(parsePlan({ format: PLAN_FORMAT, version: 2 })).toEqual({
            ok: false,
            error: { code: "newer-version", message: NEWER_VERSION_MESSAGE },
        });
    });

    it("treats a non-integer version as invalid, not newer", () => {
        expect(issuesOf(rawDoc((doc) => { doc.version = "1"; })).length).toBeGreaterThan(0);
    });

    it("names the drill whose diagram can't be read", () => {
        const issues = issuesOf(rawDoc((doc) => { doc.session.drills[1].drill.playData = { version: 2, players: "nope" }; }));
        expect(issues).toContain('Drill 2 ("Breakout"): The diagram can\'t be read');
    });

    it.each([
        ["an empty title", (doc: RawDoc) => { doc.session.title = "   "; }, "Title is required"],
        ["a 101-character title", (doc: RawDoc) => { doc.session.title = "x".repeat(101); }, "Title must be at most 100 characters"],
        ["a 0-minute session", (doc: RawDoc) => { doc.session.durationMinutes = 0; }, "Session length must be at least 1 minute"],
        ["a 301-minute session", (doc: RawDoc) => { doc.session.durationMinutes = 301; }, "Session length must be at most 300 minutes"],
        ["a fractional drill length", (doc: RawDoc) => { doc.session.drills[0].durationMinutes = 1.5; }, 'Drill 1 ("Warmup Laps"): Drill length must be a whole number of minutes'],
        ["a 0-minute drill", (doc: RawDoc) => { doc.session.drills[0].durationMinutes = 0; }, 'Drill 1 ("Warmup Laps"): Drill length must be at least 1 minute'],
        ["2001-character instructions", (doc: RawDoc) => { doc.session.drills[0].instructions = "x".repeat(2001); }, 'Drill 1 ("Warmup Laps"): Instructions must be at most 2000 characters'],
        ["a 1001-character description", (doc: RawDoc) => { doc.session.drills[0].drill.description = "x".repeat(1001); }, 'Drill 1 ("Warmup Laps"): Description must be at most 1000 characters'],
        ["a blank drill name", (doc: RawDoc) => { doc.session.drills[0].drill.name = ""; }, "Drill 1: Drill name is required"],
        ["an impossible date", (doc: RawDoc) => { doc.session.date = "2026-02-30"; }, "Date must be a real calendar date (YYYY-MM-DD)"],
        ["a 24:00 start", (doc: RawDoc) => { doc.session.startTime = "24:00"; }, "Start time must be HH:mm (24-hour)"],
        ["a sequence gap", (doc: RawDoc) => { doc.session.drills[2].sequence = 5; }, "Drill sequences must run 0, 1, 2… with no gaps or repeats"],
        ["a flagged first drill", (doc: RawDoc) => { doc.session.drills[0].runsWithPrevious = true; }, FIRST_DRILL_STATION_ERROR],
        ["a timeline longer than the session", (doc: RawDoc) => { doc.session.durationMinutes = 20; }, "Practice timeline (25 min) exceeds session duration (20 min)"],
        ["a bad exportedAt", (doc: RawDoc) => { doc.exportedAt = "yesterday"; }, "exportedAt must be an ISO date-time"],
    ])("rejects %s", (_label, mutate, message) => {
        expect(issuesOf(rawDoc(mutate))).toContain(message);
    });

    it(`accepts a ${MAX_DRILL_DESCRIPTION_LENGTH}-character description (hosted plays allow 1000)`, () => {
        expect(parsePlan(rawDoc((doc) => { doc.session.drills[0].drill.description = "x".repeat(1000); })).ok).toBe(true);
    });

    it(`accepts ${MAX_PLAN_DRILLS} drills and rejects ${MAX_PLAN_DRILLS + 1}`, () => {
        const withDrills = (count: number) =>
            rawDoc((doc) => {
                doc.session.durationMinutes = 300;
                doc.session.drills = Array.from({ length: count }, (_, i) => drill(i));
            });
        expect(parsePlan(withDrills(MAX_PLAN_DRILLS)).ok).toBe(true);
        expect(issuesOf(withDrills(MAX_PLAN_DRILLS + 1))).toContain("A plan can hold at most 50 drills");
    });

    it("rejects a station block of five", () => {
        const issues = issuesOf(
            rawDoc((doc) => {
                doc.session.drills = Array.from({ length: 5 }, (_, i) => drill(i, { runsWithPrevious: i > 0 }));
            }),
        );
        expect(issues).toContain(STATION_GROUP_CAP_ERROR);
    });
});

describe("planFileName", () => {
    it.each([
        ["Tuesday Skills Practice", "tuesday-skills-practice.olplan.json"],
        ["  Équipe Été!!  ", "equipe-ete.olplan.json"],
        ["U12 / Power-Play #2", "u12-power-play-2.olplan.json"],
        ["🏒🏒", "practice-plan.olplan.json"],
        ["", "practice-plan.olplan.json"],
    ])("slugs %j", (title, expected) => {
        expect(planFileName(title)).toBe(expected);
    });

    it("caps the slug at 60 characters without a trailing hyphen", () => {
        const name = planFileName("ab ".repeat(40));
        const slug = name.replace(/\.olplan\.json$/, "");
        expect(slug.length).toBeLessThanOrEqual(60);
        expect(slug.endsWith("-")).toBe(false);
    });
});

describe("planToEditorSession", () => {
    it("maps drills to timeline plays that groupStations understands", () => {
        const session = planToEditorSession(serializePlan(input(), "openleague-hosted", NOW));
        expect(session).toMatchObject({ title: "Tuesday Skills Practice", duration: 60, date: "2026-10-06", startTime: "19:00" });
        const groups = groupStations(session.plays);
        expect(groups.map((g) => drillRows(g.stations).map((p) => p.name))).toEqual([["Warmup Laps"], ["Breakout", "Regroup"]]);
        expect(new Set(session.plays.map((p) => p.key)).size).toBe(3);
    });
});

describe("planByteLength", () => {
    it("is the UTF-8 byte length of the plan's JSON, which is what the import action is sent", () => {
        const doc = serializePlan(input({ title: "Été drills" }), "openleague-hosted", NOW);
        expect(planByteLength(doc)).toBe(new TextEncoder().encode(JSON.stringify(doc)).byteLength);
        expect(planByteLength(doc)).toBeGreaterThan(JSON.stringify(doc).length); // "É" and "é" are 2 bytes each
    });
});

describe("planExportFileName", () => {
    it.each([
        ["Tuesday Skills Practice", "html", "tuesday-skills-practice.html"],
        ["U12 / Power-Play #2", "docx", "u12-power-play-2.docx"],
        ["🏒🏒", "html", "practice-plan.html"],
        ["!!!", "docx", "practice-plan.docx"],
    ] as const)("names %j as .%s", (title, extension, expected) => {
        expect(planExportFileName(title, extension)).toBe(expected);
    });

    it("shares the plan file's slug", () => {
        const title = "  Équipe Été!!  ";
        expect(planSlug(title)).toBe("equipe-ete");
        expect(planFileName(title)).toBe(`${planSlug(title)}.olplan.json`);
    });
});

describe("goaltender fields (additive, version 1)", () => {
    function goalieInput(extra: Partial<PlanSessionInput> = {}): PlanSessionInput {
        return {
            title: "Goalie night",
            durationMinutes: 30,
            date: null,
            startTime: null,
            drills: [
                { sequence: 0, duration: 10, runsWithPrevious: false, instructions: null, name: "Warm-up", description: null, playData: null, focus: "goalies", goalies: "required" },
                { sequence: 1, duration: 10, runsWithPrevious: false, instructions: null, name: "Weave", description: null, playData: null },
            ],
            ...extra,
        };
    }

    it("serializes the tags (defaults when absent) and the count (null when unset)", () => {
        const doc = serializePlan(goalieInput({ goaliesAttending: 2 }), "openleague-static", NOW);
        expect(doc.session.goaliesAttending).toBe(2);
        expect(drillRows(doc.session.drills).map((d) => [d.drill.focus, d.drill.goalies])).toEqual([["goalies", "required"], ["team", "optional"]]);
        expect(serializePlan(goalieInput(), "openleague-static", NOW).session.goaliesAttending).toBeNull();
    });

    it("round-trips through parsePlan", () => {
        const doc = serializePlan(goalieInput({ goaliesAttending: 0 }), "openleague-hosted", NOW);
        expect(parsePlan(JSON.parse(JSON.stringify(doc)))).toEqual({ ok: true, plan: doc });
    });

    it("reads an older v1 file without the fields using the defaults", () => {
        const raw = JSON.parse(JSON.stringify(serializePlan(goalieInput({ goaliesAttending: 3 }), "openleague-static", NOW)));
        delete raw.session.goaliesAttending;
        for (const d of raw.session.drills) {
            delete d.drill.focus;
            delete d.drill.goalies;
        }
        const result = parsePlan(raw);
        expect(result.ok && result.plan.session.goaliesAttending).toBeNull();
        expect(result.ok && drillRows(result.plan.session.drills).map((d) => [d.drill.focus, d.drill.goalies])).toEqual([
            ["team", "optional"],
            ["team", "optional"],
        ]);
    });

    it("never rejects a plan for an unrecognized tag or count", () => {
        const raw = JSON.parse(JSON.stringify(serializePlan(goalieInput(), "openleague-static", NOW)));
        raw.session.goaliesAttending = 11;
        raw.session.drills[0].drill.focus = "both";
        raw.session.drills[0].drill.goalies = 3;
        const result = parsePlan(raw);
        expect(result.ok).toBe(true);
        expect(result.ok && [result.plan.session.goaliesAttending, drillRows(result.plan.session.drills)[0].drill.focus, drillRows(result.plan.session.drills)[0].drill.goalies])
            .toEqual([null, "team", "optional"]);
    });

    it("carries the fields into the editor mapping", () => {
        const editor = planToEditorSession(serializePlan(goalieInput({ goaliesAttending: 1 }), "openleague-static", NOW));
        expect(editor.goaliesAttending).toBe(1);
        expect(editor.plays[0]).toMatchObject({ focus: "goalies", goalies: "required" });
    });
});

describe("practice timing fields (additive, version 1)", () => {
    function timingInput(extra: Partial<PlanSessionInput> = {}): PlanSessionInput {
        return {
            title: "Timed practice",
            durationMinutes: 60,
            date: null,
            startTime: null,
            transitionMinutes: 2,
            drills: [
                { kind: "warmup", sequence: 0, duration: 8, instructions: "Laps", label: null, runsWithPrevious: false },
                { sequence: 1, duration: 5, runsWithPrevious: false, instructions: null, name: "Goalie", description: null, playData: null, stays: true, rotateEveryMinutes: 5 },
                { sequence: 2, duration: 5, runsWithPrevious: true, instructions: null, name: "Skate A", description: null, playData: null },
                { sequence: 3, duration: 5, runsWithPrevious: true, instructions: null, name: "Skate B", description: null, playData: null },
                { kind: "cooldown", sequence: 4, duration: 5, instructions: null, label: "Stretch", runsWithPrevious: false },
            ],
            ...extra,
        };
    }
    const raw = (extra: Partial<PlanSessionInput> = {}) => JSON.parse(JSON.stringify(serializePlan(timingInput(extra), "openleague-static", NOW)));

    it("writes block entries without drill fields, drill entries with their timing, and the gap", () => {
        const doc = serializePlan(timingInput(), "openleague-static", NOW);
        expect(doc.session.transitionMinutes).toBe(2);
        expect(doc.session.drills[0]).toEqual({ kind: "warmup", sequence: 0, durationMinutes: 8, instructions: "Laps", label: null });
        expect(doc.session.drills[4]).toEqual({ kind: "cooldown", sequence: 4, durationMinutes: 5, instructions: "", label: "Stretch" });
        // The rotation's minutes are written as the editor would: a stays station lasts the block.
        expect(doc.session.drills[1]).toMatchObject({ kind: "drill", stays: true, rotateEveryMinutes: 5, durationMinutes: 10 });
        expect(doc.session.drills[2]).toMatchObject({ kind: "drill", stays: false, rotateEveryMinutes: null, runsWithPrevious: true, durationMinutes: 5 });
    });

    it("round-trips through parsePlan", () => {
        const doc = serializePlan(timingInput(), "openleague-hosted", NOW);
        expect(parsePlan(JSON.parse(JSON.stringify(doc)))).toEqual({ ok: true, plan: doc });
    });

    it("reads a file written before practice timing as drills with no gap", () => {
        const old = JSON.parse(JSON.stringify(serializePlan(
            { title: "Old", durationMinutes: 30, date: null, startTime: null, drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: null, name: "A", description: null, playData: null }] },
            "openleague-static",
            NOW,
        )));
        delete old.session.transitionMinutes;
        for (const entry of old.session.drills) {
            delete entry.kind;
            delete entry.stays;
            delete entry.rotateEveryMinutes;
        }
        const result = parsePlan(old);
        expect(result.ok && result.plan.session.transitionMinutes).toBe(0);
        expect(result.ok && result.plan.session.drills[0]).toMatchObject({ kind: "drill", stays: false, rotateEveryMinutes: null });
    });

    it("rejects an unknown row kind with a readable issue, never reading it as a drill", () => {
        const file = raw();
        file.session.drills[0].kind = "stretch";
        const result = parsePlan(file);
        expect(result.ok).toBe(false);
        expect(!result.ok && result.error.issues?.[0]).toBe(`Drill 1: ${ROW_KIND_MESSAGE}`);
    });

    it("rejects the row rules the hosted save rejects", () => {
        const misplaced = raw();
        misplaced.session.drills[2].rotateEveryMinutes = 5;
        const result = parsePlan(misplaced);
        expect(!result.ok && result.error.issues).toContain(ROTATION_PLACEMENT_ERROR);
        const afterBlock = raw();
        afterBlock.session.drills[1].runsWithPrevious = true;
        const blocked = parsePlan(afterBlock);
        expect(!blocked.ok && blocked.error.issues).toContain(BLOCK_STATION_ERROR);
    });

    it("counts blocks and gaps toward the session length, and blocks toward the row limit", () => {
        // 8 + 2 + 10 + 2 + 5 = 27
        const tight = raw();
        tight.session.durationMinutes = 26;
        const result = parsePlan(tight);
        expect(!result.ok && result.error.issues).toContain("Practice timeline (27 min) exceeds session duration (26 min)");
        const many = serializePlan(
            { title: "Breaks", durationMinutes: 300, date: null, startTime: null, drills: Array.from({ length: 51 }, (_, sequence) => ({ kind: "break" as const, sequence, duration: 1, instructions: null, label: null, runsWithPrevious: false as const })) },
            "openleague-static",
            NOW,
        );
        const tooMany = parsePlan(JSON.parse(JSON.stringify(many)));
        expect(!tooMany.ok && tooMany.error.issues?.[0]).toMatch(/at most 50/);
    });

    it("reads the new fields leniently and strips drill fields from a block entry", () => {
        const file = raw();
        file.session.transitionMinutes = 9;
        file.session.drills[0].label = "x".repeat(80);
        file.session.drills[0].drill = { name: "Sneaky", description: "", playData: {} };
        file.session.drills[1].stays = "yes";
        const result = parsePlan(file);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.plan.session.transitionMinutes).toBe(0);
        expect(result.plan.session.drills[0]).not.toHaveProperty("drill");
        expect(result.plan.session.drills[0]).toMatchObject({ label: "x".repeat(60) });
        expect(result.plan.session.drills[1]).toMatchObject({ stays: false });
    });

    it("maps block rows and the gap into the import preview's session", () => {
        const editor = planToEditorSession(serializePlan(timingInput(), "openleague-static", NOW));
        expect(editor.transitionMinutes).toBe(2);
        expect(editor.plays[0]).toEqual({ key: "plan-row-0", kind: "warmup", sequence: 0, duration: 8, runsWithPrevious: false, instructions: "Laps", label: null });
        expect(editor.plays[1]).toMatchObject({ key: "plan-row-1", kind: "drill", stays: true, rotateEveryMinutes: 5, name: "Goalie" });
    });
});
