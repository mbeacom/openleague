import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_ROW_STAFF, MAX_SESSION_STAFF, STAFF_NAME_MAX, type BlockKind, type SessionStaffMember } from "@/types/practice-planner";
import {
    ROW_STAFF_DUPLICATE_MESSAGE,
    ROW_STAFF_LIMIT_MESSAGE,
    ROW_STAFF_UNKNOWN_MESSAGE,
    STAFF_KEY_DUPLICATE_MESSAGE,
    STAFF_KEY_MESSAGE,
    STAFF_LIMIT_MESSAGE,
    STAFF_NAME_LENGTH_MESSAGE,
    STAFF_NAME_REQUIRED_MESSAGE,
    STAFF_NAME_TAKEN_MESSAGE,
    applySavedStaffIds,
    assignmentCount,
    carryRowStaff,
    cleanStaffName,
    hasStaffNameClash,
    isNamedStaff,
    namedStaffPayload,
    removeStaffPrompt,
    rowStaffError,
    runByLabel,
    runBySuffix,
    runByText,
    sessionStaffError,
    staffHeaderLabel,
    staffListError,
    staffNameKey,
    staffNames,
    toSessionStaffInputs,
    toStaffName,
    withoutStaffMember,
    yourStations,
    yourStationsText,
} from "@/lib/utils/session-staff";
import { blockTitle, isBlockRow } from "@/lib/utils/session-rows";
import type { TimelinePlay } from "@/lib/utils/session-timeline";

const member = (key: string, name: string) => ({ key, name });

