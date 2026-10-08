// __tests__/apps/planner/rankings-team-logos.test.tsx
/** Team logos on the rankings screens (hosted rankings and team logos spec, R5): set, show, remove. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

const { normalize } = vi.hoisted(() => ({ normalize: vi.fn() }));
vi.mock("@/lib/utils/canvas/logo-file", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/utils/canvas/logo-file")>()),
    normalizeLogoFile: normalize,
}));

import { RankingsTeamScreen } from "@/apps/planner/src/screens/rankings/RankingsTeamScreen";
import { RankingsScreen } from "@/apps/planner/src/screens/rankings/RankingsScreen";
import { RankingsSetupScreen, SAVE_SETUP_LABEL } from "@/apps/planner/src/screens/rankings/RankingsSetupScreen";
import { CHOOSE_LOGO_LABEL, RANKINGS_TEAM_LOGO_OPTIONS, REMOVE_LOGO_LABEL, REPLACE_LOGO_LABEL, TEAM_DETAILS_LABEL } from "@/apps/planner/src/screens/rankings/TeamLogoDialog";
import { teamLogo, withTeamLogo } from "@/lib/rankings-document";
import { logoPng } from "@/__tests__/helpers/logo-png";
import { memoryStore, renderScreen } from "./render-screen";
import { sampleRankingsDoc } from "./rankings-fixtures";

const LOGO = { dataUrl: logoPng(96, 96), width: 96, height: 96 };

function docWithLogo(number: string) {
    const result = withTeamLogo(sampleRankingsDoc(), number, LOGO);
    if (!result.ok) throw new Error(result.error);
    return result.doc;
}

beforeEach(() => normalize.mockReset());

describe("team logos", () => {
    it("draws a team's logo in the ladder and its Crest otherwise", async () => {
        const { store } = memoryStore();
        await store.saveRankings(docWithLogo("902"));
        const { container } = renderScreen(<RankingsScreen store={store} />, store);
        await screen.findByRole("list", { name: "Rankings ladder" });
        const images = container.querySelectorAll(`img[src="${LOGO.dataUrl}"]`);
        expect(images.length).toBe(1);
        // The other three teams show Crest initials, not an image.
        expect(container.querySelectorAll("img").length).toBe(1);
    });

    it("sets a logo from the team details dialog through the store, with the rankings bounds", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        normalize.mockResolvedValue({ ok: true, logo: LOGO });
        renderScreen(<RankingsTeamScreen store={store} number="903" />, store);
        fireEvent.click(await screen.findByRole("button", { name: TEAM_DETAILS_LABEL }));
        const dialog = within(screen.getByRole("dialog"));
        const input = dialog.getByLabelText(CHOOSE_LOGO_LABEL) as HTMLInputElement;
        const file = new File([new Uint8Array([1, 2, 3])], "crest.png", { type: "image/png" });
        fireEvent.change(input, { target: { files: [file] } });
        await waitFor(async () => {
            const saved = await store.getRankings();
            expect(saved.success && saved.data && teamLogo(saved.data, "903")).toEqual(LOGO);
        });
        expect(normalize).toHaveBeenCalledWith(file, RANKINGS_TEAM_LOGO_OPTIONS);
        expect(await dialog.findByRole("button", { name: REMOVE_LOGO_LABEL })).toBeInTheDocument();
    });

    it("shows a refused upload's message and saves nothing", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        normalize.mockResolvedValue({ ok: false, error: "Use a PNG, JPEG or WebP image." });
        renderScreen(<RankingsTeamScreen store={store} number="903" />, store);
        fireEvent.click(await screen.findByRole("button", { name: TEAM_DETAILS_LABEL }));
        const dialog = within(screen.getByRole("dialog"));
        fireEvent.change(dialog.getByLabelText(CHOOSE_LOGO_LABEL), { target: { files: [new File(["x"], "x.svg")] } });
        expect(await dialog.findByText("Use a PNG, JPEG or WebP image.")).toBeInTheDocument();
        const saved = await store.getRankings();
        expect(saved.success && saved.data && teamLogo(saved.data, "903")).toBeNull();
    });

    it("removes a logo", async () => {
        const { store } = memoryStore();
        await store.saveRankings(docWithLogo("903"));
        renderScreen(<RankingsTeamScreen store={store} number="903" />, store);
        fireEvent.click(await screen.findByRole("button", { name: TEAM_DETAILS_LABEL }));
        fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: REMOVE_LOGO_LABEL }));
        await waitFor(async () => {
            const saved = await store.getRankings();
            expect(saved.success && saved.data && teamLogo(saved.data, "903")).toBeNull();
        });
    });
});

describe("team logos in Setup's team dialog", () => {
    async function openTeam(store: ReturnType<typeof memoryStore>["store"], name: string) {
        renderScreen(<RankingsSetupScreen store={store} />, store);
        fireEvent.click(await screen.findByRole("tab", { name: /^Teams/ }));
        fireEvent.click(screen.getByRole("button", { name }));
        return within(screen.getByRole("dialog"));
    }

    const pickFile = (dialog: ReturnType<typeof within>, label: string) =>
        fireEvent.change(dialog.getByLabelText(label), { target: { files: [new File([new Uint8Array([1])], "crest.png", { type: "image/png" })] } });

    it("keeps a new logo in the draft on Done and saves it with Save setup", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        normalize.mockResolvedValue({ ok: true, logo: LOGO });
        const dialog = await openTeam(store, "Edit 903 Hilltop M1");
        pickFile(dialog, CHOOSE_LOGO_LABEL);
        expect(await dialog.findByRole("button", { name: REMOVE_LOGO_LABEL })).toBeInTheDocument();
        // Nothing is stored until Done and Save setup.
        let saved = await store.getRankings();
        expect(saved.success && saved.data && teamLogo(saved.data, "903")).toBeNull();
        fireEvent.click(dialog.getByRole("button", { name: "Done" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        // The team's row shows the draft's logo.
        expect(document.querySelectorAll(`img[src="${LOGO.dataUrl}"]`).length).toBe(1);
        saved = await store.getRankings();
        expect(saved.success && saved.data && teamLogo(saved.data, "903")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: SAVE_SETUP_LABEL }));
        await waitFor(async () => {
            const after = await store.getRankings();
            expect(after.success && after.data && teamLogo(after.data, "903")).toEqual(LOGO);
        });
    });

    it("drops a logo change on Cancel", async () => {
        const { store } = memoryStore();
        await store.saveRankings(docWithLogo("903"));
        normalize.mockResolvedValue({ ok: true, logo: LOGO });
        let dialog = await openTeam(store, "Edit 903 Hilltop M1");
        fireEvent.click(dialog.getByRole("button", { name: REMOVE_LOGO_LABEL }));
        expect(await dialog.findByRole("button", { name: CHOOSE_LOGO_LABEL })).toBeInTheDocument();
        fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        // Reopened, the team still has its logo.
        fireEvent.click(screen.getByRole("button", { name: "Edit 903 Hilltop M1" }));
        dialog = within(screen.getByRole("dialog"));
        expect(dialog.getByRole("button", { name: REPLACE_LOGO_LABEL })).toBeInTheDocument();
    });

    it("shows a refused logo's message in the dialog and keeps the draft unchanged", async () => {
        const { store } = memoryStore();
        await store.saveRankings(sampleRankingsDoc());
        normalize.mockResolvedValue({ ok: true, logo: { dataUrl: logoPng(200, 200), width: 200, height: 200 } });
        const dialog = await openTeam(store, "Edit 903 Hilltop M1");
        pickFile(dialog, CHOOSE_LOGO_LABEL);
        expect(await dialog.findByRole("alert")).toBeInTheDocument();
        expect(dialog.getByRole("button", { name: CHOOSE_LOGO_LABEL })).toBeInTheDocument();
    });
});
