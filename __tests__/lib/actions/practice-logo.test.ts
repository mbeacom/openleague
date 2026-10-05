// @vitest-environment node
/** getPracticeLogoImage (practice logo spec R1, R6): id first, the detail read's access rule, owned blob URLs only, null on any failure. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const { mockPrisma, mockUserId } = vi.hoisted(() => ({
    mockPrisma: { practiceSession: { findUnique: vi.fn() }, teamMember: { findFirst: vi.fn() } },
    mockUserId: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUserId: mockUserId }));

import { getPracticeLogoImage } from "@/lib/actions/practice-logo";
import { isLogoImage } from "@/lib/utils/team-mark";

const SESSION_ID = "clsession00000000000000001";
const TEAM_ID = "clteam000000000000000000001";
const USER_ID = "cluser000000000000000000001";
// The fake store the stubbed token names: ownership is pinned to it.
const BLOB_TOKEN = "vercel_blob_rw_Abc_notARealSecret";
const OWNED = `https://abc.public.blob.vercel-storage.com/branding/team/${TEAM_ID}/logo-a1.png`;

let fetchMock: ReturnType<typeof vi.fn>;

async function pngBytes(width = 800, height = 400) {
    return new Uint8Array(await sharp({ create: { width, height, channels: 4, background: "#9B1B30" } }).png().toBuffer());
}

function session(overrides: { logoUrl?: string | null; isShared?: boolean } = {}) {
    return { teamId: TEAM_ID, isShared: overrides.isShared ?? false, team: { logoUrl: overrides.logoUrl === undefined ? OWNED : overrides.logoUrl } };
}

beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", BLOB_TOKEN);
    mockUserId.mockResolvedValue(USER_ID);
    mockPrisma.practiceSession.findUnique.mockResolvedValue(session());
    mockPrisma.teamMember.findFirst.mockResolvedValue({ role: "ADMIN" });
    const bytes = await pngBytes();
    fetchMock = vi.fn(async () => new Response(bytes));
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("getPracticeLogoImage", () => {
    it("returns the team logo as a normalized PNG for an admin", async () => {
        const logo = await getPracticeLogoImage(SESSION_ID);
        expect(logo).toMatchObject({ width: 512, height: 256 });
        expect(isLogoImage(logo)).toBe(true);
        expect(JSON.stringify(logo)).not.toContain("blob.vercel-storage.com");
        expect(fetchMock).toHaveBeenCalledWith(OWNED, expect.objectContaining({ redirect: "error" }));
        expect(mockPrisma.practiceSession.findUnique).toHaveBeenCalledWith({
            where: { id: SESSION_ID },
            select: { teamId: true, isShared: true, team: { select: { logoUrl: true } } },
        });
        expect(mockPrisma.teamMember.findFirst).toHaveBeenCalledWith({ where: { userId: USER_ID, teamId: TEAM_ID }, select: { role: true } });
    });

    it("returns it to a member when the practice is shared, as the detail read does", async () => {
        mockPrisma.teamMember.findFirst.mockResolvedValue({ role: "MEMBER" });
        mockPrisma.practiceSession.findUnique.mockResolvedValue(session({ isShared: true }));
        expect(await getPracticeLogoImage(SESSION_ID)).not.toBeNull();
    });

    it.each([
        ["a member of an unshared practice", () => mockPrisma.teamMember.findFirst.mockResolvedValue({ role: "MEMBER" })],
        ["someone outside the team", () => mockPrisma.teamMember.findFirst.mockResolvedValue(null)],
        ["a missing practice", () => mockPrisma.practiceSession.findUnique.mockResolvedValue(null)],
        ["a team without a logo", () => mockPrisma.practiceSession.findUnique.mockResolvedValue(session({ logoUrl: null }))],
        ["another team's blob", () => mockPrisma.practiceSession.findUnique.mockResolvedValue(session({ logoUrl: "https://abc.public.blob.vercel-storage.com/branding/team/clother0000000000000000001/x.png" }))],
        ["a URL off our blob host", () => mockPrisma.practiceSession.findUnique.mockResolvedValue(session({ logoUrl: `https://example.com/branding/team/${TEAM_ID}/x.png` }))],
        ["another blob store", () => mockPrisma.practiceSession.findUnique.mockResolvedValue(session({ logoUrl: `https://other.public.blob.vercel-storage.com/branding/team/${TEAM_ID}/x.png` }))],
        ["no blob store configured", () => vi.stubEnv("BLOB_READ_WRITE_TOKEN", undefined)],
    ])("returns null without fetching for %s", async (_label, arrange) => {
        arrange();
        expect(await getPracticeLogoImage(SESSION_ID)).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("checks the id before reading the user or the database", async () => {
        for (const bad of ["", "not-an-id", "x".repeat(400), { not: SESSION_ID }, null] as unknown[]) {
            expect(await getPracticeLogoImage(bad as string)).toBeNull();
        }
        expect(mockUserId).not.toHaveBeenCalled();
        expect(mockPrisma.practiceSession.findUnique).not.toHaveBeenCalled();
    });

    it("returns null for a signed-out caller, without redirecting or querying", async () => {
        mockUserId.mockResolvedValue(null);
        expect(await getPracticeLogoImage(SESSION_ID)).toBeNull();
        expect(mockPrisma.practiceSession.findUnique).not.toHaveBeenCalled();
    });

    it("returns null for a body that isn't an image, judged by its bytes, and logs it without the URL", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        fetchMock.mockResolvedValue(new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', { headers: { "content-type": "image/png" } }));
        expect(await getPracticeLogoImage(SESSION_ID)).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(warn.mock.calls)).not.toContain(OWNED);
    });

    it("returns null for a PNG over 2 MB, stopped by the size cap before decoding, and for a failed response", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        // A real PNG signature padded past 2 MB: without the cap it would reach sharp and log a decode error instead.
        const oversize = new Uint8Array(2 * 1024 * 1024 + 1);
        oversize.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        fetchMock.mockResolvedValueOnce(new Response(oversize));
        expect(await getPracticeLogoImage(SESSION_ID)).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith("Practice logo unavailable: the response failed or was over the size cap");
        fetchMock.mockResolvedValueOnce(new Response("gone", { status: 404 }));
        expect(await getPracticeLogoImage(SESSION_ID)).toBeNull();
        expect(warn).toHaveBeenCalledTimes(2);
    });

    it("returns null on a timeout or a network error, and logs neither the URL nor an id", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        fetchMock.mockRejectedValueOnce(new DOMException("The operation timed out.", "TimeoutError"));
        expect(await getPracticeLogoImage(SESSION_ID)).toBeNull();
        fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
        expect(await getPracticeLogoImage(SESSION_ID)).toBeNull();
        const logged = JSON.stringify(warn.mock.calls);
        expect(warn).toHaveBeenCalledTimes(2);
        for (const secret of [OWNED, SESSION_ID, TEAM_ID, USER_ID]) expect(logged).not.toContain(secret);
    });

    it.each([
        ["the session read fails", () => mockUserId.mockRejectedValue(new Error(`session ${USER_ID}`))],
        ["the practice read fails", () => mockPrisma.practiceSession.findUnique.mockRejectedValue(new Error(`query ${SESSION_ID}`))],
        ["the membership read fails", () => mockPrisma.teamMember.findFirst.mockRejectedValue(new Error(`query ${TEAM_ID}`))],
    ])("returns null when %s, logging the error type only", async (_label, arrange) => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        arrange();
        expect(await getPracticeLogoImage(SESSION_ID)).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith("Practice logo unavailable:", "Error");
    });

    it("returns null for a corrupt image", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        fetchMock.mockResolvedValue(new Response((await pngBytes()).slice(0, 40)));
        expect(await getPracticeLogoImage(SESSION_ID)).toBeNull();
    });
});
