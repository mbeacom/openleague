/** The teams a plan may be imported into: the ones where the scheduler check (team ADMIN) passes. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({ mockPrisma: { teamMember: { findMany: vi.fn() } } }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUserId: vi.fn().mockResolvedValue("cuserxxxxxxxxxxxxxxxxxxxx") }));

import { getPlanImportTeams } from "@/lib/actions/practice-session-queries";

describe("getPlanImportTeams", () => {
    beforeEach(() => vi.clearAllMocks());

    it("lists the user's ADMIN teams by name", async () => {
        mockPrisma.teamMember.findMany.mockResolvedValue([
            { team: { id: "cbearsxxxxxxxxxxxxxxxxxxx", name: "Bears" } },
            { team: { id: "clionsxxxxxxxxxxxxxxxxxxx", name: "Lions" } },
        ]);
        expect(await getPlanImportTeams()).toEqual([
            { id: "cbearsxxxxxxxxxxxxxxxxxxx", name: "Bears" },
            { id: "clionsxxxxxxxxxxxxxxxxxxx", name: "Lions" },
        ]);
        expect(mockPrisma.teamMember.findMany).toHaveBeenCalledWith({
            where: { userId: "cuserxxxxxxxxxxxxxxxxxxxx", role: "ADMIN" },
            select: { team: { select: { id: true, name: true } } },
            orderBy: { team: { name: "asc" } },
        });
    });
});
