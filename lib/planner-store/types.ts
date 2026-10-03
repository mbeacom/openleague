/**
 * The practice planner's storage and platform seam (ADR-0020, sub-project 2).
 * Portable components call these interfaces, never server actions or Next.js
 * directly:
 * - hosted implements them with the server actions, next/link, next/image and
 *   router.push (components/providers/HostedPlannerProvider.tsx);
 * - the static app (sub-project 3) implements them with IndexedDB and hash routes.
 *
 * Method names, inputs and results mirror the server actions one to one.
 */
import type { AnchorHTMLAttributes, ComponentType, Ref } from "react";
import type { PlayData } from "@/types/practice-planner";

/** Same shape as the ActionResult each lib/actions file declares. */
export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; details?: unknown };

export type LibraryDateFilter = "all" | "today" | "week" | "month";

export interface LibraryPlaySummary {
    id: string;
    name: string;
    description: string | null;
    thumbnail: string | null;
    isTemplate: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface LibraryPlay extends LibraryPlaySummary {
    playData: PlayData;
}

export interface LibraryPage {
    plays: LibraryPlaySummary[];
    total: number;
    page: number;
    limit: number;
}

export interface LibraryQuery {
    teamId: string;
    isTemplate?: boolean;
    page: number;
    limit: number;
    search?: string;
    dateFilter: LibraryDateFilter;
}

export interface PlayRef {
    id: string;
    teamId: string;
}

export interface NewLibraryPlay {
    name: string;
    description?: string;
    thumbnail?: string;
    playData: PlayData;
    isTemplate: boolean;
    teamId: string;
}

export interface SessionDrillSave {
    sessionId: string;
    teamId: string;
    /** Omitted for a brand-new drill. */
    playId?: string;
    name: string;
    description?: string;
    thumbnail?: string;
    playData: PlayData;
}

export interface SessionDrillRef {
    playId: string;
    teamId: string;
}

export interface SessionRef {
    id: string;
    teamId: string;
}

export interface SessionCopy extends SessionRef {
    date: Date;
}

export interface SessionShare extends SessionRef {
    isShared: boolean;
}

export interface PlannerStore {
    getPlaysByTeam(input: LibraryQuery): Promise<ActionResult<LibraryPage>>;
    getPlayById(input: PlayRef): Promise<ActionResult<LibraryPlay>>;
    createPlay(input: NewLibraryPlay): Promise<ActionResult<{ id: string; name: string; isTemplate: boolean }>>;
    deletePlay(input: PlayRef): Promise<ActionResult<{ id: string; detachedSessions: number }>>;
    saveSessionDrill(input: SessionDrillSave): Promise<ActionResult<{ playId: string }>>;
    copySessionDrillToLibrary(input: SessionDrillRef): Promise<ActionResult<{ playId: string }>>;
    duplicatePracticeSession(input: SessionCopy): Promise<ActionResult<{ id: string }>>;
    deletePracticeSession(input: SessionRef): Promise<ActionResult<{ id: string }>>;
    /** Team sharing is hosted-only. A store without it hides the Share control. */
    sharePracticeSession?(input: SessionShare): Promise<ActionResult<{ id: string; isShared: boolean }>>;
}

export type PlannerLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: string;
    ref?: Ref<HTMLAnchorElement>;
};

/** A thumbnail that fills its positioned parent. */
export interface PlannerImageProps {
    src: string;
    alt: string;
    fit: "contain" | "cover";
}

export interface PlannerRoutes {
    list(): string;
    session(id: string): string;
    sessionEdit(id: string): string;
    sessionPrint(id: string): string;
    libraryNew(): string;
    libraryEdit(playId: string): string;
}

export interface PlannerPlatform {
    Link: ComponentType<PlannerLinkProps>;
    Image: ComponentType<PlannerImageProps>;
    navigate(href: string): void;
    routes: PlannerRoutes;
}
