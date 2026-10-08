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
import type { PracticeRosterInput } from "@/lib/utils/practice-roster";
import type { TeamProfileInput } from "@/lib/utils/team-mark";
import type { EquipmentCountItem, PlayData, PlayFocus, PlayGoalies, PracticeSessionData, PracticeSessionView, TeamProfile } from "@/types/practice-planner";
import type { AgeGroup } from "@/lib/utils/age-groups";
import type { RankingsOps } from "./rankings";
import type { AiSettingsOps } from "./ai-settings";

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
    /** The practice's own equipment. Absent = unchanged on update (none on create); [] clears. */
    equipment?: EquipmentCountItem[];
    /** The practice's roster (roster spec R7). Absent = unchanged on update (none on create); null clears. */
    roster?: PracticeRosterInput | null;
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
    ageGroups?: AgeGroup[];
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
    /** Awaited before the store draws thumbnails to store (the diagram font); only when it has something to draw. */
    beforeStoredDraw?: () => Promise<void>;
}

export interface LocalPlannerStore extends PlannerStore, RankingsOps, AiSettingsOps {
    /** Favorites on this device (practice favorites spec): always present here. */
    listPlannerFavorites: NonNullable<PlannerStore["listPlannerFavorites"]>;
    setPlannerFavorite: NonNullable<PlannerStore["setPlannerFavorite"]>;
    listSessions: () => Promise<ActionResult<LocalSessionSummary[]>>;
    getSessionView: (id: string) => Promise<ActionResult<PracticeSessionView>>;
    getSessionForEdit: (id: string) => Promise<ActionResult<LocalSessionEdit>>;
    createSession: (input: LocalSessionSave) => Promise<ActionResult<LocalSessionSaved>>;
    updateSession: (id: string, input: LocalSessionSave) => Promise<ActionResult<LocalSessionSaved>>;
    updatePlay: (input: LocalPlayUpdate) => Promise<ActionResult<{ id: string }>>;
    /** How many practices on this device use a library drill (their copies name it as their source). */
    countPlayUsage: (playId: string) => Promise<ActionResult<number>>;
    importPlan: (plan: PlanDocument, options: PlanImportOptions) => Promise<ActionResult<{ sessionId: string }>>;
    seedStarterDrills: () => Promise<void>;
    /** Replaces stored thumbnails made before 2× storage (rink diagram quality spec §1); resolves to how many it replaced. */
    refreshStoredThumbnails: () => Promise<number>;
    /** "Your team" (practice logo spec R4). */
    getTeamProfile: () => Promise<ActionResult<TeamProfile | null>>;
    saveTeamProfile: (input: TeamProfileInput) => Promise<ActionResult<TeamProfile>>;
    clearTeamProfile: () => Promise<ActionResult<null>>;
    /** Called after each save or clear in this tab; returns the unsubscribe. */
    subscribeTeamProfile: (listener: () => void) => () => void;
    /** Starts at 0 and goes up by one per save or clear: a useSyncExternalStore snapshot. */
    teamProfileVersion: () => number;
}
