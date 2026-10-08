import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { PlannerProvider, type PlannerStore } from "@/lib/planner-store";
import { usePlannerFavorites } from "@/components/features/practice-planner/usePlannerFavorites";
import { createHashPlatform, createMockPlannerStore } from "@/__tests__/helpers/planner";

function setup(extra: Partial<Record<keyof PlannerStore, unknown>> = {}) {
    const store = { ...createMockPlannerStore(), ...extra } as unknown as PlannerStore;
    const wrapper = ({ children }: { children: ReactNode }) => (
        <PlannerProvider store={store} platform={createHashPlatform()}>
            {children}
        </PlannerProvider>
    );
    return { store, wrapper };
}

describe("usePlannerFavorites", () => {
    it("is unsupported, with nothing starred, when the store has no favorites", () => {
        const { wrapper } = setup();
        const { result } = renderHook(() => usePlannerFavorites("DRILL"), { wrapper });
        expect(result.current.supported).toBe(false);
        expect(result.current.isFavorite("a")).toBe(false);
    });

    it("loads the kind's ids", async () => {
        const list = vi.fn().mockResolvedValue({ success: true, data: ["a", "b"] });
        const { wrapper } = setup({ listPlannerFavorites: list, setPlannerFavorite: vi.fn() });
        const { result } = renderHook(() => usePlannerFavorites("PRACTICE"), { wrapper });
        await waitFor(() => expect(result.current.loaded).toBe(true));
        expect(list).toHaveBeenCalledWith({ kind: "PRACTICE" });
        expect(result.current.isFavorite("a")).toBe(true);
        expect(result.current.isFavorite("c")).toBe(false);
    });

    it("uses ids read on the server without fetching", () => {
        const list = vi.fn();
        const { wrapper } = setup({ listPlannerFavorites: list, setPlannerFavorite: vi.fn() });
        const { result } = renderHook(() => usePlannerFavorites("PRACTICE", ["x"]), { wrapper });
        expect(result.current.loaded).toBe(true);
        expect(result.current.isFavorite("x")).toBe(true);
        expect(list).not.toHaveBeenCalled();
    });

    it("stars at once, before the save answers", async () => {
        let answer: (value: unknown) => void = () => undefined;
        const save = vi.fn(() => new Promise((resolve) => (answer = resolve)));
        const { wrapper } = setup({ listPlannerFavorites: vi.fn().mockResolvedValue({ success: true, data: [] }), setPlannerFavorite: save });
        const { result } = renderHook(() => usePlannerFavorites("DRILL"), { wrapper });
        await waitFor(() => expect(result.current.loaded).toBe(true));
        let saved: Promise<boolean> = Promise.resolve(false);
        act(() => {
            saved = result.current.setFavorite("d1", true);
        });
        expect(result.current.isFavorite("d1")).toBe(true);
        expect(save).toHaveBeenCalledWith({ kind: "DRILL", targetId: "d1", favorite: true });
        await act(async () => {
            answer({ success: true, data: { kind: "DRILL", targetId: "d1", favorite: true } });
            expect(await saved).toBe(true);
        });
        expect(result.current.isFavorite("d1")).toBe(true);
        expect(result.current.error).toBeNull();
    });

    it("puts the star back and reports the error when the save fails", async () => {
        const save = vi.fn().mockResolvedValue({ success: false, error: "Drill not found" });
        const { wrapper } = setup({ listPlannerFavorites: vi.fn().mockResolvedValue({ success: true, data: ["d1"] }), setPlannerFavorite: save });
        const { result } = renderHook(() => usePlannerFavorites("DRILL"), { wrapper });
        await waitFor(() => expect(result.current.isFavorite("d1")).toBe(true));
        await act(async () => {
            expect(await result.current.setFavorite("d1", false)).toBe(false);
        });
        expect(result.current.isFavorite("d1")).toBe(true);
        expect(result.current.error).toBe("Drill not found");
        act(() => result.current.clearError());
        expect(result.current.error).toBeNull();
    });

    it("keeps a tap made before the list arrived", async () => {
        let answerList: (value: unknown) => void = () => undefined;
        const list = vi.fn(() => new Promise((resolve) => (answerList = resolve)));
        const save = vi.fn().mockResolvedValue({ success: true, data: {} });
        const { wrapper } = setup({ listPlannerFavorites: list, setPlannerFavorite: save });
        const { result } = renderHook(() => usePlannerFavorites("DRILL"), { wrapper });
        await act(async () => {
            await result.current.setFavorite("new", true);
        });
        await act(async () => answerList({ success: true, data: ["old"] }));
        expect(result.current.isFavorite("new")).toBe(true);
        expect(result.current.isFavorite("old")).toBe(true);
    });
});
