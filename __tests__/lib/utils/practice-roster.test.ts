import { describe, expect, it } from "vitest";
import {
    MAX_ROSTER_PLAYERS,
    ROSTER_LIMIT_MESSAGE,
    ROSTER_NAME_LENGTH_MESSAGE,
    ROSTER_NUMBER_MESSAGE,
    ROSTER_PLAYER_TWICE_MESSAGE,
    addCustomRosterRole,
    customRosterRoleError,
    defaultRosterRoles,
    emptyRoster,
    normalizeRosterRoles,
    parseRosterPaste,
    practiceRosterSchema,
    remapRosterPlayers,
    roleFromTeamPosition,
    rosterByRole,
    rosterCounts,
    rosterCountsLabel,
    rosterHasNames,
    rosterPlayerLabels,
    rosterWithoutNames,
    setRosterAgeGroup,
    toPracticeRoster,
    toggleRosterRole,
    type PracticeRoster,
    type RosterPlayer,
} from "@/lib/utils/practice-roster";

const player = (key: string, role: string, name = "", number = ""): RosterPlayer => ({ key, name, number, role });

function roster(partial: Partial<PracticeRoster> = {}): PracticeRoster {
    return { ageGroup: null, roles: ["S", "G"], players: [], ...partial };
}

describe("default positions (R3)", () => {
    it("uses Skater and Goalie for the youngest ages and when no age is set", () => {
        expect(defaultRosterRoles(null)).toEqual(["S", "G"]);
        expect(defaultRosterRoles("u6")).toEqual(["S", "G"]);
        expect(defaultRosterRoles("u8")).toEqual(["S", "G"]);
    });

    it("uses Forward, Defense and Goalie from 10U up", () => {
        for (const age of ["u10", "u12", "u14", "u16plus"] as const) {
            expect(defaultRosterRoles(age)).toEqual(["F", "D", "G"]);
        }
    });

    it("starts an empty roster with the age's default", () => {
        expect(emptyRoster("u12")).toEqual({ ageGroup: "u12", roles: ["F", "D", "G"], players: [] });
    });
});

describe("normalizeRosterRoles (R3)", () => {
    it("orders built-ins, then custom positions, then Goalie", () => {
        expect(normalizeRosterRoles(["G", "Wing", "D", "F"])).toEqual(["F", "D", "Wing", "G"]);
    });

    it("always keeps Goalie and at least one skater position", () => {
        expect(normalizeRosterRoles([])).toEqual(["S", "G"]);
        expect(normalizeRosterRoles(["G"])).toEqual(["S", "G"]);
        expect(normalizeRosterRoles(["D"])).toEqual(["D", "G"]);
    });

    it("drops repeats, blanks, over-long and clashing custom positions, and keeps at most 3", () => {
        expect(normalizeRosterRoles(["S", "s", "  ", "Goalie", "forward", "A very long position", "Wing", "wing", "Center", "Rover", "Extra", 7])).toEqual([
            "S",
            "Wing",
            "Center",
            "Rover",
            "G",
        ]);
    });

    it("cleans a custom position", () => {
        expect(normalizeRosterRoles(["  Left\u0000  wing "])).toEqual(["Left wing", "G"]);
    });
});

describe("custom positions", () => {
    it("explains why a position can't be added", () => {
        expect(customRosterRoleError("", ["S", "G"])).toMatch(/name/i);
        expect(customRosterRoleError("Goalie", ["S", "G"])).toMatch(/already/i);
        expect(customRosterRoleError("f", ["S", "G"])).toMatch(/already/i);
        expect(customRosterRoleError("Wing", ["S", "Wing", "G"])).toMatch(/already/i);
        expect(customRosterRoleError("A very long position", ["S", "G"])).toMatch(/12/);
        expect(customRosterRoleError("Rover", ["S", "A", "B", "C", "G"])).toMatch(/3/);
        expect(customRosterRoleError("Wing", ["S", "G"])).toBeNull();
    });

    it("adds a custom position before Goalie", () => {
        expect(addCustomRosterRole(roster(), " Wing ")).toEqual({ ok: true, roster: roster({ roles: ["S", "Wing", "G"] }) });
        expect(addCustomRosterRole(roster(), "goalie")).toMatchObject({ ok: false });
    });
});

