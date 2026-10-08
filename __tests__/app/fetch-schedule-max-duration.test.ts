import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/features/league-fetch/LeagueFetchView", () => ({ LeagueFetchView: () => null }));

import * as page from "@/app/(dashboard)/practice-planner/fetch-schedule/page";

describe("fetch-schedule page", () => {
    it("exports a maxDuration that covers the longest fetch deadline", () => {
        expect(page.maxDuration).toBe(120);
    });
});
