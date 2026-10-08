/** The editor's Roster section and Suggested drills (roster and suggestions spec R2–R4, R7–R9, R13, R14). */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { SESSION, TEAM, drill, renderEditor, save, stubResizeObserver } from "@/__tests__/helpers/session-editor";
import { EMPTY_LIBRARY_PAGE, createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";
import { PracticeSessionEditor } from "@/components/features/practice-planner/PracticeSessionEditor";
import { STARTER_PLAYS } from "@/lib/data/starter-plays";
import type { PracticeRoster, RosterOption } from "@/lib/utils/practice-roster";
import type { PracticeSessionData, SessionItem } from "@/types/practice-planner";

beforeAll(stubResizeObserver);

const sent = (onSave: { mock: { calls: unknown[][] } }, call = 0) => onSave.mock.calls[call][0] as { roster?: PracticeRoster | null; plays: SessionItem[]; goaliesAttending?: number | null };

const ROSTER: PracticeRoster = {
    ageGroup: "u8",
    roles: ["S", "G"],
    players: [
        { key: "r1", name: "Alex", number: "7", role: "S", playerId: null },
        { key: "r2", name: "", number: "", role: "G", playerId: null },
    ],
};

async function pick(label: string, option: string) {
    fireEvent.mouseDown(screen.getByRole("combobox", { name: label }));
    fireEvent.click(await screen.findByRole("option", { name: option }));
}

function rosterSection() {
    return screen.getByRole("region", { name: "Roster" });
}

describe("PracticeSessionEditor: the Roster section", () => {
    it("sends no roster when the practice had none and the coach never touched it", async () => {
        const onSave = renderEditor([drill("k1", 0)]);
        fireEvent.change(screen.getByLabelText(/^Session Title/), { target: { value: "Renamed" } });
        await save();
        expect(sent(onSave)).not.toHaveProperty("roster");
    });

    it("sends a loaded roster back unchanged after an unrelated edit", async () => {
        const onSave = renderEditor([drill("k1", 0)], { roster: ROSTER });
        fireEvent.change(screen.getByLabelText(/^Session Title/), { target: { value: "Renamed" } });
        await save();
        expect(sent(onSave).roster).toEqual(ROSTER);
    });

    it("builds a roster: age sets the positions, players take a number, a name and a position", async () => {
        const onSave = renderEditor([drill("k1", 0)]);
        const section = rosterSection();
        expect(within(section).getByText("No players yet")).toBeInTheDocument();
        await pick("Age group", "8U");
        fireEvent.click(within(section).getByRole("button", { name: "Add player" }));
        fireEvent.click(within(section).getByRole("button", { name: "Add player" }));
        fireEvent.change(screen.getByRole("textbox", { name: "Number for Skater 1" }), { target: { value: "7a" } });
        fireEvent.change(screen.getByRole("textbox", { name: "Name for #7" }), { target: { value: "Riley" } });
        await pick("Position for Skater 2", "Goalie");
        expect(within(section).getByText("1 skater · 1 goalie")).toBeInTheDocument();
        await save();
        expect(sent(onSave).roster).toEqual({
            ageGroup: "u8",
            roles: ["S", "G"],
            players: [
                { key: expect.any(String), name: "Riley", number: "7", role: "S" },
                { key: expect.any(String), name: "", number: "", role: "G" },
            ],
        });
    });

    it("switches to forward, defense and goalie for an older age and moves skaters onto forward", async () => {
        const onSave = renderEditor([drill("k1", 0)], { roster: ROSTER });
        await pick("Age group", "12U");
        const positions = within(rosterSection()).getByRole("group", { name: "Positions" });
        expect(within(positions).getByRole("button", { name: "Forward", pressed: true })).toBeInTheDocument();
        expect(within(positions).getByRole("button", { name: "Defense", pressed: true })).toBeInTheDocument();
        expect(within(positions).getByRole("button", { name: "Skater", pressed: false })).toBeInTheDocument();
        await save();
        expect(sent(onSave).roster?.roles).toEqual(["F", "D", "G"]);
        expect(sent(onSave).roster?.players.map((player) => player.role)).toEqual(["F", "G"]);
    });

    it("adds a custom position that counts as a skater, and refuses a built-in name", async () => {
        renderEditor([drill("k1", 0)], { roster: ROSTER });
        fireEvent.click(within(rosterSection()).getByRole("button", { name: "Add position" }));
        fireEvent.change(screen.getByRole("textbox", { name: "Position name" }), { target: { value: "Goalie" } });
        fireEvent.click(within(rosterSection()).getByRole("button", { name: "Add" }));
        expect(screen.getByText("That position is already on the list")).toBeInTheDocument();
        fireEvent.change(screen.getByRole("textbox", { name: "Position name" }), { target: { value: "Rover" } });
        fireEvent.click(within(rosterSection()).getByRole("button", { name: "Add" }));
        expect(within(rosterSection()).getByRole("button", { name: "Rover", pressed: true })).toBeInTheDocument();
    });

    it("pastes a list after previewing it", async () => {
        const onSave = renderEditor([drill("k1", 0)], { roster: { ...ROSTER, players: [] } });
        fireEvent.click(within(rosterSection()).getByRole("button", { name: "Paste a list" }));
        const dialog = await screen.findByRole("dialog", { name: "Paste a list" });
        fireEvent.change(within(dialog).getByRole("textbox", { name: "Players" }), { target: { value: "#4 Jordan\n30 Pat G\n\nSam" } });
        expect(within(dialog).getByText("#4 Jordan · Skater")).toBeInTheDocument();
        expect(within(dialog).getByText("#30 Pat · Goalie")).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole("button", { name: "Add 3 players" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        await save();
        expect(sent(onSave).roster?.players.map((player) => [player.number, player.name, player.role])).toEqual([
            ["4", "Jordan", "S"],
            ["30", "Pat", "G"],
            ["", "Sam", "S"],
        ]);
    });

    it("offers Add from team only with team options, and links the players it adds", async () => {
        const options: RosterOption[] = [
            { playerId: "cplayer1xxxxxxxxxxxxxxxxx", name: "Casey", number: "12", position: "Goalie" },
            { playerId: "cplayer2xxxxxxxxxxxxxxxxx", name: "Drew", number: "", position: "Left Wing" },
        ];
        const onSave = renderEditor([drill("k1", 0)], { roster: { ...ROSTER, ageGroup: "u12", roles: ["F", "D", "G"], players: [] } }, undefined, { rosterOptions: options });
        fireEvent.click(within(rosterSection()).getByRole("button", { name: "Add from team" }));
        const dialog = await screen.findByRole("dialog", { name: "Add from team" });
        fireEvent.click(within(dialog).getByRole("button", { name: "Add all" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(within(rosterSection()).getAllByText("Team")).toHaveLength(2);
        await save();
        expect(sent(onSave).roster?.players).toEqual([
            { key: expect.any(String), name: "Casey", number: "12", role: "G", playerId: "cplayer1xxxxxxxxxxxxxxxxx" },
            { key: expect.any(String), name: "Drew", number: "", role: "F", playerId: "cplayer2xxxxxxxxxxxxxxxxx" },
        ]);
    });

    it("hides Add from team without options (the static planner)", () => {
        renderEditor([drill("k1", 0)]);
        expect(within(rosterSection()).queryByRole("button", { name: "Add from team" })).toBeNull();
    });

    it("points out a goalie count that differs from goalies attending, and fixes it in one tap (R14)", async () => {
        const onSave = renderEditor([drill("k1", 0)], { roster: ROSTER, goaliesAttending: 2 });
        expect(screen.getByText("Goalies attending is 2; this roster has 1.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Use 1" }));
        expect(screen.queryByText("Goalies attending is 2; this roster has 1.")).toBeNull();
        await save();
        expect(sent(onSave).goaliesAttending).toBe(1);
    });
});

describe("PracticeSessionEditor: Suggested drills", () => {
    function renderWithStore(extra: Partial<PracticeSessionData> = {}, store = createMockPlannerStore()) {
        const onSave = vi.fn().mockResolvedValue({ success: true });
        renderWithPlanner(
            <ThemeProvider theme={createTheme()}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <PracticeSessionEditor
                        sessionId={SESSION}
                        teamId={TEAM}
                        initialData={{ title: "Practice", duration: 60, date: new Date("2026-04-07T22:00:00.000Z"), plays: [], ...extra }}
                        onSave={onSave}
                    />
                </LocalizationProvider>
            </ThemeProvider>,
            { store },
        );
        return { store, onSave };
    }

    it("asks for players first", () => {
        renderWithStore();
        expect(screen.getByText("Add players to see drills that fit.")).toBeInTheDocument();
    });

    it("ranks drills for the roster with reasons, reading the library for the roster's age", async () => {
        const players = [...Array.from({ length: 7 }, (_, i) => ({ key: `s${i}`, name: "", number: "", role: "S" })), { key: "g", name: "", number: "", role: "G" }];
        const { store } = renderWithStore({ roster: { ageGroup: "u8", roles: ["S", "G"], players } });
        await waitFor(() => expect(store.getPlaysByTeam).toHaveBeenCalledWith(expect.objectContaining({ teamId: TEAM, isTemplate: true, limit: 100, ageGroup: "u8" })));
        const panel = screen.getByRole("region", { name: "Suggested drills" });
        const items = await within(panel).findAllByRole("listitem");
        expect(items.length).toBeGreaterThan(0);
        expect(items.length).toBeLessThanOrEqual(6);
        expect(within(panel).getAllByText("Made for 8U").length).toBeGreaterThan(0);
        expect(panel.textContent).not.toMatch(/Needs 2 goalies/);
    });

    it("adds a starter suggestion by copying it to the library, then into the practice", async () => {
        const players = Array.from({ length: 6 }, (_, i) => ({ key: `s${i}`, name: "", number: "", role: "S" }));
        const { store, onSave } = renderWithStore({ roster: { ageGroup: "u8", roles: ["S", "G"], players } });
        const panel = screen.getByRole("region", { name: "Suggested drills" });
        const [first] = await within(panel).findAllByRole("listitem");
        const name = within(first).getAllByText(/./)[0].textContent ?? "";
        const starter = STARTER_PLAYS.find((play) => play.name === name);
        expect(starter).toBeDefined();
        store.createPlay.mockResolvedValue({ success: true, data: { id: "cnewplayxxxxxxxxxxxxxxxxx", name, isTemplate: true } });
        store.getPlayById.mockResolvedValue({
            success: true,
            data: { id: "cnewplayxxxxxxxxxxxxxxxxx", name, description: starter?.description ?? "", thumbnail: null, playData: starter?.playData, isTemplate: true, createdAt: new Date(), updatedAt: new Date() },
        });
        await act(async () => {
            fireEvent.click(within(first).getByRole("button", { name: `Add ${name}` }));
        });
        await waitFor(() => expect(store.getPlayById).toHaveBeenCalledWith({ id: "cnewplayxxxxxxxxxxxxxxxxx", teamId: TEAM }));
        expect(store.createPlay).toHaveBeenCalledWith(expect.objectContaining({ name, isTemplate: true, teamId: TEAM }));
        await save();
        expect(sent(onSave).plays.map((play) => ("playId" in play ? play.playId : null))).toEqual(["cnewplayxxxxxxxxxxxxxxxxx"]);
    });

    it("keeps Add off until the library has loaded, so a starter never duplicates a library drill", async () => {
        const players = Array.from({ length: 6 }, (_, i) => ({ key: `s${i}`, name: "", number: "", role: "S" }));
        const store = createMockPlannerStore();
        let finish: (value: unknown) => void = () => undefined;
        store.getPlaysByTeam.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
        renderWithStore({ roster: { ageGroup: "u8", roles: ["S", "G"], players } }, store);
        const panel = screen.getByRole("region", { name: "Suggested drills" });
        const pending = await within(panel).findAllByRole("button", { name: /^Add / });
        expect(pending.length).toBeGreaterThan(0);
        for (const button of pending) expect(button).toBeDisabled();
        await act(async () => {
            finish(EMPTY_LIBRARY_PAGE);
        });
        await waitFor(() => {
            for (const button of within(panel).getAllByRole("button", { name: /^Add / })) expect(button).toBeEnabled();
        });
    });

    it("keeps Add off while the library reloads after a starter is copied in", async () => {
        const players = Array.from({ length: 6 }, (_, i) => ({ key: `s${i}`, name: "", number: "", role: "S" }));
        const store = createMockPlannerStore();
        renderWithStore({ roster: { ageGroup: "u8", roles: ["S", "G"], players } }, store);
        const panel = screen.getByRole("region", { name: "Suggested drills" });
        await waitFor(() => expect(within(panel).getAllByRole("button", { name: /^Add / })[0]).toBeEnabled());
        const [first] = within(panel).getAllByRole("listitem");
        const name = within(first).getAllByText(/./)[0].textContent ?? "";
        let finish: (value: unknown) => void = () => undefined;
        store.getPlaysByTeam.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
        store.createPlay.mockResolvedValue({ success: true, data: { id: "cnewplayxxxxxxxxxxxxxxxxx", name, isTemplate: true } });
        store.getPlayById.mockResolvedValue({
            success: true,
            data: { id: "cnewplayxxxxxxxxxxxxxxxxx", name, description: "", thumbnail: null, playData: STARTER_PLAYS[0].playData, isTemplate: true, createdAt: new Date(), updatedAt: new Date() },
        });
        await act(async () => {
            fireEvent.click(within(first).getByRole("button", { name: `Add ${name}` }));
        });
        await waitFor(() => expect(store.getPlaysByTeam).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(store.getPlayById).toHaveBeenCalled());
        await act(async () => {});
        for (const button of within(panel).getAllByRole("button", { name: /^Add / })) expect(button).toBeDisabled();
        await act(async () => {
            finish(EMPTY_LIBRARY_PAGE);
        });
        await waitFor(() => {
            for (const button of within(panel).getAllByRole("button", { name: /^Add / })) expect(button).toBeEnabled();
        });
    });
});
