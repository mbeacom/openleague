/** The drill book: pick library drills, then print a cover, contents and one drill per page. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createHashPlatform, createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";
import { PLAY_DATA_VERSION, type PlayData } from "@/types/practice-planner";
import type { LibraryPlay } from "@/lib/planner-store";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn(() => "data:image/png;base64,AA==") }));
vi.mock("@/lib/utils/canvas/thumbnail-generator", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/thumbnail-generator")>()),
    generateThumbnail: mockGenerate,
}));
vi.mock("@/components/features/practice-planner/PlayLegend", () => ({ LegendSwatch: () => <span data-testid="swatch" /> }));

import { DRILL_BOOK_EMPTY_LIBRARY, DRILL_BOOK_LOAD_ERROR, DRILL_BOOK_NONE_CHOSEN, DRILL_UNAVAILABLE, DrillBook } from "@/components/features/practice-planner/print/DrillBook";

const playData = (step?: number): PlayData => ({
    version: PLAY_DATA_VERSION,
    players: [{ id: "a", role: "F", label: "A", position: { x: 20, y: 20 }, color: "#1976D2" }],
    drawings: [
        {
            id: "s",
            action: "carry",
            path: "straight",
            end: "arrow",
            points: [{ x: 22, y: 20 }, { x: 60, y: 20 }],
            color: "#212121",
            strokeWidth: 3,
            ...(step ? { step } : {}),
        },
    ],
    equipment: [],
    annotations: [],
});

const play = (id: string, name: string, extra: Partial<LibraryPlay> = {}): LibraryPlay => ({
    id,
    name,
    description: `${name} description`,
    thumbnail: null,
    isTemplate: true,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    updatedAt: new Date("2026-11-01T00:00:00Z"),
    playData: playData(),
    ...extra,
});

function setup(plays: LibraryPlay[], failIds: string[] = []) {
    const store = createMockPlannerStore();
    const summaries = plays.map((p) => ({ ...p, playData: undefined }));
    store.getPlaysByTeam.mockResolvedValue({ success: true, data: { plays: summaries, total: plays.length, page: 1, limit: 100 } });
    store.getPlayById.mockImplementation(async ({ id }: { id: string }) => {
        if (failIds.includes(id)) return { success: false, error: "nope" };
        const found = plays.find((p) => p.id === id);
        return found ? { success: true, data: found } : { success: false, error: "missing" };
    });
    renderWithPlanner(<DrillBook teamId="team-1" />, { store, platform: createHashPlatform() });
    return store;
}

describe("DrillBook", () => {
    it("prints every drill by default: a cover, the contents and a page per drill", async () => {
        setup([
            play("p1", "Angling", { ageGroups: ["u10", "u8"], focus: "skaters", goalies: "none", playData: playData(1) }),
            play("p2", "Rondo"),
        ]);
        const book = await screen.findByRole("region", { name: "Book" });
        expect(within(book).getByRole("heading", { level: 1, name: "Drill book" })).toBeInTheDocument();
        expect(within(book).getByText("2 drills")).toBeInTheDocument();
        const contents = within(book).getByRole("list", { name: "Contents" });
        expect(within(contents).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Angling", "Rondo"]);

        const first = await within(book).findByRole("article", { name: "Drill 1: Angling" });
        expect(within(first).getByText("8U, 10U · Skaters · No goalie")).toBeInTheDocument();
        expect(within(first).getByText("Angling description")).toBeInTheDocument();
        expect(within(first).getByRole("region", { name: "Sequence" })).toHaveTextContent("1. A: Puck carry");
        // The automatic order is never printed.
        const second = await within(book).findByRole("article", { name: "Drill 2: Rondo" });
        expect(within(second).queryByRole("region", { name: "Sequence" })).not.toBeInTheDocument();
        // Diagrams draw with their authored step numbers.
        expect(mockGenerate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ stepBadges: true }));
        // Print waits for every diagram image.
        const images = await within(book).findAllByRole("img");
        expect(screen.getByRole("button", { name: "Print" })).toBeDisabled();
        images.forEach((img) => fireEvent.load(img));
        await waitFor(() => expect(screen.getByRole("button", { name: "Print" })).toBeEnabled());
    });

    it("takes a title, and leaves out the drills the coach unchecks", async () => {
        const user = userEvent.setup();
        setup([play("p1", "Angling"), play("p2", "Rondo")]);
        const title = await screen.findByRole("textbox", { name: "Book title" });
        await user.clear(title);
        await user.type(title, "Mite skills");
        await user.click(screen.getByRole("checkbox", { name: "Rondo" }));
        const book = screen.getByRole("region", { name: "Book" });
        expect(within(book).getByRole("heading", { level: 1, name: "Mite skills" })).toBeInTheDocument();
        expect(within(book).getByText("1 drill")).toBeInTheDocument();
        expect(within(book).queryByText("Rondo")).not.toBeInTheDocument();
        expect(screen.getByText("Drills (1 of 2)")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Clear" }));
        expect(screen.getByText(DRILL_BOOK_NONE_CHOSEN)).toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Book" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Print" })).toBeDisabled();
        await user.click(screen.getByRole("button", { name: "Choose all" }));
        expect(screen.getByText("Drills (2 of 2)")).toBeInTheDocument();
    });

    it("prints a placeholder for a drill that can't be loaded", async () => {
        setup([play("p1", "Angling"), play("p2", "Rondo")], ["p2"]);
        const missing = await screen.findByText(DRILL_UNAVAILABLE);
        expect(missing.closest("article")).toHaveTextContent("2. Rondo");
        (await screen.findAllByRole("img")).forEach((img) => fireEvent.load(img));
        await waitFor(() => expect(screen.getByRole("button", { name: "Print" })).toBeEnabled());
    });

    it("says so when the library is empty", async () => {
        setup([]);
        expect(await screen.findByText(DRILL_BOOK_EMPTY_LIBRARY)).toBeInTheDocument();
    });

    it("reports a library that fails to load", async () => {
        const store = createMockPlannerStore();
        store.getPlaysByTeam.mockResolvedValue({ success: false, error: "down" });
        renderWithPlanner(<DrillBook teamId="team-1" />, { store, platform: createHashPlatform() });
        expect(await screen.findByText(DRILL_BOOK_LOAD_ERROR)).toBeInTheDocument();
    });
});
