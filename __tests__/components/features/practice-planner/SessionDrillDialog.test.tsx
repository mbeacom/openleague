import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import type { PlayEditorProps } from "@/components/features/practice-planner/PlayEditor";
import type { SavedPlay } from "@/types/practice-planner";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { createMockPlannerStore, renderWithPlanner } from "@/__tests__/helpers/planner";

const captured = vi.hoisted(() => ({ props: null as PlayEditorProps | null }));

vi.mock("@/components/features/practice-planner/PlayEditor", () => ({
    PlayEditor: (props: PlayEditorProps) => {
        captured.props = props;
        return <div>play editor</div>;
    },
}));

import { SessionDrillDialog } from "@/components/features/practice-planner/SessionDrillDialog";

const actions = createMockPlannerStore();

const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const LIB = "clibraryxxxxxxxxxxxxxxxxx";
const OWNED = "cownedxxxxxxxxxxxxxxxxxxx";

const saved: SavedPlay = {
    id: "", name: "Breakout", description: "Quick", thumbnail: "data:image/png;base64,AA",
    playData: createEmptyPlayData(), isTemplate: false, createdAt: new Date(), updatedAt: new Date(),
};

function renderDialog(playId: string | null, onSaved = vi.fn().mockResolvedValue({ ok: true }), onClose = vi.fn()) {
    renderWithPlanner(
        <SessionDrillDialog
            open
            sessionId={SESSION}
            teamId={TEAM}
            drill={{ clientKey: "k1", playId, name: "Breakout", description: "Quick", playData: createEmptyPlayData(), thumbnail: "" }}
            onSaved={onSaved}
            onClose={onClose}
        />,
        { store: actions },
    );
    return { onSaved, onClose };
}

async function saveFromEditor() {
    await act(async () => {
        await captured.props?.onSave?.(saved);
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    captured.props = null;
    actions.saveSessionDrill.mockResolvedValue({ success: true, data: { playId: OWNED } });
    actions.copySessionDrillToLibrary.mockResolvedValue({ success: true, data: { playId: "clibcopyxxxxxxxxxxxxxxxxx" } });
});

describe("SessionDrillDialog", () => {
    it("hosts PlayEditor with autosave off and the template box locked", () => {
        renderDialog(LIB);
        expect(captured.props).toMatchObject({ autoSave: false, lockTemplate: true, playId: LIB });
    });

    it("forks on the first save, then keeps saving the owned copy", async () => {
        const { onSaved } = renderDialog(LIB);
        await saveFromEditor();
        expect(actions.saveSessionDrill).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: SESSION, teamId: TEAM, playId: LIB, name: "Breakout" }));
        expect(onSaved).toHaveBeenCalledWith("k1", expect.objectContaining({ playId: OWNED, name: "Breakout" }));

        await saveFromEditor();
        expect(actions.saveSessionDrill).toHaveBeenLastCalledWith(expect.objectContaining({ playId: OWNED }));
    });

    it("creates a brand-new drill without a playId", async () => {
        renderDialog(null);
        await saveFromEditor();
        expect(actions.saveSessionDrill.mock.calls[0][0].playId).toBeUndefined();
    });

    it("adds the drill to the library once when the box is checked", async () => {
        renderDialog(LIB);
        fireEvent.click(screen.getByLabelText("Also add to library"));
        await saveFromEditor();
        await saveFromEditor();
        expect(actions.copySessionDrillToLibrary).toHaveBeenCalledTimes(1);
        expect(actions.copySessionDrillToLibrary).toHaveBeenCalledWith({ playId: OWNED, teamId: TEAM });
    });

    it("does not add to the library by default", async () => {
        renderDialog(LIB);
        await saveFromEditor();
        expect(actions.copySessionDrillToLibrary).not.toHaveBeenCalled();
    });

    it("surfaces a save error to PlayEditor and reports nothing", async () => {
        actions.saveSessionDrill.mockResolvedValue({ success: false, error: "Invalid play data" });
        const { onSaved } = renderDialog(LIB);
        await expect(captured.props?.onSave?.(saved)).rejects.toThrow("Invalid play data");
        expect(onSaved).not.toHaveBeenCalled();
    });
    it("reports a failed session save inside the dialog and stays open", async () => {
        const onSaved = vi.fn().mockResolvedValue({ ok: false, error: "Total drill time exceeds the session duration" });
        const { onClose } = renderDialog(null, onSaved);
        fireEvent.click(screen.getByLabelText("Also add to library"));

        await act(async () => {
            await expect(captured.props?.onSave?.(saved)).rejects.toThrow(
                "The drill was saved, but not added to this session: Total drill time exceeds the session duration",
            );
        });
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole("dialog")).toBeTruthy();
        expect(actions.copySessionDrillToLibrary).not.toHaveBeenCalled();

        // A retry updates the copy the first attempt created; it never forks again.
        await act(async () => {
            await expect(captured.props?.onSave?.(saved)).rejects.toThrow();
        });
        expect(actions.saveSessionDrill).toHaveBeenLastCalledWith(expect.objectContaining({ playId: OWNED }));
    });

    it("keeps the session save when the library copy fails, then retries the copy on the next save", async () => {
        actions.copySessionDrillToLibrary
            .mockResolvedValueOnce({ success: false, error: "Library unavailable" })
            .mockResolvedValueOnce({ success: true, data: { playId: "clibcopyxxxxxxxxxxxxxxxxx" } });
        const { onSaved } = renderDialog(LIB);
        fireEvent.click(screen.getByLabelText("Also add to library"));

        await expect(captured.props?.onSave?.(saved)).rejects.toThrow(
            "Saved to this session, but not added to the library: Library unavailable",
        );
        expect(onSaved).toHaveBeenCalledTimes(1);

        await saveFromEditor();
        expect(actions.copySessionDrillToLibrary).toHaveBeenCalledTimes(2);
        expect(actions.copySessionDrillToLibrary).toHaveBeenLastCalledWith({ playId: OWNED, teamId: TEAM });
    });

    describe("closing with unsaved changes", () => {
        const setDirty = (dirty: boolean) => act(() => captured.props?.onDirtyChange?.(dirty));
        const pressEscape = () => fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

        it("closes immediately when the drill is clean", () => {
            const { onClose } = renderDialog(LIB);
            act(() => captured.props?.onCancel?.());
            expect(onClose).toHaveBeenCalledTimes(1);
            expect(screen.queryByText("Discard unsaved changes to this drill?")).toBeNull();
        });

        it("asks before closing on Escape, and Keep editing leaves it open", () => {
            const { onClose } = renderDialog(LIB);
            setDirty(true);
            pressEscape();
            expect(screen.getByText("Discard unsaved changes to this drill?")).toBeTruthy();
            expect(onClose).not.toHaveBeenCalled();
            fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
            expect(onClose).not.toHaveBeenCalled();
        });

        it("asks before closing from the editor's cancel control, and Discard closes", () => {
            const { onClose } = renderDialog(LIB);
            setDirty(true);
            act(() => captured.props?.onCancel?.());
            expect(screen.getByText("Discard unsaved changes to this drill?")).toBeTruthy();
            expect(onClose).not.toHaveBeenCalled();
            fireEvent.click(screen.getByRole("button", { name: "Discard" }));
            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it("closes immediately after a successful save makes the drill clean again", async () => {
            const { onClose } = renderDialog(LIB);
            setDirty(true);
            await saveFromEditor();
            setDirty(false); // PlayEditor clears its flag once onSave resolves
            act(() => captured.props?.onCancel?.());
            expect(onClose).toHaveBeenCalledTimes(1);
            expect(screen.queryByText("Discard unsaved changes to this drill?")).toBeNull();
        });
    });
});

