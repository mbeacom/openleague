/** The drill library, mirroring lib/actions/plays.ts (ADR-0020). */
import type { LibraryDateFilter } from "@/lib/planner-store";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import { PLAY_DATA_UNREADABLE_CODE, PLAY_DATA_UNREADABLE_MESSAGE, parseStoredPlayData } from "@/lib/utils/play-data";
import { drillTags, toPlayFocus, toPlayGoalies } from "@/lib/utils/drill-tags";
import { matchesAgeGroup, toAgeGroups } from "@/lib/utils/age-groups";
import { LEGACY_SEEDED_STARTER_IDS, META_SEEDED_STARTER_IDS, META_STARTERS_SEEDED, type RepoTx, type StoredPlay } from "./records";
import {
    OWNED_DRILL_DELETE_MESSAGE,
    PLAY_NOT_FOUND_MESSAGE,
    StoreRefusal,
    attempt,
    checkedAgeGroups,
    drillText,
    ok,
    summary,
    thumbnailOrNull,
    writablePlayData,
    write,
    type StoreContext,
} from "./shared";
import type { LocalPlannerStore } from "./types";

export type LibraryOps = Pick<
    LocalPlannerStore,
    "getPlaysByTeam" | "getPlayById" | "createPlay" | "updatePlay" | "deletePlay" | "seedStarterDrills"
>;

/** Hosted's date filter (getPlaysByTeam): local midnight today, Sunday this week, the 1st this month. */
export function dateFilterStart(filter: LibraryDateFilter, now: Date): Date | null {
    switch (filter) {
        case "today":
            return new Date(now.getFullYear(), now.getMonth(), now.getDate());
        case "week": {
            const start = new Date(now);
            start.setDate(now.getDate() - now.getDay());
            start.setHours(0, 0, 0, 0);
            return start;
        }
        case "month":
            return new Date(now.getFullYear(), now.getMonth(), 1);
        default:
            return null;
    }
}

/** Starter ids this device has received: the stored list, or before it existed, the nine the legacy flag stood for. */
export function seededStarterIds(stored: unknown, legacyFlag: unknown): Set<string> {
    if (Array.isArray(stored)) return new Set(stored.filter((id): id is string => typeof id === "string"));
    return new Set(legacyFlag ? LEGACY_SEEDED_STARTER_IDS : []);
}

async function readSeeded(tx: RepoTx): Promise<Set<string>> {
    return seededStarterIds(await tx.getMeta(META_SEEDED_STARTER_IDS), await tx.getMeta(META_STARTERS_SEEDED));
}

const unseeded = (seeded: Set<string>) => STARTER_PLAYS.filter((starter) => !seeded.has(starter.id));