describe("staff names", () => {
    it("cleans a name and compares names ignoring case", () => {
        expect(cleanStaffName("  Coach\u0007 Lee ")).toBe("Coach Lee");
        expect(staffNameKey(" Sam ")).toBe(staffNameKey("SAM"));
        expect(STAFF_NAME_MAX).toBe(60);
    });

    it("counts a person as named once their cleaned name has a character", () => {
        expect([isNamedStaff({ name: "Sam" }), isNamedStaff({ name: " \u0007 " }), isNamedStaff({ name: "" })]).toEqual([true, false, false]);
        expect(isNamedStaff({ name: "\u200B\u200C\u200D\u2060\uFEFF" })).toBe(false);
    });

    it("keeps a name on one line: whitespace runs become one space, C1 and zero-width characters go", () => {
        expect(cleanStaffName("Coach\tLee")).toBe("Coach Lee");
        expect(cleanStaffName(" Coach \r\n\n  Lee ")).toBe("Coach Lee");
        expect(cleanStaffName("Sa\u0085m\u009F")).toBe("Sam");
        // Removed before whitespace is collapsed: a zero-width character inside a word never becomes a space.
        expect(cleanStaffName("Sa\u200Bm Le\uFEFFe\u2060")).toBe("Sam Lee");
        expect(cleanStaffName("\u200C\u200D")).toBe("");
    });

    it("folds the names JavaScript and PostgreSQL lower differently, so both refuse the same pairs", () => {
        expect(staffNameKey("İlker")).toBe(staffNameKey("ilker"));
        expect(staffNameKey("İLKER")).toBe("ilker");
        expect(staffNameKey("ΟΔΟΣ")).toBe(staffNameKey("οδοσ"));
        expect(staffNameKey("Οδός")).toBe("οδόσ");
        expect(staffListError([member("k1", "İlker"), member("k2", "ilker")])).toBe(STAFF_NAME_TAKEN_MESSAGE);
        expect(staffListError([member("k1", "ΟΔΟΣ"), member("k2", "οδοσ")])).toBe(STAFF_NAME_TAKEN_MESSAGE);
        expect(staffListError([member("k1", "Coach\tLee"), member("k2", "coach  lee")])).toBe(STAFF_NAME_TAKEN_MESSAGE);
    });

    it("compares staff names only through staffNameKey (no other toLowerCase in the name modules)", () => {
        const sources = {
            "lib/utils/session-staff.ts": readFileSync(join(process.cwd(), "lib/utils/session-staff.ts"), "utf8"),
            "lib/plan-document/document.ts": readFileSync(join(process.cwd(), "lib/plan-document/document.ts"), "utf8"),
        };
        // staffNameKey itself, and planSlug (a file name, not a staff name).
        expect(sources["lib/utils/session-staff.ts"].match(/toLowerCase\(/g)).toHaveLength(1);
        expect(sources["lib/plan-document/document.ts"].match(/toLowerCase\(/g)).toHaveLength(1);
        expect(sources["lib/plan-document/document.ts"]).toMatch(/\.toLowerCase\(\)\s*\.replace\(\/\[\^a-z0-9\]\+\/g, "-"\)/);
    });

    it("offers a long official's name cut to 60, never half an emoji", () => {
        expect(toStaffName("x".repeat(70))).toHaveLength(60);
        expect(toStaffName(`${"x".repeat(59)}😀`)).toBe("x".repeat(59));
        expect(toStaffName("  Pat\u0000  ")).toBe("Pat");
    });
});

describe("staffListError and rowStaffError (spec R2, R3)", () => {
    it("accepts up to 12 people with distinct names and keys", () => {
        expect(staffListError(Array.from({ length: MAX_SESSION_STAFF }, (_, i) => member(`k${i}`, `Coach ${i}`)))).toBeNull();
    });

    it("refuses each broken rule with its message", () => {
        expect(staffListError(Array.from({ length: MAX_SESSION_STAFF + 1 }, (_, i) => member(`k${i}`, `Coach ${i}`)))).toBe(STAFF_LIMIT_MESSAGE);
        expect(staffListError([member("", "Sam")])).toBe(STAFF_KEY_MESSAGE);
        expect(staffListError([member("k".repeat(65), "Sam")])).toBe(STAFF_KEY_MESSAGE);
        expect(staffListError([member("k1", " \u0007 ")])).toBe(STAFF_NAME_REQUIRED_MESSAGE);
        expect(staffListError([member("k1", "x".repeat(61))])).toBe(STAFF_NAME_LENGTH_MESSAGE);
        expect(staffListError([member("k1", "Sam"), member("k1", "Lee")])).toBe(STAFF_KEY_DUPLICATE_MESSAGE);
        expect(staffListError([member("k1", "Sam"), member("k2", " sAM ")])).toBe(STAFF_NAME_TAKEN_MESSAGE);
    });

    it("limits a row to 4 known, distinct people", () => {
        const known = new Set(["a", "b", "c", "d", "e"]);
        expect(rowStaffError(["a", "b", "c", "d"], known)).toBeNull();
        expect(rowStaffError(["a", "b", "c", "d", "e"], known)).toBe(ROW_STAFF_LIMIT_MESSAGE);
        expect(MAX_ROW_STAFF).toBe(4);
        expect(rowStaffError(["a", "a"], known)).toBe(ROW_STAFF_DUPLICATE_MESSAGE);
        expect(rowStaffError(["z"], known)).toBe(ROW_STAFF_UNKNOWN_MESSAGE);
    });

    it("checks the list, then each row; a row without staff has nobody", () => {
        const staff = [member("k1", "Sam")];
        expect(sessionStaffError(staff, [{ staff: ["k1"] }, {}])).toBeNull();
        expect(sessionStaffError(staff, [{}, { staff: ["k2"] }])).toBe(ROW_STAFF_UNKNOWN_MESSAGE);
        expect(sessionStaffError([...staff, member("k2", "sam")], [{ staff: ["k9"] }])).toBe(STAFF_NAME_TAKEN_MESSAGE);
    });
});

describe("names and labels (spec R9, R11)", () => {
    const staff: SessionStaffMember[] = [{ id: "s1", name: "Coach Lee" }, { id: "s2", name: "Sam" }];

    it("reads a row's names from the list by key, in the row's order, skipping unknown keys", () => {
        expect(staffNames(["s2", "gone", "s1"], staff)).toEqual(["Sam", "Coach Lee"]);
        expect(staffNames(undefined, staff)).toEqual([]);
        expect(staffNames(["s1"], undefined)).toEqual([]);
    });

    it("labels the run-by text, suffix, sidebar line and bench sheet header", () => {
        expect(runByText(["Coach Lee", "Sam"])).toBe("run by Coach Lee, Sam");
        expect(runBySuffix(["Coach Lee", "Sam"])).toBe(" · run by Coach Lee, Sam");
        expect(runByLabel(["Coach Lee"])).toBe("Run by Coach Lee");
        expect([runByText([]), runBySuffix([]), runByLabel([])]).toEqual([null, "", null]);
        expect(staffHeaderLabel([...staff, { name: "Alex" }])).toBe("Staff: Coach Lee, Sam, Alex");
        expect([staffHeaderLabel([]), staffHeaderLabel(undefined)]).toEqual([null, null]);
    });

    it("skips unnamed people in a row's names and in the header", () => {
        const withBlank: SessionStaffMember[] = [...staff, { id: "s3", name: "" }, { id: "s4", name: " \t " }];
        expect(staffNames(["s3", "s1", "s4"], withBlank)).toEqual(["Coach Lee"]);
        expect(staffHeaderLabel(withBlank)).toBe("Staff: Coach Lee, Sam");
        expect(staffHeaderLabel([{ name: "" }, { name: "  " }])).toBeNull();
    });

    it("asks before removing someone who runs rows, with the right count", () => {
        expect(removeStaffPrompt("Sam", 2)).toBe("Remove Sam? They run 2 rows.");
        expect(removeStaffPrompt("Sam", 1)).toBe("Remove Sam? They run 1 row.");
    });
});

describe("editor list edits (Review Focus 4, 5)", () => {
    const rows = [{ id: "r1", staff: ["s1", "s2"] }, { id: "r2", staff: ["s2"] }, { id: "r3" }];

    it("counts a person's rows and removes their key from every row, keeping untouched rows", () => {
        expect(assignmentCount(rows, "s2")).toBe(2);
        expect(assignmentCount(rows, "s9")).toBe(0);
        const next = withoutStaffMember(rows, "s1");
        expect(next.map((row) => row.staff)).toEqual([["s2"], ["s2"], undefined]);
        expect(next[1]).toBe(rows[1]);
        expect(next[2]).toBe(rows[2]);
    });

    it("sends only named people, and no row keeps the key of someone unnamed", () => {
        const staff: SessionStaffMember[] = [{ id: "s1", name: "Sam" }, { id: "s2", name: "  " }];
        const payload = namedStaffPayload(staff, rows);
        expect(payload.staff).toEqual([{ id: "s1", name: "Sam" }]);
        expect(payload.rows.map((row) => row.staff)).toEqual([["s1"], [], undefined]);
        expect(payload.rows[2]).toBe(rows[2]);
        const all = namedStaffPayload([{ id: "s1", name: "Sam" }], rows);
        expect(all.rows).toEqual(rows);
    });

    it("pauses staff while two names clash: no list, and no row carries staff (absent = unchanged)", () => {
        const staff: SessionStaffMember[] = [{ id: "s1", name: "Sam" }, { id: "s2", name: "İlker" }, { id: "s3", name: " sam " }];
        const clashRows = [{ id: "r1", staff: ["s3", "s1"] }, { id: "r2" }];
        const payload = namedStaffPayload(staff, clashRows);
        expect(payload).not.toHaveProperty("staff");
        expect(payload.rows).toEqual([{ id: "r1" }, { id: "r2" }]);
        expect(payload.rows[1]).toBe(clashRows[1]);
        expect(hasStaffNameClash(staff)).toBe(true);
        expect(hasStaffNameClash([{ name: "İlker" }, { name: "ilker" }])).toBe(true);
        expect(hasStaffNameClash([{ name: "Sam" }, { name: "" }, { name: " " }])).toBe(false);
    });

    it("turns the list into save inputs, links only when set", () => {
        expect(toSessionStaffInputs([
            { id: "s1", name: "Coach Lee", teamOfficialId: "coff", userId: null },
            { id: "s2", name: "Pat", userId: "cuser" },
            { id: "s3", name: "Sam" },
        ])).toEqual([
            { key: "s1", name: "Coach Lee", teamOfficialId: "coff" },
            { key: "s2", name: "Pat", userId: "cuser" },
            { key: "s3", name: "Sam" },
        ]);
    });
});

describe("applySavedStaffIds: a hosted save's keys become stored ids (spec R3, parity with applySavedPlayIds)", () => {
    const staff: SessionStaffMember[] = [
        { id: "cstored1", name: "Coach Lee", teamOfficialId: "coff" },
        { id: "staff-new-1", name: "Sam" },
    ];
    const rows = [{ id: "r1", staff: ["staff-new-1", "cstored1"] }, { id: "r2", staff: ["cstored1"] }, { id: "r3" }];

    it("swaps a new person's key for their id on the list and on every row, keeping everything else", () => {
        const next = applySavedStaffIds(staff, rows, [{ key: "cstored1", id: "cstored1" }, { key: "staff-new-1", id: "cnew1" }]);
        expect(next.staff).toEqual([staff[0], { id: "cnew1", name: "Sam" }]);
        expect(next.staff[0]).toBe(staff[0]);
        expect(next.rows.map((row) => row.staff)).toEqual([["cnew1", "cstored1"], ["cstored1"], undefined]);
        expect(next.rows[1]).toBe(rows[1]);
        expect(next.rows[2]).toBe(rows[2]);
    });

    it("skips a key the editor no longer holds (removed while the save was in flight)", () => {
        const held = [staff[0]];
        const heldRows = withoutStaffMember(rows, "staff-new-1");
        const next = applySavedStaffIds(held, heldRows, [{ key: "staff-new-1", id: "cnew1" }]);
        expect(next.staff).toBe(held);
        expect(next.rows).toBe(heldRows);
    });

    it("maps each key once, never through a chain, and the last entry for a key wins", () => {
        const chained: SessionStaffMember[] = [{ id: "ka", name: "A" }, { id: "kb", name: "B" }];
        const next = applySavedStaffIds(chained, [{ id: "r1", staff: ["ka", "kb"] }], [{ key: "ka", id: "kb" }, { key: "kb", id: "kc" }]);
        expect(next.staff.map((entry) => entry.id)).toEqual(["kb", "kc"]);
        expect(next.rows[0].staff).toEqual(["kb", "kc"]);
        const twice = applySavedStaffIds([{ id: "ka", name: "A" }], [], [{ key: "ka", id: "c1" }, { key: "ka", id: "c2" }]);
        expect(twice.staff[0].id).toBe("c2");
    });

    it("returns the same arrays when nothing changes: no mapping, or only stored ids", () => {
        for (const saved of [undefined, [], [{ key: "cstored1", id: "cstored1" }]]) {
            const next = applySavedStaffIds(staff, rows, saved);
            expect(next.staff).toBe(staff);
            expect(next.rows).toBe(rows);
        }
    });

    it("can swap the list and the rows on their own: remove takes a key off both at once, so each sees the same keys", () => {
        const saved = [{ key: "staff-new-1", id: "cnew1" }];
        const both = applySavedStaffIds(staff, rows, saved);
        expect(applySavedStaffIds(staff, [], saved).staff).toEqual(both.staff);
        expect(applySavedStaffIds([], rows, saved).rows).toEqual(both.rows);
    });
});

describe("carryRowStaff: absent staff across a row rewrite (spec R3, Global Constraints)", () => {
    const stored = [
        { playId: null, kind: "warmup" as const, sequence: 0, staffIds: ["s2"] },
        { playId: "cplaya", kind: "drill" as const, sequence: 1, staffIds: ["s1", "s3"] },
        { playId: null, kind: "break" as const, sequence: 3, staffIds: ["s3"] },
    ];
    /** Every stored block row in sequence order, staffed or not: the break at 2 ran nobody. */
    const blocks = [
        { sequence: 0, kind: "warmup" as const },
        { sequence: 2, kind: "break" as const },
        { sequence: 3, kind: "break" as const },
    ];

    it("carries a drill by its owned play, and each block to the same place when the block kinds are identical, drills added around them", () => {
        expect(carryRowStaff(stored, blocks, [
            { kind: "warmup", playId: null, sequence: 0 },
            { kind: "drill", playId: "cplaya", sequence: 1 },
            { kind: "drill", playId: "cplayb", sequence: 2 },
            { kind: "break", playId: null, sequence: 3 },
            { kind: "break", playId: null, sequence: 4 },
        ])).toEqual([
            { sequence: 0, staffIds: ["s2"] },
            { sequence: 1, staffIds: ["s1", "s3"] },
            { sequence: 4, staffIds: ["s3"] },
        ]);
    });

    it("drops every block's staff when the blocks are reordered, and still follows the drill", () => {
        expect(carryRowStaff(stored, blocks, [
            { kind: "break", playId: null, sequence: 0 },
            { kind: "warmup", playId: null, sequence: 1 },
            { kind: "drill", playId: "cplaya", sequence: 2 },
            { kind: "break", playId: null, sequence: 3 },
        ])).toEqual([{ sequence: 2, staffIds: ["s1", "s3"] }]);
    });

    it("drops every block's staff when a block is inserted, even one of a kind already there", () => {
        expect(carryRowStaff(stored, blocks, [
            { kind: "warmup", playId: null, sequence: 0 },
            { kind: "break", playId: null, sequence: 1 },
            { kind: "drill", playId: "cplaya", sequence: 2 },
            { kind: "break", playId: null, sequence: 3 },
            { kind: "break", playId: null, sequence: 4 },
        ])).toEqual([{ sequence: 2, staffIds: ["s1", "s3"] }]);
    });

    it("drops rather than moves when a block of the same kind is deleted (Sam never lands on Lee's break)", () => {
        const breaks = [
            { playId: null, kind: "break" as const, sequence: 0, staffIds: ["sam"] },
            { playId: null, kind: "break" as const, sequence: 1, staffIds: ["lee"] },
        ];
        const storedBreaks = [{ sequence: 0, kind: "break" as const }, { sequence: 1, kind: "break" as const }];
        // An older editor deleted the first break; the second is now the only one.
        expect(carryRowStaff(breaks, storedBreaks, [{ kind: "break", playId: null, sequence: 0 }])).toEqual([]);
    });

    it("follows a drill removed or moved between unchanged blocks, and keeps the blocks' staff", () => {
        const drills = [
            { playId: null, kind: "warmup" as const, sequence: 0, staffIds: ["s1"] },
            { playId: "cplaya", kind: "drill" as const, sequence: 1, staffIds: ["s2"] },
            { playId: "cplayb", kind: "drill" as const, sequence: 2, staffIds: ["s3"] },
            { playId: null, kind: "break" as const, sequence: 3, staffIds: ["s4"] },
        ];
        const layout = [{ sequence: 0, kind: "warmup" as const }, { sequence: 3, kind: "break" as const }];
        // Drill A removed; drill B moved after the break.
        expect(carryRowStaff(drills, layout, [
            { kind: "warmup", playId: null, sequence: 0 },
            { kind: "break", playId: null, sequence: 1 },
            { kind: "drill", playId: "cplayb", sequence: 2 },
        ])).toEqual([
            { sequence: 0, staffIds: ["s1"] },
            { sequence: 1, staffIds: ["s4"] },
            { sequence: 2, staffIds: ["s3"] },
        ]);
    });

    it("gives every new row of a repeated play id the first stored row's staff (first match wins)", () => {
        const repeated = [
            { playId: "cplaya", kind: "drill" as const, sequence: 0, staffIds: ["s1"] },
            { playId: "cplaya", kind: "drill" as const, sequence: 1, staffIds: ["s2"] },
        ];
        expect(carryRowStaff(repeated, [], [
            { kind: "drill", playId: "cplaya", sequence: 0 },
            { kind: "drill", playId: "cplaya", sequence: 1 },
        ])).toEqual([
            { sequence: 0, staffIds: ["s1"] },
            { sequence: 1, staffIds: ["s1"] },
        ]);
    });

    it("carries nothing for a stored drill row without a play id, nor onto a new drill without one", () => {
        const orphan = [{ playId: null, kind: "drill" as const, sequence: 0, staffIds: ["s1"] }];
        expect(carryRowStaff(orphan, [], [{ kind: "drill", playId: null, sequence: 0 }])).toEqual([]);
        expect(carryRowStaff(orphan, [], [{ kind: "drill", playId: "cplaya", sequence: 0 }])).toEqual([]);
    });

    it("carries nothing when nothing was assigned", () => {
        expect(carryRowStaff([], [], [{ kind: "drill", playId: "cplaya", sequence: 0 }])).toEqual([]);
    });
});

describe("yourStations (spec R10)", () => {
    // A union, so isBlockRow narrows: a block row has a kind and a label, a drill row a name.
    type DrillRow = TimelinePlay & { id: string; kind?: "drill"; name: string; staff?: string[] };
    type BlockRow = TimelinePlay & { id: string; kind: BlockKind; label: string | null; staff?: string[] };
    type Row = DrillRow | BlockRow;
    // 6:00 PM EDT on Tuesday, October 6, 2026.
    const START = new Date("2026-10-06T22:00:00.000Z");
    const rows: Row[] = [
        { id: "w", kind: "warmup", label: null, sequence: 0, duration: 8, runsWithPrevious: false, staff: ["s1"] },
        { id: "a", name: "Breakout", sequence: 1, duration: 10, runsWithPrevious: false, staff: ["s2"] },
        { id: "b", name: "Pass & Shoot", sequence: 2, duration: 10, runsWithPrevious: true, staff: ["s1", "s2"] },
        { id: "x", kind: "break", label: "Water", sequence: 3, duration: 2, runsWithPrevious: false, staff: [] },
        { id: "c", name: "Scrimmage", sequence: 4, duration: 5, runsWithPrevious: false, staff: ["s1"] },
    ];
    const title = (row: Row) => (isBlockRow(row) ? blockTitle(row.kind, row.label) : row.name);

    it("lists the rows a person runs in schedule order, each station at its block's start, with the gap", () => {
        // Blocks start at 0, 10 (8 + gap 2), 22 and 26 minutes.
        const stations = yourStations(rows, { start: START, transitionMinutes: 2, staffIds: new Set(["s1"]), title });
        expect(stations.map((station) => [station.title, (station.startsAt.getTime() - START.getTime()) / 60_000])).toEqual([
            ["Warm-up", 0], ["Pass & Shoot", 10], ["Scrimmage", 26],
        ]);
        expect(yourStationsText(stations, "America/New_York")).toBe("Warm-up (6:00 PM), Pass & Shoot (6:10 PM), Scrimmage (6:26 PM)");
    });

    it("orders rows by sequence itself: rows in any order give the same stations", () => {
        const shuffled = [rows[3], rows[0], rows[4], rows[2], rows[1]];
        const options = { start: START, transitionMinutes: 2, staffIds: new Set(["s1"]), title };
        expect(yourStations(shuffled, options)).toEqual(yourStations(rows, options));
    });

    it("joins several staff ids for one person, and has no text for someone who runs nothing", () => {
        const both = yourStations(rows, { start: START, transitionMinutes: 0, staffIds: new Set(["s2", "s9"]), title });
        expect(both.map((station) => station.title)).toEqual(["Breakout", "Pass & Shoot"]);
        expect(yourStationsText([], "America/New_York")).toBeNull();
        expect(yourStations(rows, { start: START, transitionMinutes: 0, staffIds: new Set(["s9"]), title })).toEqual([]);
    });
});
