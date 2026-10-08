// @vitest-environment node
/** Hosted rankings actions (ADR-0025): sign-in first, owner-scoped, the portable parser on every write. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockRequireUserId } = vi.hoisted(() => ({
    mockPrisma: {
        rankingsRecord: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
            count: vi.fn(),
            create: vi.fn(),
            updateMany: vi.fn(),
            deleteMany: vi.fn(),
        },
    },
    mockRequireUserId: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUserId: mockRequireUserId }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
    clearRankingsRecord,
    createRankingsRecord,
    deleteRankingsRecord,
    getRankingsRecord,
    listRankingsRecords,
    saveRankingsRecord,
} from "@/lib/actions/rankings";
import { MAX_RANKINGS_FILE_BYTES, RANKINGS_TOO_LARGE_TO_SAVE_MESSAGE, serializeRankings, withTeamLogo } from "@/lib/rankings-document";
import { logoPng } from "@/__tests__/helpers/logo-png";
import { sampleRankingsDoc } from "@/__tests__/apps/planner/rankings-fixtures";

const USER_ID = "cluser000000000000000000001";
const RECORD_ID = "clrank000000000000000000001";

beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUserId.mockResolvedValue(USER_ID);
});

describe("listRankingsRecords", () => {
    it("lists only the caller's records, newest first, and marks cleared ones", async () => {
        const updatedAt = new Date("2026-10-01T00:00:00Z");
        mockPrisma.rankingsRecord.findMany
            .mockResolvedValueOnce([{ id: RECORD_ID, title: "Fall Pre-season", updatedAt }])
            .mockResolvedValueOnce([{ id: RECORD_ID }]);
        const result = await listRankingsRecords();
        expect(result).toEqual({ success: true, data: [{ id: RECORD_ID, title: "Fall Pre-season", updatedAt, hasDocument: false }] });
        const [first, second] = mockPrisma.rankingsRecord.findMany.mock.calls.map((call) => call[0]);
        expect(first.where).toEqual({ ownerId: USER_ID });
        expect(first.orderBy).toEqual({ updatedAt: "desc" });
        expect(second.where).toEqual({ ownerId: USER_ID, document: { equals: Prisma.DbNull } });
    });
});

describe("createRankingsRecord", () => {
    it("creates an empty record for the caller", async () => {
        mockPrisma.rankingsRecord.count.mockResolvedValue(0);
        mockPrisma.rankingsRecord.create.mockResolvedValue({ id: RECORD_ID });
        const result = await createRankingsRecord({});
        expect(result).toEqual({ success: true, data: { id: RECORD_ID } });
        expect(mockPrisma.rankingsRecord.create).toHaveBeenCalledWith({
            data: { ownerId: USER_ID, title: "Pre-season rankings", document: Prisma.DbNull },
            select: { id: true },
        });
    });

    it("creates a record from a rankings file, logos included", async () => {
        mockPrisma.rankingsRecord.count.mockResolvedValue(3);
        mockPrisma.rankingsRecord.create.mockResolvedValue({ id: RECORD_ID });
        const withLogo = withTeamLogo(sampleRankingsDoc(), "902", { dataUrl: logoPng(64, 64), width: 64, height: 64 });
        if (!withLogo.ok) throw new Error("expected a logo");
        const result = await createRankingsRecord({ document: JSON.parse(serializeRankings(withLogo.doc)) });
        expect(result.success).toBe(true);
        const data = mockPrisma.rankingsRecord.create.mock.calls[0][0].data;
        expect(data.title).toBe("Fall Pre-season");
        expect(data.document.teams[1].logo.width).toBe(64);
    });

    it("refuses an invalid document without writing", async () => {
        const result = await createRankingsRecord({ document: { format: "openleague.rankings", version: 1, teams: "nope" } });
        expect(result.success).toBe(false);
        expect(mockPrisma.rankingsRecord.create).not.toHaveBeenCalled();
    });

    it("caps the records one user keeps", async () => {
        mockPrisma.rankingsRecord.count.mockResolvedValue(20);
        const result = await createRankingsRecord({});
        expect(result).toEqual({ success: false, error: expect.stringContaining("up to 20") });
        expect(mockPrisma.rankingsRecord.create).not.toHaveBeenCalled();
    });
});

describe("getRankingsRecord", () => {
    it("reads only the caller's record and parses it", async () => {
        mockPrisma.rankingsRecord.findFirst.mockResolvedValue({ id: RECORD_ID, title: "Fall Pre-season", document: sampleRankingsDoc() });
        const result = await getRankingsRecord(RECORD_ID);
        expect(result.success && result.data.document?.teams).toHaveLength(4);
        expect(mockPrisma.rankingsRecord.findFirst.mock.calls[0][0].where).toEqual({ id: RECORD_ID, ownerId: USER_ID });
    });

    it("reads someone else's record as not found", async () => {
        mockPrisma.rankingsRecord.findFirst.mockResolvedValue(null);
        expect(await getRankingsRecord(RECORD_ID)).toEqual({ success: false, error: "Those rankings weren't found." });
    });

    it("returns null for a cleared record and an error for a damaged one", async () => {
        mockPrisma.rankingsRecord.findFirst.mockResolvedValueOnce({ id: RECORD_ID, title: "T", document: null });
        expect(await getRankingsRecord(RECORD_ID)).toEqual({ success: true, data: { id: RECORD_ID, title: "T", document: null } });
        mockPrisma.rankingsRecord.findFirst.mockResolvedValueOnce({ id: RECORD_ID, title: "T", document: { format: "openleague.rankings", version: 1 } });
        const damaged = await getRankingsRecord(RECORD_ID);
        expect(damaged.success).toBe(false);
    });

    it("refuses a malformed id before any query", async () => {
        expect((await getRankingsRecord("../x")).success).toBe(false);
        expect(mockPrisma.rankingsRecord.findFirst).not.toHaveBeenCalled();
    });
});

describe("saveRankingsRecord", () => {
    it("saves a valid document to the caller's record and mirrors its title", async () => {
        mockPrisma.rankingsRecord.updateMany.mockResolvedValue({ count: 1 });
        const result = await saveRankingsRecord({ id: RECORD_ID, document: sampleRankingsDoc() });
        expect(result.success).toBe(true);
        const call = mockPrisma.rankingsRecord.updateMany.mock.calls[0][0];
        expect(call.where).toEqual({ id: RECORD_ID, ownerId: USER_ID });
        expect(call.data.title).toBe("Fall Pre-season");
    });

    it("reports a record that isn't the caller's as not found", async () => {
        mockPrisma.rankingsRecord.updateMany.mockResolvedValue({ count: 0 });
        expect((await saveRankingsRecord({ id: RECORD_ID, document: sampleRankingsDoc() })).success).toBe(false);
    });

    it("refuses a document past the file cap before parsing it", async () => {
        const doc = sampleRankingsDoc({ meta: { title: "Big", ageGroup: null, seasonLabel: null, source: "x".repeat(MAX_RANKINGS_FILE_BYTES) } });
        const result = await saveRankingsRecord({ id: RECORD_ID, document: doc });
        expect(result).toEqual({ success: false, error: expect.stringContaining("too large") });
        expect(mockPrisma.rankingsRecord.updateMany).not.toHaveBeenCalled();
    });

    it("refuses a document whose file, in UTF-8 bytes, is past the cap", async () => {
        mockPrisma.rankingsRecord.updateMany.mockResolvedValue({ count: 1 });
        // Under the cap in characters, so only the canonical byte count catches it.
        const doc = { ...sampleRankingsDoc(), snapshots: ["é".repeat(MAX_RANKINGS_FILE_BYTES / 2)] };
        const result = await saveRankingsRecord({ id: RECORD_ID, document: doc });
        expect(result).toEqual({ success: false, error: RANKINGS_TOO_LARGE_TO_SAVE_MESSAGE });
        expect(mockPrisma.rankingsRecord.updateMany).not.toHaveBeenCalled();
    });

    it("refuses an invalid document", async () => {
        const doc = { ...sampleRankingsDoc(), myTeam: "999" };
        const result = await saveRankingsRecord({ id: RECORD_ID, document: doc });
        expect(result.success).toBe(false);
        expect(mockPrisma.rankingsRecord.updateMany).not.toHaveBeenCalled();
    });
});

describe("clearRankingsRecord and deleteRankingsRecord", () => {
    it("clears the caller's record to an empty document", async () => {
        mockPrisma.rankingsRecord.updateMany.mockResolvedValue({ count: 1 });
        expect(await clearRankingsRecord(RECORD_ID)).toEqual({ success: true, data: null });
        expect(mockPrisma.rankingsRecord.updateMany).toHaveBeenCalledWith({ where: { id: RECORD_ID, ownerId: USER_ID }, data: { document: Prisma.DbNull } });
    });

    it("deletes only the caller's record", async () => {
        mockPrisma.rankingsRecord.deleteMany.mockResolvedValue({ count: 1 });
        expect(await deleteRankingsRecord(RECORD_ID)).toEqual({ success: true, data: { id: RECORD_ID } });
        expect(mockPrisma.rankingsRecord.deleteMany).toHaveBeenCalledWith({ where: { id: RECORD_ID, ownerId: USER_ID } });
        mockPrisma.rankingsRecord.deleteMany.mockResolvedValue({ count: 0 });
        expect((await deleteRankingsRecord(RECORD_ID)).success).toBe(false);
    });
});

describe("revalidation", () => {
    const paths = () => vi.mocked(revalidatePath).mock.calls.map((call) => call[0]);

    it("revalidates the hosted list after a create", async () => {
        mockPrisma.rankingsRecord.count.mockResolvedValue(0);
        mockPrisma.rankingsRecord.create.mockResolvedValue({ id: RECORD_ID });
        await createRankingsRecord({});
        expect(paths()).toEqual(["/rankings"]);
    });

    it("revalidates the list and the record after a save, a clear and a delete", async () => {
        mockPrisma.rankingsRecord.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.rankingsRecord.deleteMany.mockResolvedValue({ count: 1 });
        for (const run of [
            () => saveRankingsRecord({ id: RECORD_ID, document: sampleRankingsDoc() }),
            () => clearRankingsRecord(RECORD_ID),
            () => deleteRankingsRecord(RECORD_ID),
        ]) {
            vi.mocked(revalidatePath).mockClear();
            expect((await run()).success).toBe(true);
            expect(paths()).toEqual(["/rankings", `/rankings/${RECORD_ID}`]);
        }
    });
});
