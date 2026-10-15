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
import type { RankingsDocumentOps, RankingsOps } from "./rankings";
import type { AiSettingsOps } from "./ai-settings";
import type { RecoveredOps } from "./recovered";
import type { LinkStore } from "./links";
import type { LocationStore } from "./locations";
import type { FileHandleStore } from "./file-handles";

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
    /** An opened wrapped file's envelope id, kept as the new practice's (storage connectors spec R1). */
    documentId?: string;
}

/** What the storage screens need to know about a practice's plan file. */
export interface LocalSessionDocumentInfo {
    id: string;
    title: string;
    /** The envelope id; null until the first wrapped download or connector save. */
    documentId: string | null;
    updatedAt: Date;
}

export interface LocalStoreOptions {
    now?: () => Date;
    newId?: () => string;
    /** A thumbnail for a drill the store creates itself (starters, imports). Errors are swallowed. */
    makeThumbnail?: (playData: PlayData) => string | null;
    /** Awaited before the store draws thumbnails to store (the diagram font); only when it has something to draw. */
    beforeStoredDraw?: () => Promise<void>;
}

export interface LocalPlannerStore extends PlannerStore, RankingsOps, RankingsDocumentOps, AiSettingsOps, RecoveredOps {
    /** The current rankings document's envelope id (what Download writes), or null with none. Always present here. */
    getRankingsDocumentId: NonNullable<RankingsOps["getRankingsDocumentId"]>;
    getPlanDocumentId: NonNullable<PlannerStore["getPlanDocumentId"]>;
    /** The link table (storage connectors spec R3): which remote file each document is saved to. */
    links: LinkStore;
    /** File System Access handles for linked local files, by the connector's file id (storage connectors spec R7). */
    fileHandles: FileHandleStore;
    /** Where connectors save new files (storage locations design). */
    locations: LocationStore;
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
    /**
     * Replaces practice `id` with a plan, or creates it with that id (a file
     * opened through a connector, "Use theirs", "Replace my copy"). The date is
     * the plan's, else the practice's. `documentId` replaces the envelope id.
     */
    replaceSessionFromPlan: (id: string, plan: PlanDocument, options: { documentId?: string }) => Promise<ActionResult<{ sessionId: string }>>;
    getSessionDocumentInfo: (id: string) => Promise<ActionResult<LocalSessionDocumentInfo>>;
    /** The practice's envelope id, made (and kept) on first use. */
    ensureSessionDocumentId: (id: string) => Promise<ActionResult<string>>;
    setSessionDocumentId: (id: string, documentId: string) => Promise<ActionResult<null>>;
    /** The practice on this device whose plan file has this envelope id, if any. */
    findSessionByDocumentId: (documentId: string) => Promise<ActionResult<{ id: string; title: string } | null>>;
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
