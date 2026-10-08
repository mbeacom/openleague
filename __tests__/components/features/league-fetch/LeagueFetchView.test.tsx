/** The hosted "Fetch it for me" confirm screen (ADR-0024). The server action is mocked. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ fetchLeagueSchedule: vi.fn() }));
vi.mock("@/lib/actions/league-fetch", () => ({ fetchLeagueSchedule: mocks.fetchLeagueSchedule }));

import { FETCH_BUTTON_LABEL, LeagueFetchView, NO_SOURCE_MESSAGE, UNSUPPORTED_MESSAGE } from "@/components/features/league-fetch/LeagueFetchView";

const HOST = "league.example.org";
const LEAGUE = `https://${HOST}/schedule/8u`;
const PLANNER = "https://planner.example.org/planner/";

const navigate = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
});

afterEach(() => {
    window.history.replaceState(null, "", "/");
});

function open(hash: string) {
    window.history.replaceState(null, "", `/practice-planner/fetch-schedule${hash}`);
    return render(<LeagueFetchView allowedHosts={[HOST]} plannerUrl={PLANNER} navigate={navigate} />);
}

describe("LeagueFetchView", () => {
    it("asks once, fetches on the button and goes to the planner URL the action built", async () => {
        mocks.fetchLeagueSchedule.mockResolvedValue({ success: true, data: { redirectUrl: `${PLANNER}#/rankings/import?pull=abc`, host: HOST, games: 7, teams: 6 } });
        open(`#src=${encodeURIComponent(LEAGUE)}`);
        expect(await screen.findByRole("heading", { name: `Fetch ${HOST} schedule page?` })).toBeInTheDocument();
        expect(mocks.fetchLeagueSchedule).not.toHaveBeenCalled();
        // The league address is dropped from the address bar as soon as it is read.
        expect(window.location.hash).toBe("");

        fireEvent.click(screen.getByRole("button", { name: FETCH_BUTTON_LABEL }));
        await waitFor(() => expect(navigate).toHaveBeenCalledWith(`${PLANNER}#/rankings/import?pull=abc`));
        expect(mocks.fetchLeagueSchedule).toHaveBeenCalledWith({ url: LEAGUE });
    });

    it("shows the action's error and stays", async () => {
        mocks.fetchLeagueSchedule.mockResolvedValue({ success: false, error: "The league site took too long to respond. Please try again later." });
        open(`#src=${encodeURIComponent(LEAGUE)}`);
        fireEvent.click(await screen.findByRole("button", { name: FETCH_BUTTON_LABEL }));
        expect(await screen.findByText(/took too long/)).toBeInTheDocument();
        expect(navigate).not.toHaveBeenCalled();
    });

    it("reads a league page carried over login", async () => {
        sessionStorage.setItem("openleague.pendingLeagueSource", JSON.stringify({ value: LEAGUE, savedAt: Date.now() }));
        open("");
        expect(await screen.findByRole("heading", { name: `Fetch ${HOST} schedule page?` })).toBeInTheDocument();
    });

    it("explains when there is nothing to fetch", async () => {
        open("");
        expect(await screen.findByText(NO_SOURCE_MESSAGE)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: FETCH_BUTTON_LABEL })).not.toBeInTheDocument();
    });

    it.each([
        ["another site", "https://evil.example.net/schedule"],
        ["http", `http://${HOST}/schedule`],
        ["another port", `https://${HOST}:8443/schedule`],
    ])("offers no fetch for %s", async (_label, url) => {
        open(`#src=${encodeURIComponent(url)}`);
        expect(await screen.findByText(UNSUPPORTED_MESSAGE)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: FETCH_BUTTON_LABEL })).not.toBeInTheDocument();
    });
});