describe("toggling and age changes", () => {
    it("moves a turned-off position's players to the first skater position still on", () => {
        const start = roster({ roles: ["F", "D", "G"], players: [player("a", "D"), player("b", "F"), player("c", "G")] });
        const next = toggleRosterRole(start, "D");
        expect(next.roles).toEqual(["F", "G"]);
        expect(next.players.map((p) => p.role)).toEqual(["F", "F", "G"]);
    });

    it("never turns off Goalie or the last skater position", () => {
        const start = roster({ roles: ["S", "G"] });
        expect(toggleRosterRole(start, "G")).toBe(start);
        expect(toggleRosterRole(start, "S")).toBe(start);
    });

    it("turns a position on in its place", () => {
        expect(toggleRosterRole(roster({ roles: ["F", "G"] }), "D").roles).toEqual(["F", "D", "G"]);
    });

    it("resets positions with the age only while they are the previous age's default", () => {
        const young = roster({ ageGroup: "u8", players: [player("a", "S"), player("b", "G")] });
        const older = setRosterAgeGroup(young, "u12");
        expect(older.roles).toEqual(["F", "D", "G"]);
        expect(older.players.map((p) => p.role)).toEqual(["F", "G"]);

        const customised = roster({ ageGroup: "u8", roles: ["S", "Wing", "G"] });
        expect(setRosterAgeGroup(customised, "u12").roles).toEqual(["S", "Wing", "G"]);
        expect(setRosterAgeGroup(customised, "u12").ageGroup).toBe("u12");
    });

    it("remaps unknown positions and matches custom positions ignoring case", () => {
        expect(remapRosterPlayers([player("a", "wing"), player("b", "X"), player("c", "G")], ["S", "Wing", "G"]).map((p) => p.role)).toEqual(["Wing", "S", "G"]);
    });
});

describe("counts and labels (R15)", () => {
    it("counts goalies and skaters, custom positions as skaters", () => {
        const r = roster({ roles: ["F", "D", "Wing", "G"], players: [player("a", "F"), player("b", "D"), player("c", "Wing"), player("d", "G")] });
        expect(rosterCounts(r)).toMatchObject({ skaters: 3, goalies: 1, total: 4 });
        expect(rosterCounts(r).byRole).toEqual([
            { role: "F", label: "Forward", count: 1 },
            { role: "D", label: "Defense", count: 1 },
            { role: "Wing", label: "Wing", count: 1 },
            { role: "G", label: "Goalie", count: 1 },
        ]);
    });

    it("labels the counts", () => {
        expect(rosterCountsLabel(roster())).toBe("No players yet");
        const sg = roster({ players: [...Array.from({ length: 7 }, (_, i) => player(`s${i}`, "S")), player("g", "G")] });
        expect(rosterCountsLabel(sg)).toBe("7 skaters · 1 goalie");
        expect(rosterCountsLabel(roster({ players: [player("a", "S")] }))).toBe("1 skater · 0 goalies");
        const fdg = roster({ roles: ["F", "D", "G"], players: [player("a", "F"), player("b", "F"), player("c", "D"), player("d", "G"), player("e", "G")] });
        expect(rosterCountsLabel(fdg)).toBe("2 forwards · 1 defense · 2 goalies");
        const custom = roster({ roles: ["S", "Wing", "G"], players: [player("a", "Wing")] });
        expect(rosterCountsLabel(custom)).toBe("0 skaters · 1 Wing · 0 goalies");
    });

    it("labels players by number and name, else by position and place", () => {
        const r = roster({ players: [player("a", "S", "Alex", "7"), player("b", "S"), player("c", "S", "", "12"), player("d", "G"), player("e", "S", "J.R.")] });
        expect(rosterPlayerLabels(r)).toEqual(["#7 Alex", "Skater 2", "#12", "Goalie 1", "J.R."]);
    });

    it("lists players by position for the bench sheet", () => {
        const r = roster({ players: [player("a", "S", "Alex", "7"), player("d", "G", "Pat")] });
        expect(rosterByRole(r)).toEqual([
            { role: "S", label: "Skater", players: ["#7 Alex"] },
            { role: "G", label: "Goalie", players: ["Pat"] },
        ]);
    });
});

