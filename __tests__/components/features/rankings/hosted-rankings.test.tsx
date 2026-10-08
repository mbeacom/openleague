/** Hosted rankings pages (ADR-0025): the static screens bound to one stored record, and the list. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { ReactElement } from "react";
import theme from "@/lib/theme";

const { actions, push, refresh } = vi.hoisted(() => ({
    actions: {
        getRankingsRecord: vi.fn(),
        saveRankingsRecord: vi.fn(),
        clearRankingsRecord: vi.fn(),
        createRankingsRecord: vi.fn(),
        deleteRankingsRecord: vi.fn(),
        listRankingsRecords: vi.fn(),
    },
    push: vi.fn(),
    refresh: vi.fn(),
}));
vi.mock("@/lib/actions/rankings", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { HostedRankingsScreen, hostedRankingsRoutes } from "@/components/features/rankings/HostedRankingsScreen";
import { NEW_RANKINGS_LABEL, NO_RANKINGS_MESSAGE, OPEN_RANKINGS_FILE_LABEL, RankingsListView } from "@/components/features/rankings/RankingsListView";
import { FETCH_FOR_ME_LABEL } from "@/apps/planner/src/screens/rankings/FetchForMeAction";
import { ADD_SCHEDULE_PAGE_LABEL } from "@/apps/planner/src/screens/rankings/UpdateResultsPanel";
import { serializeRankings, withTeamLogo } from "@/lib/rankings-document";
import { logoPng } from "@/__tests__/helpers/logo-png";
import { sampleRankingsDoc } from "@/__tests__/apps/planner/rankings-fixtures";

const ID = "clrank000000000000000000001";
const wrap = (ui: ReactElement) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

beforeEach(() => {
    vi.clearAllMocks();
});

describe("HostedRankingsScreen", () => {
    it("loads the record through its action and links within /rankings/<id>", async () => {
        const doc = sampleRankingsDoc();
        actions.getRankingsRecord.mockResolvedValue({ success: true, data: { id: ID, title: doc.meta.title, document: doc } });
        wrap(<HostedRankingsScreen id={ID} view={{ name: "rankings" }} />);
        expect(await screen.findByRole("heading", { name: "Fall Pre-season" })).toBeInTheDocument();
        expect(actions.getRankingsRecord).toHaveBeenCalledWith(ID);
        expect(screen.getByRole("link", { name: "Setup" })).toHaveAttribute("href", `/rankings/${ID}/setup`);
        expect(screen.getByRole("link", { name: "What-if" })).toHaveAttribute("href", `/rankings/${ID}/what-if`);
        expect(screen.getAllByRole("link", { name: /Hilltop M1/ })[0]).toHaveAttribute("href", `/rankings/${ID}/team/903`);
        expect(screen.getByRole("link", { name: "All rankings" })).toHaveAttribute("href", "/rankings");
        // Phase 1: no hand-off to the static app's "Fetch it for me".
        expect(screen.queryByRole("link", { name: FETCH_FOR_ME_LABEL })).not.toBeInTheDocument();
    });

    it("saves through the record's action", async () => {
        const doc = sampleRankingsDoc({ myTeam: null });
        actions.getRankingsRecord.mockResolvedValue({ success: true, data: { id: ID, title: doc.meta.title, document: doc } });
        actions.saveRankingsRecord.mockImplementation(async ({ document }) => ({ success: true, data: document }));
        wrap(<HostedRankingsScreen id={ID} view={{ name: "rankings" }} />);
        fireEvent.mouseDown(await screen.findByRole("combobox", { name: "Pick your team" }));
        fireEvent.click(await screen.findByRole("option", { name: /902 Lakeview M2/ }));
        await waitFor(() => expect(actions.saveRankingsRecord).toHaveBeenCalledWith({ id: ID, document: expect.objectContaining({ myTeam: "902" }) }));
    });

    it("offers an import for a cleared record", async () => {
        actions.getRankingsRecord.mockResolvedValue({ success: true, data: { id: ID, title: "T", document: null } });
        wrap(<HostedRankingsScreen id={ID} view={{ name: "rankings" }} />);
        const link = await screen.findByRole("link", { name: /Import/ });
        expect(link).toHaveAttribute("href", `/rankings/${ID}/import`);
    });

    it("shows the team's logo on the hosted team page", async () => {
        const withLogo = withTeamLogo(sampleRankingsDoc(), "903", { dataUrl: logoPng(64, 64), width: 64, height: 64 });
        if (!withLogo.ok) throw new Error("expected a logo");
        actions.getRankingsRecord.mockResolvedValue({ success: true, data: { id: ID, title: "T", document: withLogo.doc } });
        const { container } = wrap(<HostedRankingsScreen id={ID} view={{ name: "team", number: "903" }} />);
        await screen.findByRole("heading", { name: /Hilltop M1/ });
        expect(container.querySelector(`img[src="${logoPng(64, 64)}"]`)).not.toBeNull();
    });

    it("builds path routes for one record", () => {
        const routes = hostedRankingsRoutes(ID);
        expect(routes.rankingsUpdate()).toBe(`/rankings/${ID}/import/update`);
        expect(routes.rankingsImport()).toBe(`/rankings/${ID}/import`);
        expect(routes.rankingsSetup()).toBe(`/rankings/${ID}/setup`);
        expect(routes.rankingsSetup("pages")).toBe(`/rankings/${ID}/setup/pages`);
    });

    it("sends Add the schedule page to the record's League pages section", async () => {
        const doc = sampleRankingsDoc();
        actions.getRankingsRecord.mockResolvedValue({ success: true, data: { id: ID, title: doc.meta.title, document: doc } });
        wrap(<HostedRankingsScreen id={ID} view={{ name: "rankings" }} />);
        expect(await screen.findByRole("link", { name: ADD_SCHEDULE_PAGE_LABEL })).toHaveAttribute("href", `/rankings/${ID}/setup/pages`);
    });

    it("opens a team from the tier chart within the record", async () => {
        const doc = sampleRankingsDoc();
        actions.getRankingsRecord.mockResolvedValue({ success: true, data: { id: ID, title: doc.meta.title, document: doc } });
        const { container } = wrap(<HostedRankingsScreen id={ID} view={{ name: "rankings" }} />);
        await screen.findByRole("heading", { name: "Fall Pre-season" });
        const dot = container.querySelector<SVGGElement>('[data-team="903"]');
        expect(dot).not.toBeNull();
        fireEvent.keyDown(dot!, { key: "Enter" });
        expect(push).toHaveBeenCalledWith(`/rankings/${ID}/team/903`);
    });

    it("opens Setup at the section the route names", async () => {
        const doc = sampleRankingsDoc();
        actions.getRankingsRecord.mockResolvedValue({ success: true, data: { id: ID, title: doc.meta.title, document: doc } });
        wrap(<HostedRankingsScreen id={ID} view={{ name: "setup", section: "pages" }} />);
        expect(await screen.findByRole("tab", { name: /^League pages/, selected: true })).toBeInTheDocument();
    });
});

describe("RankingsListView", () => {
    it("lists the user's records", () => {
        wrap(<RankingsListView records={[{ id: ID, title: "Fall Pre-season", hasDocument: true, updatedAt: new Date("2026-10-01T12:00:00Z") }]} />);
        expect(screen.getByRole("link", { name: /Fall Pre-season/ })).toHaveAttribute("href", `/rankings/${ID}`);
    });

    it("starts new rankings on the import screen", async () => {
        actions.createRankingsRecord.mockResolvedValue({ success: true, data: { id: ID } });
        wrap(<RankingsListView records={[]} />);
        expect(screen.getByText(NO_RANKINGS_MESSAGE)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: NEW_RANKINGS_LABEL }));
        await waitFor(() => expect(push).toHaveBeenCalledWith(`/rankings/${ID}/import`));
    });

    it("opens a rankings file from either app into a new record", async () => {
        actions.createRankingsRecord.mockResolvedValue({ success: true, data: { id: ID } });
        wrap(<RankingsListView records={[]} />);
        const file = new File([serializeRankings(sampleRankingsDoc())], "fall.rankings.json", { type: "application/json" });
        fireEvent.change(screen.getByLabelText(OPEN_RANKINGS_FILE_LABEL), { target: { files: [file] } });
        await waitFor(() => expect(push).toHaveBeenCalledWith(`/rankings/${ID}`));
        expect(actions.createRankingsRecord.mock.calls[0][0].document.meta.title).toBe("Fall Pre-season");
    });

    it("shows why a file can't be opened", async () => {
        wrap(<RankingsListView records={[]} />);
        const file = new File(["{}"], "x.json", { type: "application/json" });
        fireEvent.change(screen.getByLabelText(OPEN_RANKINGS_FILE_LABEL), { target: { files: [file] } });
        expect(await screen.findByText("This file isn't an OpenLeague rankings file.")).toBeInTheDocument();
        expect(actions.createRankingsRecord).not.toHaveBeenCalled();
    });

    it("deletes after a confirmation", async () => {
        actions.deleteRankingsRecord.mockResolvedValue({ success: true, data: { id: ID } });
        wrap(<RankingsListView records={[{ id: ID, title: "Fall Pre-season", hasDocument: false, updatedAt: new Date("2026-10-01T12:00:00Z") }]} />);
        fireEvent.click(screen.getByRole("button", { name: "Delete Fall Pre-season" }));
        fireEvent.click(screen.getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(actions.deleteRankingsRecord).toHaveBeenCalledWith(ID));
        expect(refresh).toHaveBeenCalled();
    });
});
