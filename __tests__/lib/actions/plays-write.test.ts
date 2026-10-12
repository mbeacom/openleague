import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: { play: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } } }));
vi.mock("@/lib/auth/session", () => ({ requireTeamMember: vi.fn(), requireTeamAdmin: vi.fn().mockResolvedValue("user-1") }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db/prisma";
import { createPlay, updatePlay } from "@/lib/actions/plays";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const TEAM = "cjld2cjxh0000qzrmn831i7rn";
const PLAY = "cjld2cyuq0000t3rmniod1foy";

// Passes the write schema (non-blank before sanitizing) but sanitizes to "".
const controlOnly = {
    ...createEmptyPlayData(),
    annotations: [{ id: "a", text: "\u0001", position: { x: 5, y: 5 }, fontSize: 8, color: "#000000" }],
};

describe("plays write path: sanitized data is re-validated", () => {
    beforeEach(() => vi.clearAllMocks());

    it("createPlay rejects an annotation that sanitizes to blank, and stores nothing", async () => {
        const result = await createPlay({ name: "Drill", teamId: TEAM, isTemplate: false, playData: controlOnly });
        expect(result).toMatchObject({ success: false, error: "Invalid play data" });
        expect(prisma.play.create).not.toHaveBeenCalled();
    });

    it("updatePlay rejects an annotation that sanitizes to blank, and stores nothing", async () => {
        vi.mocked(prisma.play.findUnique).mockResolvedValue({ teamId: TEAM } as never);
        const result = await updatePlay({ id: PLAY, name: "Drill", teamId: TEAM, playData: controlOnly });
        expect(result).toMatchObject({ success: false, error: "Invalid play data" });
        expect(prisma.play.update).not.toHaveBeenCalled();
    });

    it("createPlay still saves clean data", async () => {
        vi.mocked(prisma.play.create).mockResolvedValue({ id: PLAY, name: "Drill", isTemplate: false } as never);
        const playData = { ...controlOnly, annotations: [{ ...controlOnly.annotations[0], text: "Go\u0001" }] };
        const result = await createPlay({ name: "Drill", teamId: TEAM, isTemplate: false, playData });
        expect(result.success).toBe(true);
        const stored = vi.mocked(prisma.play.create).mock.calls[0][0].data.playData as { annotations: { text: string }[] };
        expect(stored.annotations[0].text).toBe("Go");
    });
});

describe("plays write path: video links (practice video links R3, R12)", () => {
    beforeEach(() => vi.clearAllMocks());
    const YT = "Ab3dE5fG7hJ";

    it("createPlay refuses a non-https link through the shared parser, and stores nothing", async () => {
        const playData = { ...createEmptyPlayData(), videos: [{ url: "http://example.org/clip", provider: "link" as const }] };
        const result = await createPlay({ name: "Drill", teamId: TEAM, isTemplate: false, playData });
        expect(result).toMatchObject({ success: false, error: "Video link: Use an https link" });
        expect(prisma.play.create).not.toHaveBeenCalled();
    });

    it("updatePlay refuses a sixth link, and stores nothing", async () => {
        vi.mocked(prisma.play.findUnique).mockResolvedValue({ teamId: TEAM } as never);
        const videos = [1, 2, 3, 4, 5, 6].map((n) => ({ url: `https://example.org/${n}`, provider: "link" as const }));
        const result = await updatePlay({ id: PLAY, name: "Drill", teamId: TEAM, playData: { ...createEmptyPlayData(), videos } });
        expect(result).toMatchObject({ success: false, error: "Video link: Up to 5 videos per drill" });
        expect(prisma.play.update).not.toHaveBeenCalled();
    });

    it("createPlay stores links normalized, with the provider corrected", async () => {
        vi.mocked(prisma.play.create).mockResolvedValue({ id: PLAY, name: "Drill", isTemplate: false } as never);
        const playData = { ...createEmptyPlayData(), videos: [{ url: `https://youtu.be/${YT}?si=abc&t=90`, provider: "link" as const, title: "Breakout demo" }] };
        const result = await createPlay({ name: "Drill", teamId: TEAM, isTemplate: false, playData });
        expect(result.success).toBe(true);
        const stored = vi.mocked(prisma.play.create).mock.calls[0][0].data.playData as { videos: unknown };
        expect(stored.videos).toEqual([{ url: `https://www.youtube.com/watch?v=${YT}`, provider: "youtube", startSec: 90, title: "Breakout demo" }]);
    });
});
