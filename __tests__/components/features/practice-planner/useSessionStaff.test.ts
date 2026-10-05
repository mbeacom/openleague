/** useSessionStaff: the editor's staff state (practice staff, spec R3, R8). */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import type { SessionItem } from "@/types/practice-planner";
import { useSessionStaff } from "@/components/features/practice-planner/useSessionStaff";

function useHarness() {
    const [plays, setPlays] = useState<SessionItem[]>([]);
    return useSessionStaff({ initial: [{ id: "k-new", name: "Pat" }], plays, setPlays, markDirty: vi.fn(), locked: false });
}

describe("useSessionStaff", () => {
    it("keeps a saved person's first key as their render key, and drops it when they are removed", () => {
        const { result } = renderHook(useHarness);
        act(() => result.current.applySaved([{ key: "k-new", id: "cstored1" }]));
        expect(result.current.staff).toEqual([{ id: "cstored1", name: "Pat" }]);
        expect(result.current.renderKeys.get("cstored1")).toBe("k-new");
        act(() => result.current.remove("cstored1"));
        expect(result.current.staff).toEqual([]);
        expect(result.current.renderKeys.has("cstored1")).toBe(false);
    });
});
