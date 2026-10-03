/** The planner seam's context: no silent default outside a provider (ADR-0020). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
    MISSING_PROVIDER_MESSAGE,
    PlannerProvider,
    usePlannerPlatform,
    usePlannerStore,
    type PlannerPlatform,
    type PlannerStore,
} from "@/lib/planner-store";

const store = { getPlaysByTeam: vi.fn() } as unknown as PlannerStore;
const platform = { navigate: vi.fn() } as unknown as PlannerPlatform;

function wrapper({ children }: { children: ReactNode }) {
    return <PlannerProvider store={store} platform={platform}>{children}</PlannerProvider>;
}

afterEach(() => vi.restoreAllMocks());

describe("planner context", () => {
    it("throws a named error outside a provider", () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        expect(() => renderHook(() => usePlannerStore())).toThrow(MISSING_PROVIDER_MESSAGE);
        expect(() => renderHook(() => usePlannerPlatform())).toThrow(MISSING_PROVIDER_MESSAGE);
    });

    it("returns the provided store and platform", () => {
        expect(renderHook(() => usePlannerStore(), { wrapper }).result.current).toBe(store);
        expect(renderHook(() => usePlannerPlatform(), { wrapper }).result.current).toBe(platform);
    });
});
