"use client";

/**
 * The rankings screens' platform seam (hosted rankings and team logos spec,
 * R3). The screens are shared by the static app and the hosted app, so they
 * take their routes, navigation and the Update results panel's second action
 * from here instead of the static app's hash routes.
 *
 * The default is the static app's own platform, so the static app (and every
 * existing test) renders the screens without a provider. The hosted app wraps
 * each rankings page in <RankingsPlatformProvider> with path routes bound to
 * one stored document.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { RankingsSource } from "@/lib/rankings-document";
import { navigateTo } from "../../platform";
import { staticRoutes, type RankingsSetupSection } from "../../routes";
import { FetchForMeAction } from "./FetchForMeAction";

export interface RankingsRoutes {
    rankings(): string;
    rankingsImport(): string;
    /** Import, arriving from "Update results": the schedule paste box is focused, with a one-line hint. */
    rankingsUpdate(): string;
    /** Setup, opened at one section when given. */
    rankingsSetup(section?: RankingsSetupSection): string;
    rankingsWhatIf(): string;
    rankingsTeam(number: string): string;
}

export interface RankingsPlatform {
    routes: RankingsRoutes;
    navigate(href: string): void;
    /** The Update results panel's second action for the saved schedule page; null renders nothing. */
    fetchAction(source: RankingsSource | null): ReactNode;
}

export const staticRankingsPlatform: RankingsPlatform = {
    routes: staticRoutes,
    navigate: navigateTo,
    fetchAction: (source) => <FetchForMeAction source={source} />,
};

const RankingsPlatformContext = createContext<RankingsPlatform>(staticRankingsPlatform);

export function RankingsPlatformProvider({ platform, children }: { platform: RankingsPlatform; children: ReactNode }) {
    return <RankingsPlatformContext.Provider value={platform}>{children}</RankingsPlatformContext.Provider>;
}

export function useRankingsPlatform(): RankingsPlatform {
    return useContext(RankingsPlatformContext);
}
