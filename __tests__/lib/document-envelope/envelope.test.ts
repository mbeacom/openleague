/** The shared document envelope (storage connectors spec, R1/R2; ADR-0022), phase 1: reading both forms. */
import { describe, expect, it } from "vitest";
import {
    DOCUMENT_ENVELOPE_FORMAT,
    DOCUMENT_KINDS,
    DOCUMENT_TOO_LARGE_MESSAGE,
    ENVELOPE_OVERHEAD_BYTES,
    INVALID_ENVELOPE_MESSAGE,
    NEWER_ENVELOPE_MESSAGE,
    NOT_A_DOCUMENT_MESSAGE,
    UNKNOWN_KIND_MESSAGE,
    isDocumentKind,
    readDocument,
    readDocumentText,
    serializeDocument,
    wrapDocument,
} from "@/lib/document-envelope";
import {
    FILE_TOO_LARGE_MESSAGE,
    INVALID_PLAN_MESSAGE,
    MAX_PLAN_FILE_BYTES,
    NEWER_VERSION_MESSAGE,
    NOT_A_PLAN_MESSAGE,
    PLAN_FORMAT,
    serializePlan,
} from "@/lib/plan-document";
import { NEWER_RANKINGS_MESSAGE, NOT_RANKINGS_MESSAGE, RANKINGS_FORMAT, createRankingsDocument } from "@/lib/rankings-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const EXPORTED_AT = "2026-10-03T18:00:00.000Z";
const SAVED_AT = "2026-10-07T18:04:00.000Z";
const MODIFIED_AT = "2026-10-05T09:30:00.000Z";
const ID = "0b7c1f0e-5a3e-4c1e-9a47-6f0d7b2f8a11";

const PLAN = serializePlan(
    {
        title: "Tuesday Skills",
        durationMinutes: 60,
        date: "2026-10-06",
        startTime: "19:00",
        drills: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: null, name: "Breakout", description: null, playData: createEmptyPlayData() }],
    },
    "openleague-static",
    new Date(EXPORTED_AT),
);
const RANKINGS = createRankingsDocument({ title: "Fall Pre-season" });

/** Through JSON, as a reader meets it. */
const raw = (value: unknown) => JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
const wrappedPlan = () => raw(wrapDocument(PLAN_FORMAT, PLAN, { id: ID, updatedAt: SAVED_AT, generator: "openleague-static" }));
const wrappedRankings = () => raw(wrapDocument(RANKINGS_FORMAT, RANKINGS, { id: ID, updatedAt: SAVED_AT, generator: "openleague-static" }));

describe("the kind registry", () => {
    it("knows practice plans and rankings", () => {
        expect(Object.keys(DOCUMENT_KINDS).sort()).toEqual([PLAN_FORMAT, RANKINGS_FORMAT]);
        expect(isDocumentKind(PLAN_FORMAT)).toBe(true);
        expect(isDocumentKind("openleague.goalie-rotation")).toBe(false);
        expect(isDocumentKind(DOCUMENT_ENVELOPE_FORMAT)).toBe(false);
    });
});

