/** Dashboard upcoming schedule (practice timing, spec R11): a practice's play count is its drill rows. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
    mockPrisma: {
        teamMember: { findMany: vi.fn() },
        leagueUser: { findMany: vi.fn() },
        event: { findMany: vi.fn() },
        practiceSession: { findMany: vi.fn() },
    },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import { getUpcomingSchedule } from "@/lib/data/dashboard";

describe("getUpcomingSchedule: practice play counts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.teamMember.findMany.mockResolvedValue([{ role: "ADMIN", team: { id: "t1", name: "Lions" } }]);
        mockPrisma.leagueUser.findMany.mockResolvedValue([]);
        mockPrisma.event.findMany.mockResolvedValue([]);
        mockPrisma.practiceSession.findMany.mockResolvedValue([
            { id: "s1", title: "Skills", date: new Date("2026-10-06T23:00:00.000Z"), duration: 60, teamId: "t1", team: { name: "Lions" }, _count: { plays: 2 } },
        ]);
    });

    it("counts drill rows only, so a warm-up or a break is not a play", async () => {
        const items = await getUpcomingSchedule("u1");
        expect(mockPrisma.practiceSession.findMany.mock.calls[0][0].select._count).toEqual({ select: { plays: { where: { kind: "drill" } } } });
        expect(items).toEqual([expect.objectContaining({ kind: "practice", id: "s1", playCount: 2 })]);
    });
});
