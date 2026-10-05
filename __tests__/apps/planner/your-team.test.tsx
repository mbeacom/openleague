/** "Your team" (practice logo spec R4): the app bar button, the dialog, and screens that reload on a change. */
import { useCallback } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActionResult } from "@/lib/planner-store";
import { memoryStore, renderScreen } from "./render-screen";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const LOGO = { dataUrl: PNG, width: 1, height: 1 };
const { mockNormalize } = vi.hoisted(() => ({ mockNormalize: vi.fn() }));
vi.mock("@/lib/utils/canvas/logo-file", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/logo-file")>()),
    normalizeLogoFile: mockNormalize,
}));

import { YourTeamButton } from "@/apps/planner/src/screens/YourTeam";
import { useStoreResult } from "@/apps/planner/src/screens/useStoreResult";
import { LOGO_TYPE_MESSAGE } from "@/lib/utils/canvas/logo-file";
import { TEAM_COLOR_MESSAGE, TEAM_NAME_REQUIRED_MESSAGE } from "@/lib/utils/team-mark";

const pick = () => fireEvent.change(screen.getByTestId("team-logo-input"), { target: { files: [new File([new Uint8Array(8)], "logo.png", { type: "image/png" })] } });

async function openDialog() {
    const button = await screen.findByRole("button", { name: "Your team" });
    // YourTeamButton is disabled while the profile loads, so the dialog never opens with a stale team.
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    return screen.findByRole("dialog", { name: "Your team" });
}

describe("YourTeamButton and the Your team dialog", () => {
    it("saves a name, a logo and a color, and the button then shows the team's crest", async () => {
        mockNormalize.mockResolvedValue({ ok: true, logo: LOGO });
        const { store } = memoryStore();
        renderScreen(<YourTeamButton store={store} />, store);
        await openDialog();
        fireEvent.change(screen.getByRole("textbox", { name: "Team name" }), { target: { value: "  Ice Hawks " } });
        pick();
        await screen.findByRole("button", { name: "Replace logo" });
        fireEvent.change(screen.getByRole("textbox", { name: "Primary color" }), { target: { value: "#9b1b30" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        const saved = await store.getTeamProfile();
        expect(saved.success && saved.data).toEqual({ name: "Ice Hawks", logo: LOGO, primaryColor: "#9B1B30", secondaryColor: null });
        const button = screen.getByRole("button", { name: "Your team" });
        await waitFor(() => expect(button.querySelector(`img[src="${PNG}"]`)).not.toBeNull());
    });

    it("shows each field's problem on Save and stores nothing", async () => {
        const { store } = memoryStore();
        renderScreen(<YourTeamButton store={store} />, store);
        await openDialog();
        fireEvent.change(screen.getByRole("textbox", { name: "Secondary color" }), { target: { value: "red" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText(TEAM_NAME_REQUIRED_MESSAGE)).toBeInTheDocument();
        expect(screen.getByText(TEAM_COLOR_MESSAGE)).toBeInTheDocument();
        const saved = await store.getTeamProfile();
        expect(saved.success && saved.data).toBeNull();
    });

    it("says why an upload was refused, and removes a logo", async () => {
        const { store } = memoryStore();
        await store.saveTeamProfile({ name: "Ice Hawks", logo: LOGO, primaryColor: null, secondaryColor: null });
        renderScreen(<YourTeamButton store={store} />, store);
        await openDialog();
        mockNormalize.mockResolvedValue({ ok: false, error: LOGO_TYPE_MESSAGE });
        pick();
        expect(await screen.findByText(LOGO_TYPE_MESSAGE)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Remove logo" }));
        expect(screen.getByRole("button", { name: "Upload logo" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        const saved = await store.getTeamProfile();
        expect(saved.success && saved.data?.logo).toBeNull();
    });

    it("offers Clear team only once a team is saved, and clears it", async () => {
        const { store } = memoryStore();
        renderScreen(<YourTeamButton store={store} />, store);
        await openDialog();
        expect(screen.queryByRole("button", { name: "Clear team" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        await act(async () => {
            await store.saveTeamProfile({ name: "Ice Hawks", logo: null, primaryColor: null, secondaryColor: null });
        });
        // Wait for the button's reread (its crest) before reopening, so the dialog opens with the saved team.
        await screen.findByText("IH");
        await openDialog();
        fireEvent.click(screen.getByRole("button", { name: "Clear team" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        const saved = await store.getTeamProfile();
        expect(saved.success && saved.data).toBeNull();
    });

    it("gives every control a 44 px target", async () => {
        const { store } = memoryStore();
        // A saved team with a logo, so Replace logo, Remove logo and Clear team are all shown.
        await store.saveTeamProfile({ name: "Ice Hawks", logo: LOGO, primaryColor: null, secondaryColor: null });
        renderScreen(<YourTeamButton store={store} />, store);
        expect(getComputedStyle(await screen.findByRole("button", { name: "Your team" })).minHeight).toBe("44px");
        await openDialog();
        const minHeight = (name: string) => getComputedStyle(screen.getByRole("button", { name })).minHeight;
        for (const name of ["Replace logo", "Remove logo", "Clear team", "Cancel", "Save"]) {
            expect(minHeight(name), name).toBe("44px");
        }
        fireEvent.click(screen.getByRole("button", { name: "Remove logo" }));
        expect(minHeight("Upload logo"), "Upload logo").toBe("44px");
        for (const name of ["Pick primary color", "Pick secondary color"]) {
            const picker = screen.getByLabelText(name);
            expect([getComputedStyle(picker).width, getComputedStyle(picker).height], name).toEqual(["44px", "44px"]);
        }
    });
});

describe("useStoreResult refresh key", () => {
    it("reads again when the key changes, keeping the last result meanwhile", async () => {
        const load = vi.fn<() => Promise<ActionResult<string>>>().mockResolvedValueOnce({ success: true, data: "first" }).mockResolvedValueOnce({ success: true, data: "second" });
        function Probe({ refresh }: { refresh: number }) {
            const stable = useCallback(() => load(), []);
            const state = useStoreResult(stable, refresh);
            return <p>{state.kind === "ready" ? state.data : state.kind}</p>;
        }
        const { rerender } = render(<Probe refresh={0} />);
        expect(await screen.findByText("first")).toBeInTheDocument();
        rerender(<Probe refresh={1} />);
        expect(screen.getByText("first")).toBeInTheDocument();
        expect(await screen.findByText("second")).toBeInTheDocument();
        expect(load).toHaveBeenCalledTimes(2);
    });
});
