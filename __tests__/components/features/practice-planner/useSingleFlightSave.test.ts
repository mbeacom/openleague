import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSingleFlightSave } from "@/components/features/practice-planner/useSingleFlightSave";

describe("useSingleFlightSave", () => {
    it("reports a running save and whether it was edited since it started", () => {
        const { result } = renderHook(() => useSingleFlightSave());
        expect(result.current.isRunning()).toBe(false);
        const version = result.current.start();
        expect(result.current.isRunning()).toBe(true);
        expect(result.current.editedSince(version)).toBe(false);
        result.current.markEdited();
        expect(result.current.editedSince(version)).toBe(true);
        act(() => result.current.finish());
        expect(result.current.isRunning()).toBe(false);
        expect(result.current.followUp).toBeNull();
    });

    it("merges queued intents by OR and publishes one follow-up on finish", () => {
        const { result } = renderHook(() => useSingleFlightSave());
        result.current.start();
        result.current.queue({ overrideConflicts: false, notify: true });
        result.current.queue({ overrideConflicts: true, notify: false });
        result.current.queue({ overrideConflicts: false, notify: false });
        act(() => result.current.finish());
        expect(result.current.followUp).toEqual({ overrideConflicts: true, notify: true });

        // The queue is cleared: the next save publishes nothing new.
        const previous = result.current.followUp;
        result.current.start();
        act(() => result.current.finish());
        expect(result.current.followUp).toBe(previous);
    });

    it("keeps the same object between follow-ups", () => {
        const { result, rerender } = renderHook(() => useSingleFlightSave());
        const first = result.current;
        rerender();
        expect(result.current).toBe(first);
    });
});
