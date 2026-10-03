/** The #plan= hand-off across login (ADR-0020): fragment → sessionStorage → import page. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    PENDING_PLAN_KEY,
    PENDING_PLAN_TTL_MS,
    hasPendingPlan,
    planFragmentValue,
    stashPlanFragment,
    takeIncomingPlan,
    takePendingPlan,
} from "@/lib/plan-document/pending";

const NOW = Date.parse("2026-10-03T18:00:00.000Z");

beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, "", "/");
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("planFragmentValue", () => {
    it.each([
        ["#plan=abc", "abc"],
        ["plan=abc", "abc"],
        ["#other=1&plan=x_y-z", "x_y-z"],
        ["#plan=", null],
        ["#planning", null],
        ["", null],
    ])("reads %j", (hash, expected) => {
        expect(planFragmentValue(hash)).toBe(expected);
    });
});

describe("stashPlanFragment", () => {
    it("moves the fragment into sessionStorage and clears the hash, keeping path and query", () => {
        window.history.replaceState(null, "", "/login?callbackUrl=%2Fx#plan=abc");
        expect(stashPlanFragment(NOW)).toBe(true);
        expect(window.location.hash).toBe("");
        expect(window.location.pathname + window.location.search).toBe("/login?callbackUrl=%2Fx");
        expect(JSON.parse(sessionStorage.getItem(PENDING_PLAN_KEY) ?? "null")).toEqual({ value: "abc", savedAt: NOW });
    });

    it("keeps history.state (the App Router stores its tree there)", () => {
        window.history.replaceState({ marker: 1 }, "", "/login#plan=abc");
        stashPlanFragment(NOW);
        expect(window.history.state).toEqual({ marker: 1 });
    });

    it("does nothing without a plan fragment", () => {
        window.history.replaceState(null, "", "/login#section");
        expect(stashPlanFragment(NOW)).toBe(false);
        expect(window.location.hash).toBe("#section");
        expect(sessionStorage.getItem(PENDING_PLAN_KEY)).toBeNull();
    });

    it("still clears the hash when storage refuses the write", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new DOMException("full", "QuotaExceededError");
        });
        window.history.replaceState(null, "", "/login#plan=abc");
        expect(stashPlanFragment(NOW)).toBe(false);
        expect(window.location.hash).toBe("");
    });
});

describe("pending plan expiry", () => {
    it("is fresh up to the TTL and stale after it", () => {
        window.history.replaceState(null, "", "/login#plan=abc");
        stashPlanFragment(NOW);
        expect(hasPendingPlan(NOW + PENDING_PLAN_TTL_MS)).toBe(true);
        expect(hasPendingPlan(NOW + PENDING_PLAN_TTL_MS + 1)).toBe(false);
    });

    it("take returns a fresh value once, then nothing", () => {
        window.history.replaceState(null, "", "/login#plan=abc");
        stashPlanFragment(NOW);
        expect(takePendingPlan(NOW + 1000)).toBe("abc");
        expect(takePendingPlan(NOW + 2000)).toBeNull();
    });

    it("take drops a stale value", () => {
        sessionStorage.setItem(PENDING_PLAN_KEY, JSON.stringify({ value: "old", savedAt: NOW }));
        expect(takePendingPlan(NOW + PENDING_PLAN_TTL_MS + 1)).toBeNull();
        expect(sessionStorage.getItem(PENDING_PLAN_KEY)).toBeNull();
    });

    it.each(["{", JSON.stringify({ value: 3, savedAt: NOW }), JSON.stringify({ value: "x" })])("ignores a corrupt entry %j", (stored) => {
        sessionStorage.setItem(PENDING_PLAN_KEY, stored);
        expect(hasPendingPlan(NOW)).toBe(false);
    });
});

describe("takeIncomingPlan", () => {
    it("prefers the fragment, clears the hash and drops any stash", () => {
        sessionStorage.setItem(PENDING_PLAN_KEY, JSON.stringify({ value: "stashed", savedAt: NOW }));
        window.history.replaceState(null, "", "/practice-planner/import#plan=fresh");
        expect(takeIncomingPlan(NOW)).toBe("fresh");
        expect(window.location.hash).toBe("");
        expect(sessionStorage.getItem(PENDING_PLAN_KEY)).toBeNull();
    });

    it("falls back to the stash", () => {
        sessionStorage.setItem(PENDING_PLAN_KEY, JSON.stringify({ value: "stashed", savedAt: NOW }));
        window.history.replaceState(null, "", "/practice-planner/import");
        expect(takeIncomingPlan(NOW)).toBe("stashed");
    });

    it("returns null when there is nothing", () => {
        expect(takeIncomingPlan(NOW)).toBeNull();
    });
});