describe("readDocument: bare documents", () => {
    it("reads a bare plan with no id, dated by its exportedAt", () => {
        expect(readDocument(raw(PLAN))).toEqual({
            ok: true,
            document: { kind: PLAN_FORMAT, version: 1, payload: PLAN, id: null, updatedAt: EXPORTED_AT, wrapped: false },
        });
    });

    it("prefers a bare plan's exportedAt over the source's time", () => {
        const result = readDocument(raw(PLAN), { modifiedAt: MODIFIED_AT });
        expect(result.ok && result.document.updatedAt).toBe(EXPORTED_AT);
    });

    it("reads bare rankings with no time when there is no source", () => {
        expect(readDocument(raw(RANKINGS))).toEqual({
            ok: true,
            document: { kind: RANKINGS_FORMAT, version: 1, payload: RANKINGS, id: null, updatedAt: null, wrapped: false },
        });
    });

    it("dates bare rankings by the source's time", () => {
        const result = readDocument(raw(RANKINGS), { modifiedAt: MODIFIED_AT });
        expect(result.ok && result.document.updatedAt).toBe(MODIFIED_AT);
    });

    it("ignores a source time that isn't an ISO date-time", () => {
        const result = readDocument(raw(RANKINGS), { modifiedAt: "last Tuesday" });
        expect(result.ok && result.document.updatedAt).toBeNull();
    });

    it.each([
        ["an unknown format", { format: "openleague.goalie-rotation", version: 1 }],
        ["no format", { version: 1 }],
        ["an array", [PLAN]],
        ["null", null],
        ["a string", "openleague.practice-plan"],
    ])("says %s isn't an OpenLeague file", (_label, value) => {
        expect(readDocument(value)).toEqual({ ok: false, error: { code: "not-a-document", message: NOT_A_DOCUMENT_MESSAGE } });
    });

    it("keeps a bare kind's own newer-version message", () => {
        expect(readDocument({ format: PLAN_FORMAT, version: 2 })).toEqual({ ok: false, error: { code: "newer-version", message: NEWER_VERSION_MESSAGE } });
        expect(readDocument({ format: RANKINGS_FORMAT, version: 2 })).toEqual({ ok: false, error: { code: "newer-version", message: NEWER_RANKINGS_MESSAGE } });
    });

    it("keeps a bare kind's own problems list", () => {
        const broken = raw(PLAN) as { session: { drills: Array<{ durationMinutes: number }> } };
        broken.session.drills[0].durationMinutes = 0;
        const result = readDocument(broken);
        expect(result).toEqual({
            ok: false,
            error: { code: "invalid", message: INVALID_PLAN_MESSAGE, issues: ['Drill 1 ("Breakout"): Drill length must be at least 1 minute'] },
        });
    });

    it("refuses another known kind when one kind is expected, with the expected kind's message", () => {
        expect(readDocument(raw(RANKINGS), undefined, { kind: PLAN_FORMAT })).toEqual({ ok: false, error: { code: "wrong-kind", message: NOT_A_PLAN_MESSAGE } });
        expect(readDocument(raw(PLAN), undefined, { kind: RANKINGS_FORMAT })).toEqual({ ok: false, error: { code: "wrong-kind", message: NOT_RANKINGS_MESSAGE } });
    });

    it("uses the expected kind's message for something that isn't an OpenLeague file", () => {
        expect(readDocument({ hello: "world" }, undefined, { kind: PLAN_FORMAT })).toEqual({ ok: false, error: { code: "not-a-document", message: NOT_A_PLAN_MESSAGE } });
    });
});

