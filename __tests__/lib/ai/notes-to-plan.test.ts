import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
    NOTES_DRAFT_JSON_SCHEMA,
    NOTES_INPUT_PREFIX,
    NOTES_MAX_INPUT_CHARS,
    NOTES_MAX_OUTPUT_TOKENS,
    NOTES_SYSTEM_PROMPT,
    buildNotesRequest,
    parseNotesReply,
    requestSize,
    type NotesDraft,
} from "@/lib/ai/tasks/notes-to-plan";
import { schemaSubsetViolations, toProviderSchema } from "@/lib/ai/schema";
import { isEmptyDiagram, libraryMatches, withLibraryDiagrams } from "@/lib/ai/library-match";
import { parsePlan, serializePlan, type PlanSessionInput } from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";

const NOW = new Date("2026-10-07T12:00:00Z");
const id = (text: string) => text;

const row = (overrides: Partial<NotesDraft["rows"][number]> = {}): NotesDraft["rows"][number] => ({
    kind: "drill",
    name: "Two-line passing",
    minutes: 10,
    instructions: "Tape to tape",
    description: "Partners pass across the ice",
    focus: null,
    goalies: null,
    ageGroups: [],
    runsWithPrevious: false,
    staff: [],
    ...overrides,
});

const DRAFT: NotesDraft = {
    title: "Riverside 9U Tuesday",
    durationMinutes: 50,
    date: "2026-10-13",
    startTime: "17:30",
    staff: ["Coach 1", "Coach 2"],
    rows: [
        row({ kind: "warmup", name: "", minutes: 5, instructions: "Laps and edges", description: "", staff: ["Coach 1"] }),
        row({ ageGroups: ["u10"], focus: "skaters", goalies: "none", staff: ["Coach 2"] }),
        row({ name: "Net-front battles", minutes: 10, runsWithPrevious: true, goalies: "required", instructions: "Player 1 in net" }),
        row({ kind: "cooldown", name: "Stretch", minutes: 5, instructions: "", description: "" }),
    ],
};

/** What a plan file with the same content gives: the reference parsePlan result. */
function asFile(input: PlanSessionInput) {
    return parsePlan(JSON.parse(JSON.stringify(serializePlan(input, "openleague-static", NOW))));
}

describe("the draft schema sent to providers", () => {
    it("uses only the shared structured-output subset (spec R8)", () => {
        expect(schemaSubsetViolations(NOTES_DRAFT_JSON_SCHEMA)).toEqual([]);
        const text = JSON.stringify(NOTES_DRAFT_JSON_SCHEMA);
        expect(text).not.toMatch(/"\$schema"|"minimum"|"maximum"|"minLength"|"maxLength"|"\$ref"/);
    });

    it("sends nullable fields as anyOf with null", () => {
        const properties = (NOTES_DRAFT_JSON_SCHEMA.properties as Record<string, unknown>);
        expect(properties.date).toMatchObject({ anyOf: [{ type: "string" }, { type: "null" }] });
    });

    it("catches keywords outside the subset", () => {
        const loose = toProviderSchema(z.object({ a: z.string().min(2) }).partial());
        expect(schemaSubsetViolations(loose).join("\n")).toMatch(/minLength|must be required/);
        expect(schemaSubsetViolations({ type: "object", properties: {}, additionalProperties: true })).toEqual(["#: additionalProperties must be false"]);
    });
});

