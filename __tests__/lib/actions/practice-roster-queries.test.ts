/** The roster's hosted reads (roster spec R6, R8): the team picker and the loaders. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
    mockPrisma: {
        player: { findMany: vi.fn() },
        teamMember: { findFirst: vi.fn() },
    },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUserId: vi.fn().mockResolvedValue("cuserxxxxxxxxxxxxxxxxxxxx") }));

import { getPracticeRosterOptions } from "@/lib/actions/practice-session-queries";
import { PRACTICE_ROSTER_SELECT, readPracticeRoster } from "@/lib/services/practice-session-roster";
import { practiceRosterSchema } from "@/lib/utils/practice-roster";

const TEAM_ID = "cteamxxxxxxxxxxxxxxxxxxxx";

describe("getPracticeRosterOptions (R8)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.teamMember.findFirst.mockResolvedValue({ id: "m" });
        mockPrisma.player.findMany.mockResolvedValue([
            { id: "p1", name: "Alex", jerseyNumber: 7, position: "Forward" },
            { id: "p2", name: "Pat", jerseyNumber: null, position: null },
        ]);
    });

    it("lists the team's players with the number as text and the position for the role guess", async () => {
        expect(await getPracticeRosterOptions(TEAM_ID)).toEqual([
            { playerId: "p1", name: "Alex", number: "7", position: "Forward" },
            { playerId: "p2", name: "Pat", number: "", position: null },
        ]);
    });

    it("selects only the name, jersey number and position: no contact, birth date, membership or guardian field", async () => {
        await getPracticeRosterOptions(TEAM_ID);
        const args = mockPrisma.player.findMany.mock.calls[0][0];
        expect(args.where).toEqual({ teamId: TEAM_ID });
        expect(Object.keys(args.select).sort()).toEqual(["id", "jerseyNumber", "name", "position"]);
        const text = JSON.stringify(args);
        for (const field of ["email", "phone", "emergency", "dateOfBirth", "usahMemberId", "guardians", "userId"]) expect(text).not.toContain(field);
    });

    it("gives a caller who isn't an admin of the team nothing, without reading players", async () => {
        mockPrisma.teamMember.findFirst.mockResolvedValue(null);
        expect(await getPracticeRosterOptions(TEAM_ID)).toEqual([]);
        expect(mockPrisma.player.findMany).not.toHaveBeenCalled();
    });

    it("gives a malformed team id nothing, before any query", async () => {
        expect(await getPracticeRosterOptions("t1")).toEqual([]);
        expect(mockPrisma.teamMember.findFirst).not.toHaveBeenCalled();
    });
});

describe("readPracticeRoster (R6)", () => {
    const row = (id: string, extra: Record<string, unknown>) => ({ id, name: null, number: null, role: "S", playerId: null, player: null, ...extra });

    it("reads no roster when the practice has no positions", () => {
        expect(readPracticeRoster({ teamId: TEAM_ID, rosterAgeGroup: null, rosterRoles: [], rosterPlayers: [] })).toBeNull();
    });

    it("reads a linked player's current name and number from the team, and drops one who left the team", () => {
        const roster = readPracticeRoster({
            teamId: TEAM_ID,
            rosterAgeGroup: "u10",
            rosterRoles: ["F", "D", "G"],
            rosterPlayers: [
                row("r1", { name: "Sam", number: "9", role: "D" }),
                row("r2", { role: "G", playerId: "p1", player: { name: "Pat", jerseyNumber: 30, teamId: TEAM_ID } }),
                row("r3", { role: "F", playerId: "p2", player: { name: "Moved", jerseyNumber: 4, teamId: "cotherteamxxxxxxxxxxxxxxx" } }),
            ],
        });
        expect(roster).toEqual({
            ageGroup: "u10",
            roles: ["F", "D", "G"],
            players: [
                { key: "r1", name: "Sam", number: "9", role: "D", playerId: null },
                { key: "r2", name: "Pat", number: "30", role: "G", playerId: "p1" },
            ],
        });
    });

    it("reads a long linked team name whole, and the roster it reads saves", () => {
        const long = "Alexandra ".repeat(10).trim();
        const roster = readPracticeRoster({
            teamId: TEAM_ID,
            rosterAgeGroup: null,
            rosterRoles: ["S", "G"],
            rosterPlayers: [row("r1", { playerId: "p1", player: { name: long, jerseyNumber: 7, teamId: TEAM_ID } })],
        });
        expect(roster?.players[0].name).toBe(long);
        expect(practiceRosterSchema.safeParse(roster).success).toBe(true);
    });

    it("selects nothing of Player but its name, jersey number and team", () => {
        expect(PRACTICE_ROSTER_SELECT.rosterPlayers.select.player).toEqual({ select: { name: true, jerseyNumber: true, teamId: true } });
    });
});
