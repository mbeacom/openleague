/** The team mark before the session title (practice logo spec R5), hosted and static. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { renderWithPlanner } from "@/__tests__/helpers/planner";
import type { PracticeSessionView } from "@/types/practice-planner";

vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({ generateThumbnail: () => "data:image/png;base64,LIVE" }));
vi.mock("@/components/features/practice-planner/StationMap", () => ({ StationMap: () => null }));
vi.mock("@/components/features/practice-planner/PlayLegend", () => ({ PlayLegend: () => null, LegendSwatch: () => null }));

import { SessionDetailView } from "@/app/(dashboard)/practice-planner/[sessionId]/SessionDetailView";
import { PlannerApp } from "@/apps/planner/src/App";
import { createStaleSignal } from "@/apps/planner/src/store/open-store";
import { memoryStore } from "@/__tests__/apps/planner/render-screen";

const LOGO_URL = "https://abc.public.blob.vercel-storage.com/branding/team/cteamxxxxxxxxxxxxxxxxxxxx/l.png";
const SESSION: PracticeSessionView = {
    id: "csessionxxxxxxxxxxxxxxxxx", title: "Tuesday Skills", date: "2026-04-07T22:00:00.000Z", duration: 60, isShared: false,
    createdByName: "Coach", teamId: "cteamxxxxxxxxxxxxxxxxxxxx", teamName: "Ice Hawks", startAt: null, transitionMinutes: 0, plays: [],
};

function renderView(session: PracticeSessionView) {
    return renderWithPlanner(
        <ThemeProvider theme={createTheme()}>
            <SessionDetailView session={session} isAdmin={false} />
        </ThemeProvider>,
    );
}

/** The h1's row: the Crest is its first child when there is a mark. */
const titleRow = () => screen.getByRole("heading", { level: 1, name: "Tuesday Skills" }).parentElement!;

describe("SessionDetailView: the team mark", () => {
    it("draws the team's logo in a Crest before the title", () => {
        renderView({ ...SESSION, teamMark: { id: SESSION.teamId, name: "Ice Hawks", logoUrl: LOGO_URL, color: null } });
        expect(titleRow().querySelector(`img[src="${LOGO_URL}"]`)).not.toBeNull();
    });

    it("draws the initials on the brand color when the team has no logo", () => {
        renderView({ ...SESSION, teamMark: { id: SESSION.teamId, name: "Ice Hawks", logoUrl: null, color: "#9B1B30" } });
        const initials = screen.getByText("IH");
        expect(titleRow().contains(initials)).toBe(true);
        expect(getComputedStyle(initials.parentElement!).backgroundColor).toBe("rgb(155, 27, 48)");
    });

    it("draws nothing without a mark", () => {
        renderView(SESSION);
        expect(titleRow().querySelector("img")).toBeNull();
        expect(screen.queryByText("IH")).toBeNull();
    });
});

describe("Static session page: Your team", () => {
    it("shows the device team's crest once it is saved, without a reload", async () => {
        const { store } = memoryStore();
        const created = await store.createSession({ title: "Tuesday Skills", date: new Date("2026-10-06T19:00:00"), duration: 60, plays: [] });
        if (!created.success) throw new Error(created.error);
        window.location.hash = `#/sessions/${created.data.id}`;
        render(<PlannerApp store={store} durable stale={createStaleSignal()} />);
        await screen.findByRole("heading", { level: 1, name: "Tuesday Skills" });
        expect(screen.queryByText("IH")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Your team" }));
        fireEvent.change(await screen.findByRole("textbox", { name: "Team name" }), { target: { value: "Ice Hawks" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(titleRow().textContent).toContain("IH"));
        window.history.replaceState(null, "", "/");
    });
});
