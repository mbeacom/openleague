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

    it("request publishes a fresh follow-up at once when idle", () => {
        const { result } = renderHook(() => useSingleFlightSave());
        act(() => { void result.current.request({ overrideConflicts: false, notify: false }); });
        const first = result.current.followUp;
        expect(first).toEqual({ overrideConflicts: false, notify: false });

        // A second request is a new object, so the editor's effect runs again.
        const { request } = result.current; // safe to pass around unbound
        act(() => { void request({ overrideConflicts: false, notify: false }); });
        expect(result.current.followUp).not.toBe(first);
    });

    it("request queues behind a running save and publishes on finish", () => {
        const { result } = renderHook(() => useSingleFlightSave());
        result.current.start();
        act(() => { void result.current.request({ overrideConflicts: false, notify: false }); });
        expect(result.current.followUp).toBeNull();
        result.current.queue({ overrideConflicts: true, notify: false });
        act(() => result.current.finish());
        expect(result.current.followUp).toEqual({ overrideConflicts: true, notify: false });
    });

    it("settles a request with the outcome of the save that carries it", async () => {
        const { result } = renderHook(() => useSingleFlightSave());
        let outcome: Promise<unknown> = Promise.resolve();
        act(() => { outcome = result.current.request({ overrideConflicts: false, notify: false }); });
        result.current.start();
        act(() => result.current.finish({ ok: false, error: "Too long" }));
        await expect(outcome).resolves.toEqual({ ok: false, error: "Too long" });
    });

    it("settles a request queued behind a running save only when the queued save finishes", async () => {
        const { result } = renderHook(() => useSingleFlightSave());
        const settled: unknown[] = [];
        result.current.start();
        act(() => { void result.current.request({ overrideConflicts: false, notify: false }).then((o) => settled.push(o)); });
        act(() => result.current.finish({ ok: true }));
        await Promise.resolve();
        expect(settled).toEqual([]);

        result.current.start();
        act(() => result.current.finish({ ok: true }));
        await Promise.resolve();
        expect(settled).toEqual([{ ok: true }]);
    });

    it("fails a waiting request when the save stops before it starts", async () => {
        const { result } = renderHook(() => useSingleFlightSave());
        let outcome: Promise<unknown> = Promise.resolve();
        act(() => { outcome = result.current.request({ overrideConflicts: false, notify: false }); });
        result.current.abandon("Fix the form");
        await expect(outcome).resolves.toEqual({ ok: false, error: "Fix the form" });
    });

    it("keeps the same object between follow-ups", () => {
        const { result, rerender } = renderHook(() => useSingleFlightSave());
        const first = result.current;
        rerender();
        expect(result.current).toBe(first);
    });
});
