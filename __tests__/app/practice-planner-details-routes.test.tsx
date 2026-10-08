/**
 * Hosted details routes: the drill details page (the library's admin-only rule,
 * not-found, unreadable diagrams, the practice count), a new practice started
 * from a drill, and the practice list's card opening details with Edit secondary.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createEmptyPlayData, PLAY_DATA_UNREADABLE_CODE } from "@/lib/utils/play-data";

const mocks = vi.hoisted(() => ({
    getPlayLibraryContext: vi.fn(),
    getPlayById: vi.fn(),
    findMany: vi.fn(),
    notFound: vi.fn(() => {
        throw new Error("NEXT_NOT_FOUND");
    }),
    redirect: vi.fn((to: string) => {
        throw new Error(`NEXT_REDIRECT:${to}`);
    }),
    viewProps: null as null | Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({
    notFound: () => mocks.notFound(),
    redirect: (to: string) => mocks.redirect(to),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions/practice-session-queries", () => ({ getPlayLibraryContext: () => mocks.getPlayLibraryContext() }));
vi.mock("@/lib/actions/plays", () => ({ getPlayById: (input: unknown) => mocks.getPlayById(input) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { practiceSessionPlay: { findMany: (args: unknown) => mocks.findMany(args) } } }));
vi.mock("@/components/features/practice-planner/DrillDetailView", () => ({
    DrillDetailView: (props: Record<string, unknown>) => {
        mocks.viewProps = props;
        return <div data-testid="drill-detail">{(props.play as { name: string }).name}</div>;
    },
}));

import DrillDetailPage from "@/app/(dashboard)/practice-planner/library/[playId]/page";
import { startingDrillRows } from "@/app/(dashboard)/practice-planner/new/starting-drill";
import PracticePlannerList from "@/app/(dashboard)/practice-planner/PracticePlannerList";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const PLAY_ID = "cplayxxxxxxxxxxxxxxxxxxxx";
const params = () => Promise.resolve({ playId: PLAY_ID });
const PLAY = {
    id: PLAY_ID,
    name: "Hilltop Breakout",
    description: "Wheel behind the net.",
    thumbnail: null,
    playData: createEmptyPlayData(),
    isTemplate: true,
    focus: "team",
    goalies: "optional",
    ageGroups: [],
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-01T00:00:00Z"),
};

beforeEach(() => {
    vi.clearAllMocks();
    mocks.viewProps = null;
    mocks.getPlayLibraryContext.mockResolvedValue({ teamId: TEAM, teamName: "Hilltop 912", isAdmin: true });
    mocks.getPlayById.mockResolvedValue({ success: true, data: PLAY });
    mocks.findMany.mockResolvedValue([{ sessionId: "s1" }, { sessionId: "s2" }]);
});

describe("drill details page", () => {
    it("shows an admin the drill, with editing allowed and the practice count", async () => {
        render(await DrillDetailPage({ params: params() }));
        expect(screen.getByTestId("drill-detail")).toHaveTextContent("Hilltop Breakout");
        expect(mocks.getPlayById).toHaveBeenCalledWith({ id: PLAY_ID, teamId: TEAM });
        expect(mocks.viewProps).toMatchObject({ teamId: TEAM, canEdit: true, usageCount: 2 });
        // Counted per practice, within the team, for the drill and copies made from it.
        expect(mocks.findMany).toHaveBeenCalledWith({
            where: { session: { teamId: TEAM }, OR: [{ playId: PLAY_ID }, { play: { sourcePlayId: PLAY_ID } }] },
            select: { sessionId: true },
            distinct: ["sessionId"],
        });
    });

    it("keeps the library's admin-only rule for members", async () => {
        mocks.getPlayLibraryContext.mockResolvedValue({ teamId: TEAM, teamName: "Hilltop 912", isAdmin: false });
        render(await DrillDetailPage({ params: params() }));
        expect(screen.getByText("Only team admins can access the play library.")).toBeInTheDocument();
        expect(screen.queryByTestId("drill-detail")).toBeNull();
        expect(mocks.getPlayById).not.toHaveBeenCalled();
        expect(mocks.findMany).not.toHaveBeenCalled();
    });

    it("sends someone with no team to the dashboard", async () => {
        mocks.getPlayLibraryContext.mockResolvedValue(null);
        await expect(DrillDetailPage({ params: params() })).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    });

    it("404s a drill that isn't in the team's library, without counting anything", async () => {
        mocks.getPlayById.mockResolvedValue({ success: false, error: "Play not found" });
        await expect(DrillDetailPage({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
        expect(mocks.findMany).not.toHaveBeenCalled();
    });

    it("404s an unowned legacy play that isn't a library template, without counting anything", async () => {
        mocks.getPlayById.mockResolvedValue({ success: true, data: { ...PLAY, isTemplate: false } });
        await expect(DrillDetailPage({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
        expect(mocks.findMany).not.toHaveBeenCalled();
    });

    it("explains an unreadable diagram instead of drawing an empty board", async () => {
        mocks.getPlayById.mockResolvedValue({ success: false, error: "This drill's diagram can't be read.", details: { code: PLAY_DATA_UNREADABLE_CODE } });
        render(await DrillDetailPage({ params: params() }));
        expect(screen.getByText("This drill's diagram can't be read.")).toBeInTheDocument();
        expect(screen.queryByTestId("drill-detail")).toBeNull();
    });
});

describe("a new practice started from a drill", () => {
    it("starts with the drill as its first row", async () => {
        const rows = await startingDrillRows(PLAY_ID, TEAM);
        expect(mocks.getPlayById).toHaveBeenCalledWith({ id: PLAY_ID, teamId: TEAM });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ playId: PLAY_ID, name: "Hilltop Breakout", duration: 10, instructions: "Wheel behind the net." });
    });

    it("starts empty without a drill, with a repeated parameter, or when the drill can't be read", async () => {
        expect(await startingDrillRows(undefined, TEAM)).toEqual([]);
        expect(await startingDrillRows([PLAY_ID, PLAY_ID], TEAM)).toEqual([]);
        expect(mocks.getPlayById).not.toHaveBeenCalled();
        mocks.getPlayById.mockResolvedValue({ success: false, error: "Invalid play ID format" });
        expect(await startingDrillRows("not-an-id", TEAM)).toEqual([]);
    });

    it("starts empty for an unowned legacy play that isn't a library template, as a missing drill", async () => {
        mocks.getPlayById.mockResolvedValue({ success: true, data: { ...PLAY, isTemplate: false } });
        expect(await startingDrillRows(PLAY_ID, TEAM)).toEqual([]);
    });
});

describe("practice list cards", () => {
    const SESSION = {
        id: "csessionxxxxxxxxxxxxxxxxx",
        title: "Riverside Tuesday",
        date: "2026-10-13T23:00:00.000Z",
        duration: 60,
        isShared: true,
        createdByName: "Coach",
        playCount: 2,
        firstPlayThumbnail: null,
    };

    it("open the details page, with Edit as an admin's secondary action", () => {
        render(<PracticePlannerList sessions={[SESSION]} teamId={TEAM} teamName="Riverside 901" isAdmin canImport />);
        const title = screen.getByText("Riverside Tuesday");
        expect(title.closest("a")).toHaveAttribute("href", `/practice-planner/${SESSION.id}`);
        expect(screen.getByRole("link", { name: "Edit Riverside Tuesday" })).toHaveAttribute("href", `/practice-planner/${SESSION.id}/edit`);
    });

    it("open the details page for a member, who gets no Edit", () => {
        render(<PracticePlannerList sessions={[SESSION]} teamId={TEAM} teamName="Riverside 901" isAdmin={false} canImport={false} />);
        expect(screen.getByText("Riverside Tuesday").closest("a")).toHaveAttribute("href", `/practice-planner/${SESSION.id}`);
        expect(screen.queryByRole("link", { name: "Edit Riverside Tuesday" })).toBeNull();
    });
});
