/** The age filter in the drill library and the session editor's drill picker (R3). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createHashPlatform, createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";
import { AGE_FILTER_STORAGE_KEY } from "@/lib/utils/age-groups";
import { createEmptyPlayData } from "@/lib/utils/play-data";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "data:image/png;base64,AA==" }));

import { PlayLibrary } from "@/components/features/practice-planner/PlayLibrary";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const AT = new Date("2026-04-01T00:00:00Z");
const summary = (id: string, name: string, extra: Record<string, unknown> = {}) =>
    ({ id, name, description: null, thumbnail: null, isTemplate: true, createdAt: AT, updatedAt: AT, ...extra });
const KEEP_AWAY = summary("cplay1xxxxxxxxxxxxxxxxxxx", "My Keep-Away", { ageGroups: ["u6", "u8"] });
const FOUR_ON_FOUR = summary("cplay2xxxxxxxxxxxxxxxxxxx", "My 4-on-4", { ageGroups: ["u12", "u14"] });
const page = (plays: unknown[]) => ({ success: true, data: { plays, total: plays.length, page: 1, limit: 20 } });

function renderLibrary(plays: unknown[] = [KEEP_AWAY, FOUR_ON_FOUR], mode: "manage" | "select" = "manage") {
    const store = createMockPlannerStore();
    store.getPlaysByTeam.mockResolvedValue(page(plays));
    const onSelectPlay = vi.fn();
    const view = renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <PlayLibrary teamId={TEAM} mode={mode} onSelectPlay={onSelectPlay} />
        </ThemeProvider>,
        { store, platform: createHashPlatform() },
    );
    return { store, onSelectPlay, view };
}

const ageChip = (name: string) => within(screen.getByRole("group", { name: "Age group" })).getByRole("button", { name });
const cardOf = (text: string) => screen.getByText(text).closest(".MuiCard-root") as HTMLElement;

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("PlayLibrary: age filter", () => {
    it("asks for the chosen age from page 1, and remembers it on this device", async () => {
        const { store, view } = renderLibrary();
        await screen.findByText("My Keep-Away");
        expect(store.getPlaysByTeam.mock.lastCall?.[0]).not.toHaveProperty("ageGroup");
        fireEvent.click(ageChip("8U"));
        await waitFor(() => expect(store.getPlaysByTeam).toHaveBeenLastCalledWith(expect.objectContaining({ ageGroup: "u8", page: 1 })));
        expect(localStorage.getItem(AGE_FILTER_STORAGE_KEY)).toBe("u8");

        view.unmount();
        const again = renderLibrary();
        await screen.findByText("My Keep-Away");
        // The remount also reads the library's names (an unfiltered query), so look for the filtered load among the calls.
        expect(again.store.getPlaysByTeam).toHaveBeenCalledWith(expect.objectContaining({ ageGroup: "u8", limit: 20 }));
        expect(ageChip("8U")).toHaveAttribute("aria-pressed", "true");
    });

    it("filters the starter cards by the same rule: untagged starters show for every age", async () => {
        renderLibrary([]);
        await screen.findByText("Keep-Away in a Box");
        fireEvent.click(ageChip("16U+"));
        await waitFor(() => expect(screen.queryByText("Keep-Away in a Box")).toBeNull());
        expect(screen.getByText("Goalie Warm-Up")).toBeInTheDocument();
        expect(screen.getByText("4-on-4 Cross-Ice Game")).toBeInTheDocument();
    });

    it("says when no drill matches the age, and Show all ages clears the filter", async () => {
        localStorage.setItem(AGE_FILTER_STORAGE_KEY, "u8");
        const { store } = renderLibrary([], "select");
        expect(await screen.findByText("No drills for 8U yet.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Show all ages" }));
        await waitFor(() => expect(store.getPlaysByTeam.mock.lastCall?.[0]).not.toHaveProperty("ageGroup"));
        expect(localStorage.getItem(AGE_FILTER_STORAGE_KEY)).toBeNull();
        expect(ageChip("All ages")).toHaveAttribute("aria-pressed", "true");
    });

    it("does not say no drills match while starter cards for that age are showing", async () => {
        localStorage.setItem(AGE_FILTER_STORAGE_KEY, "u8");
        renderLibrary([]);
        expect(await screen.findByText("Keep-Away in a Box")).toBeInTheDocument();
        expect(screen.queryByText("No drills for 8U yet.")).toBeNull();
        expect(screen.queryByRole("button", { name: "Show all ages" })).toBeNull();
    });

    it("shows the latest answer when an earlier, slower one arrives after it", async () => {
        const store = createMockPlannerStore();
        let releaseFirst: (value: unknown) => void = () => undefined;
        store.getPlaysByTeam
            .mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = resolve)))
            .mockResolvedValue(page([FOUR_ON_FOUR]));
        renderWithPlanner(
            <ThemeProvider theme={createTheme()}>
                <PlayLibrary teamId={TEAM} mode="select" />
            </ThemeProvider>,
            { store, platform: createHashPlatform() },
        );
        fireEvent.click(ageChip("12U"));
        expect(await screen.findByText("My 4-on-4")).toBeInTheDocument();
        await act(async () => releaseFirst(page([KEEP_AWAY])));
        expect(screen.queryByText("My Keep-Away")).toBeNull();
        expect(screen.getByText("My 4-on-4")).toBeInTheDocument();
    });

    it("offers the filter in the drill picker and hands a picked drill over with its ages", async () => {
        const { store, onSelectPlay } = renderLibrary([KEEP_AWAY], "select");
        store.getPlayById.mockResolvedValue({ success: true, data: { ...KEEP_AWAY, playData: createEmptyPlayData(), focus: "skaters", goalies: "none" } });
        expect(await screen.findByRole("group", { name: "Age group" })).toBeInTheDocument();
        fireEvent.click(cardOf("My Keep-Away"));
        await waitFor(() => expect(onSelectPlay).toHaveBeenCalledWith(expect.objectContaining({ name: "My Keep-Away", ageGroups: ["u6", "u8"] })));
    });
});
