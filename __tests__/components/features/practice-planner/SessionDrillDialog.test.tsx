import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { PlayEditorProps } from "@/components/features/practice-planner/PlayEditor";
import type { SavedPlay } from "@/types/practice-planner";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const captured = vi.hoisted(() => ({ props: null as PlayEditorProps | null }));
const actions = vi.hoisted(() => ({ saveSessionDrill: vi.fn(), copySessionDrillToLibrary: vi.fn() }));

vi.mock("@/components/features/practice-planner/PlayEditor", () => ({
    PlayEditor: (props: PlayEditorProps) => {
        captured.props = props;
        return <div>play editor</div>;
    },
}));
vi.mock("@/lib/actions/practice-session-drills", () => actions);

import { SessionDrillDialog } from "@/components/features/practice-planner/SessionDrillDialog";

const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const LIB = "clibraryxxxxxxxxxxxxxxxxx";
const OWNED = "cownedxxxxxxxxxxxxxxxxxxx";

const saved: SavedPlay = {
    id: "", name: "Breakout", description: "Quick", thumbnail: "data:image/png;base64,AA",
    playData: createEmptyPlayData(), isTemplate: false, createdAt: new Date(), updatedAt: new Date(),
};

function renderDialog(playId: string | null, onSaved = vi.fn()) {
    render(
        <SessionDrillDialog
            open
            sessionId={SESSION}
            teamId={TEAM}
            drill={{ clientKey: "k1", playId, name: "Breakout", description: "Quick", playData: createEmptyPlayData(), thumbnail: "" }}
            onSaved={onSaved}
            onClose={vi.fn()}
        />,
    );
    return { onSaved };
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
});
