import { describe, expect, it, vi } from "vitest";
import { FAVORITES_PAGE_SIZE, loadFavoritePlays } from "@/components/features/practice-planner/favorite-plays";

const play = (id: string) => ({ id, name: id, description: null, thumbnail: null, isTemplate: true, createdAt: new Date(), updatedAt: new Date() });

describe("loadFavoritePlays", () => {
    it("walks every page of the query and keeps only favorites, in order", async () => {
        const all = Array.from({ length: 230 }, (_, i) => play(`p${i}`));
        const getPlaysByTeam = vi.fn(async ({ page, limit }: { page: number; limit: number }) => ({
            success: true as const,
            data: { plays: all.slice((page - 1) * limit, page * limit), total: all.length, page, limit },
        }));
        const starred = new Set(["p3", "p150", "p229"]);
        const result = await loadFavoritePlays({ getPlaysByTeam } as never, { teamId: "t", isTemplate: true, dateFilter: "all", focus: "skaters" }, (id) => starred.has(id));
        expect(result).toEqual({ success: true, data: [all[3], all[150], all[229]] });
        expect(getPlaysByTeam).toHaveBeenCalledTimes(3);
        expect(getPlaysByTeam.mock.calls[2][0]).toEqual({ teamId: "t", isTemplate: true, dateFilter: "all", focus: "skaters", page: 3, limit: FAVORITES_PAGE_SIZE });
    });

    it("passes a failed page through", async () => {
        const getPlaysByTeam = vi.fn().mockResolvedValue({ success: false, error: "Failed to fetch plays. Please try again." });
        expect(await loadFavoritePlays({ getPlaysByTeam } as never, { teamId: "t", dateFilter: "all" }, () => true)).toEqual({
            success: false,
            error: "Failed to fetch plays. Please try again.",
        });
    });
});
