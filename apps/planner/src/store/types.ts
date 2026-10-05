/**
 * The static planner's store (ADR-0020): PlannerStore plus what the static
 * glue needs, which hosted gets from server components and editor wrappers.
 * Function properties, as in PlannerStore, so strictFunctionTypes checks them.
 * There is no sharePracticeSession: team sharing is hosted-only.
 */
import type { ActionResult, PlannerStore } from "@/lib/planner-store";
import type { PlanDocument } from "@/lib/plan-document";
import type { SavedDrillId } from "@/lib/utils/session-drill-ids";
import type { SessionRowInput } from "@/lib/utils/session-rows";
import type { SessionStaffInput } from "@/lib/utils/session-staff";
import type { TeamProfileInput } from "@/lib/utils/team-mark";
import type { PlayData, PlayFocus, PlayGoalies, PracticeSessionData, PracticeSessionView, TeamProfile } from "@/types/practice-planner";

export interface LocalSessionSummary {
    id: string;
    title: string;
    date: Date;
    duration: number;
    drillCount: number;
    updatedAt: Date;
}

/** One row in a session save: the editor's card, as toSessionRowInputs maps it (hosted sends the same). */
export type LocalSessionDrill = SessionRowInput;

export interface LocalSessionSave {
    title: string;
    date: Date;
    duration: number;
    /** Absent = unchanged on update (null on create); null clears. */
    goaliesAttending?: number | null;
    /** Minutes between blocks. Absent = unchanged on update (0 on create). */
    transitionMinutes?: number;
    /** The practice's staff. Absent = unchanged on update (none on create); a row's `staff` is read only with it. */
    staff?: SessionStaffInput[];
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
    focus?: PlayFocus;
    goalies?: PlayGoalies;
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
    /** "Your team" (practice logo spec R4). */
    getTeamProfile: () => Promise<ActionResult<TeamProfile | null>>;
    saveTeamProfile: (input: TeamProfileInput) => Promise<ActionResult<TeamProfile>>;
    clearTeamProfile: () => Promise<ActionResult<null>>;
    /** Called after each save or clear in this tab; returns the unsubscribe. */
    subscribeTeamProfile: (listener: () => void) => () => void;
    /** Starts at 0 and goes up by one per save or clear: a useSyncExternalStore snapshot. */
    teamProfileVersion: () => number;
}
