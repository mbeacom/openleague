/**
 * Library-name matching for drafted drills (spec R1, Ruling 14): a drafted
 * drill whose name equals a library drill's name, ignoring case and spacing,
 * can use that drill's diagram. Deterministic and on the device.
 */
import type { PlanDocument } from "@/lib/plan-document";
import type { PlayData } from "@/types/practice-planner";

export interface LibraryEntry {
    id: string;
    name: string;
}

const key = (name: string) => name.replace(/\s+/g, " ").trim().toLocaleLowerCase();

/** Row sequence → library drill id, for drafted drills with an exactly matching name. The newest-listed entry wins a tie. */
export function libraryMatches(plan: PlanDocument, library: readonly LibraryEntry[]): Map<number, string> {
    const byName = new Map<string, string>();
    for (const entry of library) if (!byName.has(key(entry.name))) byName.set(key(entry.name), entry.id);
    const matches = new Map<number, string>();
    for (const row of plan.session.drills) {
        if (row.kind !== "drill") continue;
        const id = byName.get(key(row.drill.name));
        if (id) matches.set(row.sequence, id);
    }
    return matches;
}

/** A copy of the plan with the given rows' diagrams replaced. */
export function withLibraryDiagrams(plan: PlanDocument, diagrams: ReadonlyMap<number, PlayData>): PlanDocument {
    return {
        ...plan,
        session: {
            ...plan.session,
            drills: plan.session.drills.map((row) => {
                const playData = row.kind === "drill" ? diagrams.get(row.sequence) : undefined;
                return playData && row.kind === "drill" ? { ...row, drill: { ...row.drill, playData } } : row;
            }),
        },
    };
}

/** True when a diagram has nothing on it: a drafted drill's empty board. */
export function isEmptyDiagram(playData: PlayData): boolean {
    return playData.players.length === 0 && playData.drawings.length === 0 && playData.equipment.length === 0 && playData.annotations.length === 0;
}
