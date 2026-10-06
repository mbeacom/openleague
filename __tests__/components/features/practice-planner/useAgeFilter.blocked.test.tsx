/** The age filter when the browser blocks localStorage (R3): All ages, and the chips still work. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAgeFilter } from "@/components/features/practice-planner/useAgeFilter";

beforeAll(() => {
    const blocked = () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(blocked);
});
afterAll(() => vi.restoreAllMocks());

describe("useAgeFilter with blocked storage", () => {
    it("reads All ages, never throws, and keeps a choice for the rest of the visit", () => {
        const first = renderHook(() => useAgeFilter());
        expect(first.result.current[0]).toBeNull();
        act(() => first.result.current[1]("u6"));
        expect(first.result.current[0]).toBe("u6");
        const second = renderHook(() => useAgeFilter());
        expect(second.result.current[0]).toBe("u6");
        act(() => second.result.current[1](null));
        expect(first.result.current[0]).toBeNull();
    });
});