describe("readDocument: wrapped documents", () => {
    it("reads a wrapped plan with the envelope's id and time", () => {
        expect(readDocument(wrappedPlan())).toEqual({
            ok: true,
            document: { kind: PLAN_FORMAT, version: 1, payload: PLAN, id: ID, updatedAt: SAVED_AT, wrapped: true },
        });
    });

    it("reads wrapped rankings with the envelope's id and time", () => {
        expect(readDocument(wrappedRankings())).toEqual({
            ok: true,
            document: { kind: RANKINGS_FORMAT, version: 1, payload: RANKINGS, id: ID, updatedAt: SAVED_AT, wrapped: true },
        });
    });

    it("uses the envelope's time even when a source time is given", () => {
        const plan = readDocument(wrappedPlan(), { modifiedAt: MODIFIED_AT });
        const rankings = readDocument(wrappedRankings(), { modifiedAt: MODIFIED_AT });
        expect(plan.ok && plan.document.updatedAt).toBe(SAVED_AT);
        expect(rankings.ok && rankings.document.updatedAt).toBe(SAVED_AT);
    });

    it("narrows to the expected kind", () => {
        const result = readDocument(wrappedPlan(), undefined, { kind: PLAN_FORMAT });
        expect(result.ok && result.document.payload.session.title).toBe("Tuesday Skills");
    });

    it("strips unknown envelope keys", () => {
        const result = readDocument({ ...wrappedPlan(), syncState: { dirty: true } });
        expect(result.ok).toBe(true);
        expect(result.ok && Object.keys(result.document).sort()).toEqual(["id", "kind", "payload", "updatedAt", "version", "wrapped"]);
    });

    it.each([
        ["kind names another kind than the payload", { kind: RANKINGS_FORMAT }],
        ["version differs from the payload's", { version: 2 }],
    ])("refuses an envelope whose %s", (_label, change) => {
        const result = readDocument({ ...wrappedPlan(), ...change });
        expect(result).toMatchObject({ ok: false, error: { code: "invalid", message: INVALID_ENVELOPE_MESSAGE } });
    });

    it("refuses an envelope whose payload isn't a document", () => {
        expect(readDocument({ ...wrappedPlan(), payload: "plan" })).toMatchObject({ ok: false, error: { code: "invalid", message: INVALID_ENVELOPE_MESSAGE } });
    });

    it.each([
        ["id", { id: "not-a-uuid" }],
        ["updatedAt", { updatedAt: "yesterday" }],
        ["generator", { generator: "" }],
    ])("refuses an envelope with a bad %s", (_label, change) => {
        const result = readDocument({ ...wrappedPlan(), ...change });
        expect(result).toMatchObject({ ok: false, error: { code: "invalid", message: INVALID_ENVELOPE_MESSAGE } });
        expect(!result.ok && result.error.issues?.length).toBeGreaterThan(0);
    });

    it("refuses a newer envelope before looking at its fields", () => {
        expect(readDocument({ format: DOCUMENT_ENVELOPE_FORMAT, envelope: 2, kind: 7 })).toEqual({ ok: false, error: { code: "newer-envelope", message: NEWER_ENVELOPE_MESSAGE } });
        expect(readDocument({ ...wrappedPlan(), envelope: 2 }, undefined, { kind: PLAN_FORMAT })).toEqual({
            ok: false,
            error: { code: "newer-envelope", message: NEWER_ENVELOPE_MESSAGE },
        });
    });

    it("explains an unknown kind in a valid envelope, whatever kind was expected", () => {
        const future = { ...wrappedPlan(), kind: "openleague.goalie-rotation", payload: { format: "openleague.goalie-rotation", version: 1 } };
        const unknown = { ok: false, error: { code: "unknown-kind", message: UNKNOWN_KIND_MESSAGE } };
        expect(readDocument(future)).toEqual(unknown);
        expect(readDocument(future, undefined, { kind: PLAN_FORMAT })).toEqual(unknown);
    });

    it("keeps the kind's own newer-version message for a newer payload", () => {
        const newerPlan = { ...wrappedPlan(), version: 2, payload: { format: PLAN_FORMAT, version: 2 } };
        const newerRankings = { ...wrappedRankings(), version: 2, payload: { format: RANKINGS_FORMAT, version: 2 } };
        expect(readDocument(newerPlan)).toEqual({ ok: false, error: { code: "newer-version", message: NEWER_VERSION_MESSAGE } });
        expect(readDocument(newerRankings)).toEqual({ ok: false, error: { code: "newer-version", message: NEWER_RANKINGS_MESSAGE } });
    });

    it("keeps the kind's own problems list for an invalid payload", () => {
        const wrapped = wrappedPlan() as { payload: { session: { drills: Array<{ durationMinutes: number }> } } };
        wrapped.payload.session.drills[0].durationMinutes = 0;
        expect(readDocument(wrapped)).toEqual({
            ok: false,
            error: { code: "invalid", message: INVALID_PLAN_MESSAGE, issues: ['Drill 1 ("Breakout"): Drill length must be at least 1 minute'] },
        });
    });

    it("refuses a wrapped document of another known kind when one kind is expected", () => {
        expect(readDocument(wrappedRankings(), undefined, { kind: PLAN_FORMAT })).toEqual({ ok: false, error: { code: "wrong-kind", message: NOT_A_PLAN_MESSAGE } });
    });
});

