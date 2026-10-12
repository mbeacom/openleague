/** The drill-list density when the browser blocks localStorage: the full cards, and the toggle still works. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDrillDensity } from "@/components/features/practice-planner/useDrillDensity";

beforeAll(() => {
    const blocked = () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(blocked);
});
afterAll(() => vi.restoreAllMocks());

describe("useDrillDensity with blocked storage", () => {
    it("reads the full cards, never throws, and keeps a choice for the rest of the visit", () => {
        const first = renderHook(() => useDrillDensity());
        expect(first.result.current[0]).toBe("comfortable");
        act(() => first.result.current[1]("compact"));
        expect(first.result.current[0]).toBe("compact");
        const second = renderHook(() => useDrillDensity());
        expect(second.result.current[0]).toBe("compact");
        act(() => second.result.current[1]("comfortable"));
        expect(first.result.current[0]).toBe("comfortable");
    });
});