describe("buildNotesRequest", () => {
    it("redacts listed names, bounds the input and the output, and uses the task's prompt", () => {
        const { request, redaction } = buildNotesRequest({
            notes: "Alex runs warm-up. Jordan in net.",
            model: " my-model ",
            staffNames: ["Alex"],
            otherNames: ["Jordan"],
        });
        expect(request).toEqual({
            model: "my-model",
            system: NOTES_SYSTEM_PROMPT,
            input: `${NOTES_INPUT_PREFIX}Coach 1 runs warm-up. Player 1 in net.`,
            output: { name: "practice_plan_draft", schema: NOTES_DRAFT_JSON_SCHEMA },
            maxOutputTokens: NOTES_MAX_OUTPUT_TOKENS,
        });
        expect(redaction.restore("Coach 1 and Player 1")).toBe("Alex and Jordan");
        const long = buildNotesRequest({ notes: "x".repeat(NOTES_MAX_INPUT_CHARS + 50), model: "m", staffNames: [], otherNames: [] });
        expect(long.request.input).toHaveLength(NOTES_INPUT_PREFIX.length + NOTES_MAX_INPUT_CHARS);
    });

    it("estimates the size shown before sending", () => {
        const { request } = buildNotesRequest({ notes: "one two three", model: "m", staffNames: [], otherNames: [] });
        const size = requestSize(request);
        expect(size.maxWordsOut).toBe(3000);
        expect(size.wordsIn).toBeGreaterThan(3);
    });
});

describe("parseNotesReply", () => {
    it("turns a good draft into a plan that parsePlan accepts, with empty diagrams and restored names", () => {
        const restore = (text: string) => text.replace(/Coach 1/g, "Alex").replace(/Coach 2/g, "Sam").replace(/Player 1/g, "Jordan");
        const result = parseNotesReply(JSON.stringify(DRAFT), restore, NOW);
        if (!result.ok) throw new Error(result.issues.join("\n"));
        const { session } = result.plan;
        expect(result.plan.generator).toBe("openleague-static");
        expect(session.title).toBe("Riverside 9U Tuesday");
        expect(session.staff).toEqual(["Alex", "Sam"]);
        expect(session.drills.map((r) => r.sequence)).toEqual([0, 1, 2, 3]);
        expect(session.drills.map((r) => r.kind)).toEqual(["warmup", "drill", "drill", "cooldown"]);
        const [warmup, passing, battles, cooldown] = session.drills;
        expect(warmup.staff).toEqual(["Alex"]);
        expect(passing.kind === "drill" && passing.drill).toMatchObject({ name: "Two-line passing", focus: "skaters", goalies: "none", ageGroups: ["u10"] });
        expect(passing.staff).toEqual(["Sam"]);
        expect(battles.kind === "drill" && battles.instructions).toBe("Jordan in net");
        expect(battles.kind === "drill" && battles.runsWithPrevious).toBe(true);
        expect(cooldown.kind === "cooldown" && cooldown.label).toBe("Stretch");
        for (const entry of session.drills) if (entry.kind === "drill") expect(isEmptyDiagram(entry.drill.playData)).toBe(true);
        // Saved as a file and opened again, it is the same plan.
        expect(parsePlan(JSON.parse(JSON.stringify(result.plan)))).toEqual({ ok: true, plan: result.plan });
    });

    it("rejects a reply that isn't JSON, or doesn't match the draft schema, as bad output", () => {
        expect(parseNotesReply("Sure! Here is your plan:", id, NOW)).toMatchObject({ ok: false, code: "bad-output", issues: ["The reply isn't JSON."] });
        const unknownKind = parseNotesReply(JSON.stringify({ ...DRAFT, rows: [row({ kind: "scrimmage" as never })] }), id, NOW);
        expect(unknownKind).toMatchObject({ ok: false, code: "bad-output" });
        expect(!unknownKind.ok && unknownKind.issues.join("\n")).toMatch(/rows\.0\.kind/);
        expect(parseNotesReply(JSON.stringify({ ...DRAFT, rows: [row({ minutes: 7.5 })] }), id, NOW).ok).toBe(false);
        expect(parseNotesReply(JSON.stringify({ title: "x" }), id, NOW).ok).toBe(false);
    });

    /** Every invalid draft gets exactly the issues a plan file with that content gets. */
    function sameAsFile(draft: NotesDraft) {
        const result = parseNotesReply(JSON.stringify(draft), id, NOW);
        const file = asFile({
            title: draft.title,
            durationMinutes: draft.durationMinutes,
            date: draft.date,
            startTime: draft.startTime,
            staff: draft.staff,
            drills: draft.rows.map((r, sequence) =>
                r.kind === "drill"
                    ? { sequence, duration: r.minutes, runsWithPrevious: r.runsWithPrevious, instructions: r.instructions || null, name: r.name, description: r.description || null, ageGroups: r.ageGroups, staff: r.staff, playData: createEmptyPlayData() }
                    : { kind: r.kind, sequence, duration: r.minutes, runsWithPrevious: false as const, instructions: r.instructions || null, label: r.name || null, staff: r.staff },
            ),
        });
        expect(file.ok).toBe(false);
        expect(result.ok).toBe(false);
        expect(!result.ok && result.issues).toEqual(!file.ok && file.error.issues);
        return result;
    }

    it("rejects too many rows, exactly as a file would be", () => {
        const result = sameAsFile({ ...DRAFT, durationMinutes: 300, rows: Array.from({ length: 51 }, () => row({ minutes: 1 })) });
        expect(!result.ok && result.issues.join("\n")).toMatch(/at most 50 rows/);
    });

    it("rejects a timeline longer than the session, exactly as a file would be", () => {
        const result = sameAsFile({ ...DRAFT, durationMinutes: 15, rows: [row({ minutes: 10 }), row({ minutes: 10 })] });
        expect(!result.ok && result.issues.join("\n")).toMatch(/exceeds session duration/);
    });

    it("rejects an over-long drill name, exactly as a file would be", () => {
        const result = sameAsFile({ ...DRAFT, rows: [row({ name: "x".repeat(101) })] });
        expect(!result.ok && result.issues.join("\n")).toMatch(/Drill 1.*at most 100 characters/);
    });

    it("rejects zero minutes and a bad date, exactly as a file would be", () => {
        sameAsFile({ ...DRAFT, rows: [row({ minutes: 0 })] });
        sameAsFile({ ...DRAFT, date: "2026-02-30" });
    });

    it("can't produce sequence gaps: rows are numbered by order", () => {
        const result = parseNotesReply(JSON.stringify({ ...DRAFT, durationMinutes: 60, rows: [row(), row({ name: "B" }), row({ name: "C" })] }), id, NOW);
        expect(result.ok && result.plan.session.drills.map((r) => r.sequence)).toEqual([0, 1, 2]);
    });
});

