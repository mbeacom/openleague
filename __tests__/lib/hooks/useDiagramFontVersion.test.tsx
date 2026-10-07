import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDiagramFontVersion } from "@/lib/hooks/useDiagramFontVersion";

describe("useDiagramFontVersion", () => {
    it("changes when the diagram font finishes loading", () => {
        const listeners = new Set<() => void>();
        Object.defineProperty(document, "fonts", {
            value: { load: () => Promise.resolve([]), addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) },
            configurable: true,
        });
        const { result } = renderHook(() => useDiagramFontVersion());
        const before = result.current;
        act(() => { for (const fn of listeners) fn(); });
        expect(result.current).not.toBe(before);
        Object.defineProperty(document, "fonts", { value: undefined, configurable: true });
    });
});
