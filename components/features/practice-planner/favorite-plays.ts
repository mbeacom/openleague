/**
 * The library's Favorites filter (practice favorites spec R7). The library is
 * paginated by the store, so filtering one page would miss favorites on the
 * others: this walks every page of the current query, as loadLibraryNames
 * does, and keeps the starred drills in the store's order. The caller
 * paginates the result itself, so totals and pages stay exact.
 */
import type { ActionResult, LibraryPlaySummary, LibraryQuery, PlannerStore } from "@/lib/planner-store";

/** The most rows one library query may ask for (getPlaysByTeamSchema). */
export const FAVORITES_PAGE_SIZE = 100;

export async function loadFavoritePlays(
    store: Pick<PlannerStore, "getPlaysByTeam">,
    query: Omit<LibraryQuery, "page" | "limit">,
    isFavorite: (id: string) => boolean,
): Promise<ActionResult<LibraryPlaySummary[]>> {
    const kept: LibraryPlaySummary[] = [];
    let pages = 1;
    for (let page = 1; page <= pages; page++) {
        const result = await store.getPlaysByTeam({ ...query, page, limit: FAVORITES_PAGE_SIZE });
        if (!result.success) return result;
        for (const play of result.data.plays) if (isFavorite(play.id)) kept.push(play);
        // Bounded by the first answer's total, so the loop always ends.
        if (page === 1) pages = Math.ceil(result.data.total / FAVORITES_PAGE_SIZE);
    }
    return { success: true, data: kept };
}