describe("privacy helpers (R10)", () => {
    it("knows whether any name or number is set", () => {
        expect(rosterHasNames(roster({ players: [player("a", "S")] }))).toBe(false);
        expect(rosterHasNames(roster({ players: [player("a", "S", "", "4")] }))).toBe(true);
        expect(rosterHasNames(roster({ players: [player("a", "S", "Sam")] }))).toBe(true);
    });

    it("strips names, numbers and team links but keeps positions", () => {
        const r = roster({ players: [{ ...player("a", "G", "Pat", "30"), playerId: "p1" }] });
        expect(rosterWithoutNames(r).players).toEqual([{ key: "a", name: "", number: "", role: "G", playerId: null }]);
    });
});

describe("parseRosterPaste (R9)", () => {
    it("reads numbers, names and positions in common shapes", () => {
        const text = ["#7 Alex", "12 Sam G", "Jordan (D)", "", "Goalie: 30 Pat", "Riley - F", "J.R.; 44", "skater"].join("\n");
        const { players, overflow } = parseRosterPaste(text, ["F", "D", "G"], 0);
        expect(overflow).toBe(0);
        expect(players).toEqual([
            { name: "Alex", number: "7", role: "F" },
            { name: "Sam", number: "12", role: "G" },
            { name: "Jordan", number: "", role: "D" },
            { name: "Pat", number: "30", role: "G" },
            { name: "Riley", number: "", role: "F" },
            { name: "J.R.", number: "", role: "F" },
            { name: "", number: "44", role: "F" },
            { name: "", number: "", role: "F" },
        ]);
    });

    it("places a position that's off by the remap rule and reads custom positions", () => {
        expect(parseRosterPaste("Alex D\nSam Wing", ["S", "Wing", "G"], 0).players).toEqual([
            { name: "Alex", number: "", role: "S" },
            { name: "Sam", number: "", role: "Wing" },
        ]);
    });

    it("reads a multi-word custom position at the start or the end, ignoring case", () => {
        const roles = ["S", "Left Wing", "G"];
        expect(parseRosterPaste("Sam - Left Wing\nleft wing: 9 Alex\nLEFT WING Jo\n#4 Riley left   wing", roles, 0).players).toEqual([
            { name: "Sam", number: "", role: "Left Wing" },
            { name: "Alex", number: "9", role: "Left Wing" },
            { name: "Jo", number: "", role: "Left Wing" },
            { name: "Riley", number: "4", role: "Left Wing" },
        ]);
    });

    it("prefers the longest custom position over a one-word alias", () => {
        expect(parseRosterPaste("Sam Wing Back\nWing Back Alex\nPat Wing", ["S", "Wing", "Wing Back", "G"], 0).players).toEqual([
            { name: "Sam", number: "", role: "Wing Back" },
            { name: "Alex", number: "", role: "Wing Back" },
            { name: "Pat", number: "", role: "Wing" },
        ]);
    });

    it("stops at the limit and reports the rest", () => {
        const text = Array.from({ length: 5 }, (_, i) => `${i + 1}`).join("\n");
        const result = parseRosterPaste(text, ["S", "G"], MAX_ROSTER_PLAYERS - 2);
        expect(result.players).toHaveLength(2);
        expect(result.overflow).toBe(3);
    });

    it("cuts an over-long name to the limit", () => {
        const { players } = parseRosterPaste("x".repeat(60), ["S", "G"], 0);
        expect(players[0].name).toHaveLength(40);
    });
});

describe("roleFromTeamPosition (R8)", () => {
    it("maps common position text", () => {
        const fdg = ["F", "D", "G"];
        expect(roleFromTeamPosition("Goalie", fdg)).toBe("G");
        expect(roleFromTeamPosition("goaltender", fdg)).toBe("G");
        expect(roleFromTeamPosition("Defence", fdg)).toBe("D");
        expect(roleFromTeamPosition("Left Wing", fdg)).toBe("F");
        expect(roleFromTeamPosition("C", fdg)).toBe("F");
        expect(roleFromTeamPosition(null, fdg)).toBe("F");
        expect(roleFromTeamPosition("Defense", ["S", "G"])).toBe("S");
    });
});

