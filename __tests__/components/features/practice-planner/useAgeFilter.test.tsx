/** The remembered age filter (R3): one localStorage key, shared by every filter on the page. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useAgeFilter } from "@/components/features/practice-planner/useAgeFilter";
import { AGE_FILTER_STORAGE_KEY } from "@/lib/utils/age-groups";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("useAgeFilter", () => {
    it("starts at All ages, remembers a choice under one key, and forgets it for All ages", () => {
        const { result } = renderHook(() => useAgeFilter());
        expect(result.current[0]).toBeNull();
        act(() => result.current[1]("u10"));
        expect(result.current[0]).toBe("u10");
        expect(localStorage.getItem(AGE_FILTER_STORAGE_KEY)).toBe("u10");
        act(() => result.current[1](null));
        expect(result.current[0]).toBeNull();
        expect(localStorage.getItem(AGE_FILTER_STORAGE_KEY)).toBeNull();
    });

    it("reads the remembered age on mount, and every filter on the page follows a change", () => {
        localStorage.setItem(AGE_FILTER_STORAGE_KEY, "u8");
        const first = renderHook(() => useAgeFilter());
        const second = renderHook(() => useAgeFilter());
        expect(first.result.current[0]).toBe("u8");
        act(() => first.result.current[1]("u12"));
        expect(second.result.current[0]).toBe("u12");
    });

    it("reads a stored value it doesn't know as All ages", () => {
        localStorage.setItem(AGE_FILTER_STORAGE_KEY, "u7");
        expect(renderHook(() => useAgeFilter()).result.current[0]).toBeNull();
    });

    it("follows a change made in another tab", () => {
        const { result } = renderHook(() => useAgeFilter());
        act(() => {
            localStorage.setItem(AGE_FILTER_STORAGE_KEY, "u14");
            window.dispatchEvent(new StorageEvent("storage", { key: AGE_FILTER_STORAGE_KEY }));
        });
        expect(result.current[0]).toBe("u14");
    });

    it("renders All ages on the server, whatever the device remembers, so hydration matches", () => {
        localStorage.setItem(AGE_FILTER_STORAGE_KEY, "u8");
        function Probe() {
            const [age] = useAgeFilter();
            return <span>{age ?? "all"}</span>;
        }
        expect(renderToString(<Probe />)).toContain("all");
    });
});
