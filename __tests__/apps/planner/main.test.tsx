import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { CRASH_MESSAGE } from "@/apps/planner/src/App";

vi.mock("@/apps/planner/src/store/open-store", () => ({
    createStaleSignal: () => ({ subscribe: () => () => undefined, isStale: () => false, markStale: () => undefined }),
    openPlannerStore: () => Promise.reject(new Error("boot failed")),
}));

describe("planner boot", () => {
    let error: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.resetModules();
        error = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        error.mockRestore();
        document.body.innerHTML = "";
    });

    it("shows the crash message in #root when boot fails", async () => {
        document.body.innerHTML = '<div id="root"></div>';
        await import("@/apps/planner/src/main");
        await waitFor(() => expect(document.getElementById("root")?.textContent).toBe(CRASH_MESSAGE));
    });

    it("shows the crash message in the body when #root is missing", async () => {
        await import("@/apps/planner/src/main");
        await waitFor(() => expect(document.body.textContent).toBe(CRASH_MESSAGE));
    });
});
