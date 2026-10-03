/** Plan links (ADR-0020): deflate-raw + base64url in a #plan= fragment, with size caps both ways. */
import { describe, expect, it } from "vitest";
import {
    LINK_TOO_LARGE_TO_OPEN_MESSAGE,
    LINK_UNREADABLE_MESSAGE,
    MAX_PLAN_LINK_BYTES,
    MAX_PLAN_LINK_ENCODED_LENGTH,
    PlanLinkError,
    PlanLinkTooLargeError,
    base64UrlDecode,
    base64UrlEncode,
    decodePlanLink,
    deflateRaw,
    encodePlanLink,
    readPlanLink,
    serializePlan,
    type PlanSessionInput,
} from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const NOW = new Date("2026-10-03T18:00:00.000Z");

function plan(drillCount = 2, instructions = "Go") {
    const input: PlanSessionInput = {
        title: "Tuesday",
        durationMinutes: 300,
        date: null,
        startTime: null,
        drills: Array.from({ length: drillCount }, (_, i) => ({
            sequence: i,
            duration: 1,
            runsWithPrevious: false,
            instructions,
            name: `Drill ${i}`,
            description: null,
            playData: createEmptyPlayData(),
        })),
    };
    return serializePlan(input, "openleague-hosted", NOW);
}

const encoder = new TextEncoder();

describe("base64url", () => {
    it("round-trips every byte value without padding or + /", () => {
        const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
        const encoded = base64UrlEncode(bytes);
        expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(Array.from(base64UrlDecode(encoded))).toEqual(Array.from(bytes));
    });

    it.each(["has space", "plus+slash/", "A"])("rejects %j", (value) => {
        expect(() => base64UrlDecode(value)).toThrow(PlanLinkError);
    });
});

describe("encodePlanLink / decodePlanLink", () => {
    it("round-trips a plan", async () => {
        const doc = plan();
        const encoded = await encodePlanLink(doc);
        expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(await decodePlanLink(encoded)).toEqual(JSON.parse(JSON.stringify(doc)));
    });

    it("refuses to encode a plan whose JSON exceeds the link cap", async () => {
        const big = plan(40, "a".repeat(2000));
        expect(encoder.encode(JSON.stringify(big)).byteLength).toBeGreaterThan(MAX_PLAN_LINK_BYTES);
        await expect(encodePlanLink(big)).rejects.toBeInstanceOf(PlanLinkTooLargeError);
    });

    it("decodes data that inflates to exactly the cap", async () => {
        const text = JSON.stringify("x".repeat(MAX_PLAN_LINK_BYTES - 2));
        const value = base64UrlEncode(await deflateRaw(encoder.encode(text)));
        expect(await decodePlanLink(value)).toBe("x".repeat(MAX_PLAN_LINK_BYTES - 2));
    });

    it("stops inflating past the cap (zip-bomb guard)", async () => {
        const bomb = base64UrlEncode(await deflateRaw(encoder.encode(" ".repeat(MAX_PLAN_LINK_BYTES * 8))));
        expect(bomb.length).toBeLessThan(MAX_PLAN_LINK_ENCODED_LENGTH);
        await expect(decodePlanLink(bomb)).rejects.toBeInstanceOf(PlanLinkTooLargeError);
    });

    it("rejects a fragment longer than any valid link before decoding", async () => {
        await expect(decodePlanLink("A".repeat(MAX_PLAN_LINK_ENCODED_LENGTH + 1))).rejects.toBeInstanceOf(PlanLinkTooLargeError);
    });

    it.each([
        ["empty", ""],
        ["not base64url", "@@@"],
        ["not deflate data", base64UrlEncode(encoder.encode("definitely not deflate"))],
    ])("rejects %s input", async (_label, value) => {
        await expect(decodePlanLink(value)).rejects.toBeInstanceOf(PlanLinkError);
    });

    it("rejects inflated bytes that aren't JSON", async () => {
        const value = base64UrlEncode(await deflateRaw(encoder.encode("{not json")));
        await expect(decodePlanLink(value)).rejects.toBeInstanceOf(PlanLinkError);
    });
});

describe("readPlanLink", () => {
    it("decodes and parses a plan", async () => {
        const result = await readPlanLink(await encodePlanLink(plan()));
        expect(result.ok && result.plan.session.title).toBe("Tuesday");
    });

    it("reports garbage as not a plan, with link wording", async () => {
        expect(await readPlanLink("@@@")).toEqual({ ok: false, error: { code: "not-a-plan", message: LINK_UNREADABLE_MESSAGE } });
    });

    it("reports valid JSON that isn't a plan with link wording", async () => {
        const value = base64UrlEncode(await deflateRaw(encoder.encode(JSON.stringify({ hello: "world" }))));
        expect(await readPlanLink(value)).toEqual({ ok: false, error: { code: "not-a-plan", message: LINK_UNREADABLE_MESSAGE } });
    });

    it("reports an oversized link as invalid", async () => {
        const bomb = base64UrlEncode(await deflateRaw(encoder.encode(" ".repeat(MAX_PLAN_LINK_BYTES * 2))));
        expect(await readPlanLink(bomb)).toEqual({ ok: false, error: { code: "invalid", message: LINK_TOO_LARGE_TO_OPEN_MESSAGE } });
    });
});