describe("SessionDrillDialog: drill tags", () => {
    it("opens the editor with the drill's tags, and saves them with the session drill and the card patch", async () => {
        const onSaved = vi.fn().mockResolvedValue({ ok: true });
        renderWithPlanner(
            <SessionDrillDialog
                open
                sessionId={SESSION}
                teamId={TEAM}
                drill={{ clientKey: "k1", playId: OWNED, name: "Warm-up", description: "", playData: createEmptyPlayData(), thumbnail: "", focus: "goalies", goalies: "required" }}
                onSaved={onSaved}
                onClose={vi.fn()}
            />,
            { store: actions },
        );
        expect(captured.props?.initialData).toMatchObject({ focus: "goalies", goalies: "required" });

        await act(async () => {
            await captured.props?.onSave?.({ ...saved, name: "Warm-up", focus: "goalies", goalies: "optional" });
        });
        expect(actions.saveSessionDrill).toHaveBeenLastCalledWith(expect.objectContaining({ focus: "goalies", goalies: "optional" }));
        expect(onSaved).toHaveBeenCalledWith("k1", expect.objectContaining({ focus: "goalies", goalies: "optional" }));
    });
});

describe("SessionDrillDialog: age groups", () => {
    it("opens the editor with the drill's groups, and saves them with the session drill and the card patch", async () => {
        const onSaved = vi.fn().mockResolvedValue({ ok: true });
        renderWithPlanner(
            <SessionDrillDialog
                open
                sessionId={SESSION}
                teamId={TEAM}
                drill={{ clientKey: "k1", playId: OWNED, name: "Keep-Away", description: "", playData: createEmptyPlayData(), thumbnail: "", ageGroups: ["u6", "u8"] }}
                onSaved={onSaved}
                onClose={vi.fn()}
            />,
            { store: actions },
        );
        expect(captured.props?.initialData).toMatchObject({ ageGroups: ["u6", "u8"] });
        await act(async () => {
            await captured.props?.onSave?.({ ...saved, name: "Keep-Away", ageGroups: ["u8"] });
        });
        expect(actions.saveSessionDrill).toHaveBeenLastCalledWith(expect.objectContaining({ ageGroups: ["u8"] }));
        expect(onSaved).toHaveBeenCalledWith("k1", expect.objectContaining({ ageGroups: ["u8"] }));
    });
});