export function createLibraryOps(ctx: StoreContext): LibraryOps {
    return {
        getPlaysByTeam: (input) =>
            attempt("Failed to fetch plays. Please try again.", async () => {
                const plays = await ctx.repo.read((tx) => tx.allPlays());
                const since = dateFilterStart(input.dateFilter, ctx.now());
                const term = input.search?.trim().toLowerCase();
                const matches = plays
                    // Session-owned copies never appear in any listing.
                    .filter((p) => p.sessionId === null)
                    .filter((p) => input.isTemplate === undefined || p.isTemplate === input.isTemplate)
                    .filter((p) => !input.focus || drillTags(p).focus === input.focus)
                    .filter((p) => !input.goalies || drillTags(p).goalies === input.goalies)
                    .filter((p) => matchesAgeGroup(toAgeGroups(p.ageGroups), input.ageGroup ?? null))
                    .filter((p) => !since || p.createdAt >= since)
                    .filter((p) => !term || p.name.toLowerCase().includes(term) || (p.description ?? "").toLowerCase().includes(term))
                    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.name.localeCompare(b.name));
                const start = (input.page - 1) * input.limit;
                return ok({
                    plays: matches.slice(start, start + input.limit).map(summary),
                    total: matches.length,
                    page: input.page,
                    limit: input.limit,
                });
            }),

        getPlayById: (input) =>
            attempt("Failed to fetch play. Please try again.", async () => {
                const play = await ctx.repo.read((tx) => tx.getPlay(input.id));
                // A session-owned copy is read through its session, never by id.
                if (!play || play.sessionId !== null) return { success: false, error: PLAY_NOT_FOUND_MESSAGE };
                const parsed = parseStoredPlayData(play.playData);
                if (!parsed.ok) {
                    console.error(`Unreadable playData for play ${play.id}:`, parsed.error);
                    return { success: false, error: PLAY_DATA_UNREADABLE_MESSAGE, details: { code: PLAY_DATA_UNREADABLE_CODE } };
                }
                return ok({ ...summary(play), playData: parsed.data });
            }),

        createPlay: (input) =>
            attempt("Failed to create play. Please try again.", async () => {
                const text = drillText(input.name, input.description);
                const playData = writablePlayData(input.playData);
                const at = ctx.now();
                const play: StoredPlay = {
                    id: ctx.newId(),
                    ...text,
                    thumbnail: thumbnailOrNull(input.thumbnail),
                    playData,
                    ...drillTags(input),
                    ageGroups: input.ageGroups === undefined ? [] : checkedAgeGroups(input.ageGroups),
                    isTemplate: input.isTemplate,
                    sessionId: null,
                    sourcePlayId: null,
                    createdAt: at,
                    updatedAt: at,
                };
                await write(ctx, (tx) => tx.putPlay(play));
                return ok({ id: play.id, name: play.name, isTemplate: play.isTemplate });
            }),

        updatePlay: (input) =>
            attempt("Failed to update play. Please try again.", async () => {
                const text = drillText(input.name, input.description);
                const playData = writablePlayData(input.playData);
                const thumbnail = thumbnailOrNull(input.thumbnail);
                // Absent = unchanged: only tags the caller sends replace the stored ones.
                const tags = {
                    ...(input.focus !== undefined && { focus: toPlayFocus(input.focus) }),
                    ...(input.goalies !== undefined && { goalies: toPlayGoalies(input.goalies) }),
                    ...(input.ageGroups !== undefined && { ageGroups: checkedAgeGroups(input.ageGroups) }),
                };
                const at = ctx.now();
                await write(ctx, async (tx) => {
                    const play = await tx.getPlay(input.id);
                    // Sessions hold their own copies, so a library edit never reaches one.
                    if (!play || play.sessionId !== null) throw new StoreRefusal(PLAY_NOT_FOUND_MESSAGE);
                    await tx.putPlay({ ...play, ...text, thumbnail, playData, ...tags, updatedAt: at });
                });
                return ok({ id: input.id });
            }),

        deletePlay: (input) =>
            attempt("Failed to delete play. Please try again.", async () => {
                await write(ctx, async (tx) => {
                    const play = await tx.getPlay(input.id);
                    if (!play) throw new StoreRefusal(PLAY_NOT_FOUND_MESSAGE);
                    if (play.sessionId !== null) throw new StoreRefusal(OWNED_DRILL_DELETE_MESSAGE);
                    await tx.deletePlay(play.id);
                });
                // No session ever references a library play here, so nothing is detached.
                return ok({ id: input.id, detachedSessions: 0 });
            }),

        seedStarterDrills: async () => {
            const pending = unseeded(await ctx.repo.read(readSeeded));
            if (pending.length === 0) return;
            // Thumbnails first: nothing but repo calls may be awaited inside a transaction.
            const thumbnails = new Map(pending.map((starter) => [starter.id, ctx.makeThumbnail(starter.playData)]));
            // Not a user write (ctx.repo.write, not write): no persistence prompt at first load.
            await ctx.repo.write(async (tx) => {
                const seeded = await readSeeded(tx);
                const todo = unseeded(seeded);
                if (todo.length === 0) return;
                const existing = new Set(
                    (await tx.allPlays()).filter((p) => p.sessionId === null).map((p) => p.name.trim().toLowerCase()),
                );
                const at = ctx.now();
                for (const starter of todo) {
                    // Seeded either way: a starter blocked by a coach's own drill, or deleted later, never returns.
                    seeded.add(starter.id);
                    if (existing.has(starter.name.trim().toLowerCase())) continue;
                    const play: StoredPlay = {
                        id: ctx.newId(),
                        name: starter.name,
                        description: starter.description || null,
                        thumbnail: thumbnails.get(starter.id) ?? null,
                        playData: structuredClone(starter.playData),
                        focus: starter.focus,
                        goalies: starter.goalies,
                        isTemplate: true,
                        sessionId: null,
                        sourcePlayId: null,
                        createdAt: at,
                        updatedAt: at,
                    };
                    await tx.putPlay(play);
                }
                await tx.putMeta(META_SEEDED_STARTER_IDS, [...seeded]);
                // An older cached build reads only the legacy flag and seeds the original nine by name;
                // set it once any of them is recorded, so that build can't bring back a deleted original.
                if (LEGACY_SEEDED_STARTER_IDS.some((id) => seeded.has(id))) {
                    await tx.putMeta(META_STARTERS_SEEDED, true);
                }
            });
        },
    };
}
