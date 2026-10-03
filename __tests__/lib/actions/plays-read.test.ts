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
    isTemplate: true, sessionId: null, teamId: TEAM, createdAt: new Date(), updatedAt: new Date(),
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

    it("does not return a session-owned copy", async () => {
        vi.mocked(prisma.play.findUnique).mockResolvedValue({
            ...row({ players: [], drawings: [], annotations: [] }), isTemplate: false, sessionId: "csessionxxxxxxxxxxxxxxxxx",
        } as never);
        const result = await getPlayById({ id: PLAY, teamId: TEAM });
        expect(result).toEqual({ success: false, error: "Play not found" });
        expect(vi.mocked(prisma.play.findUnique).mock.calls[0][0]).toMatchObject({ where: { id: PLAY, sessionId: null } });
    });
});
