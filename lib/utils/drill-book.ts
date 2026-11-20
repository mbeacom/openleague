/**
 * The drill book: a printable booklet of library drills, one per page.
 * Pure helpers for its text lines and for loading it through the planner
 * store seam (hosted server actions or the static planner's IndexedDB).
 */
import type { PlayData } from "@/types/practice-planner";
import type { LibraryPlay, LibraryPlaySummary, PlannerStore } from "@/lib/planner-store";
import { AGE_GROUP_LABELS, inAgeOrder, type AgeGroup } from "@/lib/utils/age-groups";
import { FOCUS_LABELS, GOALIES_LABELS, drillTags } from "@/lib/utils/drill-tags";
import { describeStroke, displayStepNumbers, getPlayback } from "@/lib/utils/canvas/playback";
import { hasAuthoredSteps } from "@/lib/utils/canvas/steps";

export const DRILL_BOOK_DEFAULT_TITLE = "Drill book";
/** The longest title a coach can give the book. */
export const DRILL_BOOK_TITLE_MAX = 80;
/** The most drills one book prints: a bound on memory and print time, well above a season's library. */
export const DRILL_BOOK_MAX_DRILLS = 200;
/** Library rows per query (the library query's limit). */
const PAGE_SIZE = 100;

/** "8U, 10U · Skaters · Goalie optional": what the drill is for, as on its library card. */
export function drillTagLine(play: { focus?: unknown; goalies?: unknown; ageGroups?: readonly AgeGroup[] }): string {
    const { focus, goalies } = drillTags(play);
    const ages = play.ageGroups?.length ? inAgeOrder(play.ageGroups).map((a) => AGE_GROUP_LABELS[a]).join(", ") : "All ages";
    return [ages, FOCUS_LABELS[focus], GOALIES_LABELS[goalies]].join(" · ");
}

/**
 * The drill's sequence, one line per authored step, numbered as its badges
 * are ("1. A: Puck carry · B: Skate"), in the order the strokes play. Only
 * for a drill whose coach set the steps: an automatic order is never printed
 * (animated playback R8). Strokes left without a step play last, as "Then".
 */
export function drillSequenceLines(playData: PlayData | null): string[] {
    if (!playData || !hasAuthoredSteps(playData)) return [];
    const playback = getPlayback(playData);
    const shown = displayStepNumbers(playData.drawings);
    const byStart = [...playback.strokes].sort(([, a], [, b]) => a.startMs - b.startMs).map(([id]) => id);
    const groups = new Map<number, string[]>();
    for (const id of byStart) {
        const n = shown.get(id) ?? Number.POSITIVE_INFINITY;
        groups.set(n, [...(groups.get(n) ?? []), describeStroke(playback, id)]);
    }
    return [...groups.keys()]
        .sort((a, b) => a - b)
        .map((n) => `${Number.isFinite(n) ? `${n}.` : "Then:"} ${(groups.get(n) as string[]).join(" · ")}`);
}

/** Every drill summary in the team's library, in library order (newest first), up to the book's cap. */
export async function loadDrillBookSummaries(store: PlannerStore, teamId: string): Promise<LibraryPlaySummary[] | null> {
    const plays: LibraryPlaySummary[] = [];
    let pages = 1;
    for (let page = 1; page <= pages && plays.length < DRILL_BOOK_MAX_DRILLS; page++) {
        const result = await store.getPlaysByTeam({ teamId, isTemplate: true, page, limit: PAGE_SIZE, dateFilter: "all" });
        if (!result.success) return null;
        plays.push(...result.data.plays);
        // Bounded by the first answer's total, so the loop always ends.
        if (page === 1) pages = Math.ceil(result.data.total / PAGE_SIZE);
    }
    return plays.slice(0, DRILL_BOOK_MAX_DRILLS);
}

export interface DrillBookEntry {
    id: string;
    play: LibraryPlay | null;
}

/** How many drills load at once: a large library must not fire every request together. */
export const DRILL_BOOK_LOAD_CONCURRENCY = 6;

/** The chosen drills with their diagrams, in the order given; a drill that can't be loaded comes back as null. */
export async function loadDrillBookPlays(store: PlannerStore, teamId: string, ids: readonly string[]): Promise<DrillBookEntry[]> {
    const entries: DrillBookEntry[] = new Array(ids.length);
    let next = 0;
    const worker = async () => {
        while (next < ids.length) {
            const i = next++;
            try {
                const result = await store.getPlayById({ teamId, id: ids[i] });
                entries[i] = { id: ids[i], play: result.success ? result.data : null };
            } catch (error) {
                console.error("Couldn't load a drill for the drill book:", error);
                entries[i] = { id: ids[i], play: null };
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(DRILL_BOOK_LOAD_CONCURRENCY, ids.length) }, worker));
    return entries;
}
