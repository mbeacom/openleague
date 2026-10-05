/**
 * Test doubles for the practice-planner seam (lib/planner-store, ADR-0020).
 * - createMockPlannerStore(): every PlannerStore method as a vi.fn. Tests set
 *   results with mockResolvedValue and assert with the action's own name.
 * - renderWithPlanner(ui, { store, platform }): renders inside PlannerProvider.
 *   The platform defaults to the REAL hosted one, so next/link and next/image
 *   render as they do on the site, and navigate is router.push from the
 *   next/navigation mock (global in vitest.setup.ts, or the test's own).
 * - createHashPlatform(): a platform shaped like the static app's: hash routes,
 *   a plain <a> and <img>, and a navigate spy.
 */
import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { vi, type Mock } from "vitest";
import {
    PlannerProvider,
    type PlannerImageProps,
    type PlannerLinkProps,
    type PlannerPlatform,
    type PlannerStore,
} from "@/lib/planner-store";
import { useHostedPlannerPlatform } from "@/components/providers/hosted-planner-platform";

export type MockPlannerStore = { [K in keyof PlannerStore]: Mock };

export const EMPTY_LIBRARY_PAGE = { success: true, data: { plays: [], total: 0, page: 1, limit: 20 } };

export function createMockPlannerStore(): MockPlannerStore {
    return {
        getPlaysByTeam: vi.fn().mockResolvedValue(EMPTY_LIBRARY_PAGE),
        getPlayById: vi.fn(),
        createPlay: vi.fn(),
        deletePlay: vi.fn(),
        saveSessionDrill: vi.fn(),
        copySessionDrillToLibrary: vi.fn(),
        duplicatePracticeSession: vi.fn(),
        deletePracticeSession: vi.fn(),
        sharePracticeSession: vi.fn(),
        getPracticeLogoImage: vi.fn().mockResolvedValue(null),
    };
}

function HashLink({ href, children, ...rest }: PlannerLinkProps) {
    return (
        <a href={href} {...rest}>
            {children}
        </a>
    );
}

function PlainImage({ src, alt, fit }: PlannerImageProps) {
    // eslint-disable-next-line @next/next/no-img-element -- stands in for the static app's adapter
    return <img src={src} alt={alt} data-fit={fit} />;
}

export function createHashPlatform(): PlannerPlatform & { navigate: Mock } {
    return {
        Link: HashLink,
        Image: PlainImage,
        navigate: vi.fn(),
        routes: {
            list: () => "#/",
            session: (id) => `#/sessions/${id}`,
            sessionEdit: (id) => `#/sessions/${id}/edit`,
            sessionPrint: (id) => `#/sessions/${id}/print`,
            libraryNew: () => "#/library/new",
            libraryEdit: (playId) => `#/library/${playId}/edit`,
        },
        planGenerator: "openleague-static",
        planLink: null,
    };
}

function HostedPlatformProvider({ store, children }: { store: PlannerStore; children: ReactNode }) {
    const platform = useHostedPlannerPlatform();
    return (
        <PlannerProvider store={store} platform={platform}>
            {children}
        </PlannerProvider>
    );
}

export interface PlannerRenderOptions extends Omit<RenderOptions, "wrapper"> {
    store?: MockPlannerStore;
    platform?: PlannerPlatform;
}

export function renderWithPlanner(
    ui: ReactElement,
    { store = createMockPlannerStore(), platform, ...options }: PlannerRenderOptions = {},
): RenderResult {
    const plannerStore = store as unknown as PlannerStore;
    function Wrapper({ children }: { children: ReactNode }) {
        return platform ? (
            <PlannerProvider store={plannerStore} platform={platform}>
                {children}
            </PlannerProvider>
        ) : (
            <HostedPlatformProvider store={plannerStore}>{children}</HostedPlatformProvider>
        );
    }
    return render(ui, { wrapper: Wrapper, ...options });
}
