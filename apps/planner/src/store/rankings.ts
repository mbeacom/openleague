/**
 * Rankings storage (static rankings spec): one device-level openleague.rankings
 * document in the meta store. Validated on write, file cap included; a record that fails parsing
 * on read is reported (the screen offers "Start over"), never thrown.
 */
import type { ActionResult } from "@/lib/planner-store";
import { RANKINGS_TOO_LARGE_TO_SAVE_MESSAGE, fitsRankingsFile, parseRankings, type RankingsDocument } from "@/lib/rankings-document";
import { META_RANKINGS } from "./records";
import { attempt, ok, write, type StoreContext } from "./shared";

export const RANKINGS_LOAD_FAILED = "Couldn't load your rankings. Please try again.";
export const RANKINGS_SAVE_FAILED = "Couldn't save your rankings. Please try again.";
export const RANKINGS_DAMAGED = "Your saved rankings can't be read. Start over by importing the schedule again.";

export interface RankingsOps {
    getRankings: () => Promise<ActionResult<RankingsDocument | null>>;
    saveRankings: (doc: RankingsDocument) => Promise<ActionResult<RankingsDocument>>;
    clearRankings: () => Promise<ActionResult<null>>;
}

export function createRankingsOps(ctx: StoreContext): RankingsOps {
    return {
        getRankings: () =>
            attempt(RANKINGS_LOAD_FAILED, async () => {
                const raw = await ctx.repo.read((tx) => tx.getMeta(META_RANKINGS));
                if (raw === undefined || raw === null) return ok(null);
                const parsed = parseRankings(raw);
                return parsed.ok ? ok(parsed.doc) : { success: false, error: RANKINGS_DAMAGED };
            }),

        saveRankings: (doc) =>
            attempt(RANKINGS_SAVE_FAILED, async () => {
                const parsed = parseRankings(doc);
                if (!parsed.ok) return { success: false, error: parsed.error.issues?.[0] ?? parsed.error.message, details: { path: parsed.error.paths?.[0] ?? [] } };
                // The file cap holds on every write, so whatever is saved still exports and reopens.
                if (!fitsRankingsFile(parsed.doc)) return { success: false, error: RANKINGS_TOO_LARGE_TO_SAVE_MESSAGE };
                await write(ctx, (tx) => tx.putMeta(META_RANKINGS, parsed.doc));
                return ok(parsed.doc);
            }),

        clearRankings: () =>
            attempt(RANKINGS_SAVE_FAILED, async () => {
                await write(ctx, (tx) => tx.putMeta(META_RANKINGS, null));
                return ok(null);
            }),
    };
}