describe("library-name matching", () => {
    const plan = (() => {
        const result = parseNotesReply(
            JSON.stringify({
                ...DRAFT,
                rows: [row({ name: STARTER_PLAYS[0].name.toUpperCase() }), row({ kind: "warmup", name: STARTER_PLAYS[1].name, description: "" }), row({ name: `${STARTER_PLAYS[2].name} variation` })],
            }),
            id,
            NOW,
        );
        if (!result.ok) throw new Error(result.issues.join("\n"));
        return result.plan;
    })();
    const library = STARTER_PLAYS.map((p) => ({ id: p.id, name: ` ${p.name} ` }));

    it("matches drafted drills by exact name ignoring case and spacing, never blocks or partial names", () => {
        expect(Array.from(libraryMatches(plan, library))).toEqual([[0, STARTER_PLAYS[0].id]]);
    });

    it("swaps in the matched diagrams only", () => {
        const swapped = withLibraryDiagrams(plan, new Map([[0, STARTER_PLAYS[0].playData]]));
        const first = swapped.session.drills[0];
        expect(first.kind === "drill" && first.drill.playData).toBe(STARTER_PLAYS[0].playData);
        const third = swapped.session.drills[2];
        expect(third.kind === "drill" && isEmptyDiagram(third.drill.playData)).toBe(true);
        expect(parsePlan(JSON.parse(JSON.stringify(swapped))).ok).toBe(true);
    });
});
