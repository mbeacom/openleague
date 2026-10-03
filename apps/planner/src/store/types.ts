/**
 * The static planner's store (ADR-0020): PlannerStore plus what the static
 * glue needs, which hosted gets from server components and editor wrappers.
 * Function properties, as in PlannerStore, so strictFunctionTypes checks them.
 * There is no sharePracticeSession: team sharing is hosted-only.
 */
import type { ActionResult, PlannerStore } from "@/lib/planner-store";
import type { PlanDocument } from "@/lib/plan-document";
import type { SavedDrillId } from "@/lib/utils/session-drill-ids";
import type { PlayData, PracticeSessionData, PracticeSessionView } from "@/types/practice-planner";

export interface LocalSessionSummary {
    id: string;
    title: string;
    date: Date;
    duration: number;
    drillCount: number;
    updatedAt: Date;
}

/** One drill in a session save: the editor's card, as EditSessionWrapper maps it for hosted. */
export interface LocalSessionDrill {
    playId: string;
    clientKey: string;
    sequence: number;
    runsWithPrevious: boolean;
    duration: number;
    instructions: string;
}

export interface LocalSessionSave {
    title: string;
    date: Date;
    duration: number;
    plays: LocalSessionDrill[];
}

export interface LocalSessionSaved {
    id: string;
    /** clientKey → owned playId, as updatePracticeSession returns it. */
    plays: SavedDrillId[];
}

export interface LocalSessionEdit {
    sessionId: string;
    initialData: PracticeSessionData;
}

export interface LocalPlayUpdate {
    id: string;
    name: string;
    description?: string;
    thumbnail?: string;
    playData: PlayData;
}

export interface PlanImportOptions {
    date: Date;
    addToLibrary: boolean;
}

export interface LocalStoreOptions {
    now?: () => Date;
    newId?: () => string;
    /** A thumbnail for a drill the store creates itself (starters, imports). Errors are swallowed. */
    makeThumbnail?: (playData: PlayData) => string | null;
}

export interface LocalPlannerStore extends PlannerStore {
    listSessions: () => Promise<ActionResult<LocalSessionSummary[]>>;
    getSessionView: (id: string) => Promise<ActionResult<PracticeSessionView>>;
    getSessionForEdit: (id: string) => Promise<ActionResult<LocalSessionEdit>>;
    createSession: (input: LocalSessionSave) => Promise<ActionResult<LocalSessionSaved>>;
    updateSession: (id: string, input: LocalSessionSave) => Promise<ActionResult<LocalSessionSaved>>;
    updatePlay: (input: LocalPlayUpdate) => Promise<ActionResult<{ id: string }>>;
    importPlan: (plan: PlanDocument, options: PlanImportOptions) => Promise<ActionResult<{ sessionId: string }>>;
    seedStarterDrills: () => Promise<void>;
}