describe("practiceRosterSchema (R7)", () => {
    const valid = { ageGroup: "u8", roles: ["S", "G"], players: [{ key: "k1", name: " Alex ", number: "7", role: "S" }] };

    it("accepts and cleans a roster", () => {
        const parsed = practiceRosterSchema.parse(valid);
        expect(parsed.players[0]).toEqual({ key: "k1", name: "Alex", number: "7", role: "S", playerId: null });
    });

    it("normalizes positions and remaps players", () => {
        const parsed = practiceRosterSchema.parse({ ...valid, roles: ["G"], players: [{ key: "k1", name: "", number: "", role: "F" }] });
        expect(parsed.roles).toEqual(["S", "G"]);
        expect(parsed.players[0].role).toBe("S");
    });

    it("refuses bad values with readable messages", () => {
        const issue = (input: unknown) => practiceRosterSchema.safeParse(input).error?.issues[0]?.message;
        expect(issue({ ...valid, players: [{ key: "k", name: "x".repeat(41), number: "", role: "S" }] })).toBe(ROSTER_NAME_LENGTH_MESSAGE);
        expect(issue({ ...valid, players: [{ key: "k", name: "", number: "1234", role: "S" }] })).toBe(ROSTER_NUMBER_MESSAGE);
        expect(issue({ ...valid, players: [{ key: "k", name: "", number: "7a", role: "S" }] })).toBe(ROSTER_NUMBER_MESSAGE);
        expect(issue({ ...valid, players: Array.from({ length: MAX_ROSTER_PLAYERS + 1 }, (_, i) => ({ key: `k${i}`, name: "", number: "", role: "S" })) })).toBe(ROSTER_LIMIT_MESSAGE);
        expect(
            issue({
                ...valid,
                players: [
                    { key: "a", name: "", number: "", role: "S", playerId: "p1" },
                    { key: "b", name: "", number: "", role: "S", playerId: "p1" },
                ],
            }),
        ).toBe(ROSTER_PLAYER_TWICE_MESSAGE);
        expect(practiceRosterSchema.safeParse({ ...valid, ageGroup: "u7" }).success).toBe(false);
    });
});

describe("practiceRosterSchema team links", () => {
    it("takes a linked player's name and number from the team, so a long team name never blocks a save", () => {
        const parsed = practiceRosterSchema.parse({
            ageGroup: null,
            roles: ["S", "G"],
            players: [
                { key: "a", name: "Alexandra ".repeat(10).trim(), number: "7", role: "S", playerId: "p1" },
                { key: "b", name: "Sam", number: "9", role: "S" },
            ],
        });
        expect(parsed.players).toEqual([
            { key: "a", name: "", number: "", role: "S", playerId: "p1" },
            { key: "b", name: "Sam", number: "9", role: "S", playerId: null },
        ]);
    });

    it("still checks an unlinked player's name", () => {
        const result = practiceRosterSchema.safeParse({ ageGroup: null, roles: ["S", "G"], players: [{ key: "a", name: "x".repeat(41), number: "", role: "S", playerId: null }] });
        expect(result.error?.issues[0]?.message).toBe(ROSTER_NAME_LENGTH_MESSAGE);
    });
});

describe("toPracticeRoster linked names", () => {
    it("keeps a linked player's whole team name and cuts only a typed one", () => {
        const long = "Alexandra ".repeat(10).trim();
        const read = toPracticeRoster({
            ageGroup: null,
            roles: ["S", "G"],
            players: [
                { key: "a", name: long, number: "7", role: "S", playerId: "p1" },
                { key: "b", name: long, number: "", role: "S" },
            ],
        });
        expect(read?.players.map((p) => p.name)).toEqual([long, long.slice(0, 40).trim()]);
        expect(practiceRosterSchema.safeParse(read).success).toBe(true);
    });
});

describe("toPracticeRoster (lenient reader)", () => {
    it("reads nothing as no roster and repairs stored values", () => {
        expect(toPracticeRoster(undefined)).toBeNull();
        expect(toPracticeRoster(null)).toBeNull();
        expect(toPracticeRoster("x")).toBeNull();
        expect(toPracticeRoster({ ageGroup: "u99", roles: ["G"], players: [{ id: "a", name: "Sam", number: "x", role: "Q" }, 5] })).toEqual({
            ageGroup: null,
            roles: ["S", "G"],
            players: [{ key: "a", name: "Sam", number: "", role: "S", playerId: null }],
        });
    });
});