describe("readDocumentText: size and the round trip", () => {
    const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
    /** Pads JSON with trailing spaces to exactly `size` bytes. */
    const padTo = (text: string, size: number) => text + " ".repeat(size - bytes(text));

    it("round-trips a plan: wrap, serialize, read", () => {
        const text = serializeDocument(wrapDocument(PLAN_FORMAT, PLAN, { id: ID, updatedAt: SAVED_AT, generator: "openleague-static" }));
        expect(readDocumentText(text, { modifiedAt: MODIFIED_AT })).toEqual({
            ok: true,
            document: { kind: PLAN_FORMAT, version: 1, payload: PLAN, id: ID, updatedAt: SAVED_AT, wrapped: true },
        });
    });

    it("round-trips rankings: wrap, serialize, read", () => {
        const text = serializeDocument(wrapDocument(RANKINGS_FORMAT, RANKINGS, { id: ID, updatedAt: SAVED_AT, generator: "openleague-hosted" }));
        expect(readDocumentText(text, undefined, { kind: RANKINGS_FORMAT })).toEqual({
            ok: true,
            document: { kind: RANKINGS_FORMAT, version: 1, payload: RANKINGS, id: ID, updatedAt: SAVED_AT, wrapped: true },
        });
    });

    it("writes the envelope's fields in the documented shape", () => {
        const envelope = JSON.parse(serializeDocument(wrapDocument(PLAN_FORMAT, PLAN, { id: ID, updatedAt: SAVED_AT, generator: "openleague-static" })));
        expect(envelope).toEqual({ format: "openleague.document", envelope: 1, kind: PLAN_FORMAT, version: 1, id: ID, updatedAt: SAVED_AT, generator: "openleague-static", payload: raw(PLAN) });
    });

    it("holds a bare plan to the plan's limit", () => {
        const text = JSON.stringify(PLAN);
        expect(readDocumentText(padTo(text, MAX_PLAN_FILE_BYTES)).ok).toBe(true);
        expect(readDocumentText(padTo(text, MAX_PLAN_FILE_BYTES + 1))).toEqual({ ok: false, error: { code: "too-large", message: FILE_TOO_LARGE_MESSAGE } });
    });

    it("allows a wrapped plan the plan's limit plus the envelope overhead", () => {
        const text = JSON.stringify(wrappedPlan());
        expect(readDocumentText(padTo(text, MAX_PLAN_FILE_BYTES + ENVELOPE_OVERHEAD_BYTES)).ok).toBe(true);
        expect(readDocumentText(padTo(text, MAX_PLAN_FILE_BYTES + ENVELOPE_OVERHEAD_BYTES + 1))).toEqual({
            ok: false,
            error: { code: "too-large", message: FILE_TOO_LARGE_MESSAGE },
        });
    });

    it("says text that isn't JSON isn't an OpenLeague file, or isn't the expected kind", () => {
        expect(readDocumentText("not json")).toEqual({ ok: false, error: { code: "not-a-document", message: NOT_A_DOCUMENT_MESSAGE } });
        expect(readDocumentText("not json", undefined, { kind: PLAN_FORMAT })).toEqual({ ok: false, error: { code: "not-a-document", message: NOT_A_PLAN_MESSAGE } });
    });

    it("calls an unreadable file over the expected kind's limit too large", () => {
        expect(readDocumentText("a".repeat(MAX_PLAN_FILE_BYTES + 1), undefined, { kind: PLAN_FORMAT })).toEqual({
            ok: false,
            error: { code: "too-large", message: FILE_TOO_LARGE_MESSAGE },
        });
        expect(readDocumentText("a".repeat(MAX_PLAN_FILE_BYTES), undefined, { kind: PLAN_FORMAT })).toEqual({
            ok: false,
            error: { code: "not-a-document", message: NOT_A_PLAN_MESSAGE },
        });
    });

    it("refuses another kind as that, not as too large, when one kind is expected", () => {
        expect(readDocumentText(padTo(JSON.stringify(PLAN), MAX_PLAN_FILE_BYTES + 1), undefined, { kind: RANKINGS_FORMAT })).toEqual({
            ok: false,
            error: { code: "wrong-kind", message: NOT_RANKINGS_MESSAGE },
        });
    });

    it("refuses text over every kind's limit before parsing it", () => {
        const largest = Math.max(...Object.values(DOCUMENT_KINDS).map((entry) => entry.maxBytes));
        expect(readDocumentText(padTo(JSON.stringify(wrappedRankings()), largest + ENVELOPE_OVERHEAD_BYTES + 1))).toEqual({
            ok: false,
            error: { code: "too-large", message: DOCUMENT_TOO_LARGE_MESSAGE },
        });
    });
});
