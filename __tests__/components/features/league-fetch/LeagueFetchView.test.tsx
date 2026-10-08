/** The hosted "Fetch it for me" confirm screen (ADR-0024). The server action is mocked. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ fetchLeagueSchedule: vi.fn() }));
vi.mock("@/lib/actions/league-fetch", () => ({ fetchLeagueSchedule: mocks.fetchLeagueSchedule }));

import { act } from "@testing-library/react";
import { FETCH_BUTTON_LABEL, LeagueFetchView, NO_SOURCE_MESSAGE, SLOW_MESSAGE, SLOW_NOTICE_AFTER_MS, TRY_AGAIN_LABEL, UNSUPPORTED_MESSAGE } from "@/components/features/league-fetch/LeagueFetchView";

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
        mocks.fetchLeagueSchedule.mockResolvedValue({ success: false, error: "The league site didn't return the page." });
        open(`#src=${encodeURIComponent(LEAGUE)}`);
        fireEvent.click(await screen.findByRole("button", { name: FETCH_BUTTON_LABEL }));
        expect(await screen.findByText(/didn't return/)).toBeInTheDocument();
        expect(navigate).not.toHaveBeenCalled();
    });

    it("shows progress, then the slow-site line in a live region after about 5 s", async () => {
        let resolve: (value: unknown) => void = () => {};
        mocks.fetchLeagueSchedule.mockReturnValue(new Promise((r) => (resolve = r)));
        open(`#src=${encodeURIComponent(LEAGUE)}`);
        const button = await screen.findByRole("button", { name: FETCH_BUTTON_LABEL });
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            fireEvent.click(button);
            const busy = await screen.findByRole("button", { name: "Fetching…" });
            expect(busy).toBeDisabled();
            expect(busy).toHaveStyle({ minHeight: "44px" });
            const live = screen.getByRole("status");
            expect(live).toHaveAttribute("aria-live", "polite");
            expect(live).toBeEmptyDOMElement();
            await act(async () => {
                await vi.advanceTimersByTimeAsync(SLOW_NOTICE_AFTER_MS - 100);
            });
            expect(screen.queryByText(SLOW_MESSAGE)).not.toBeInTheDocument();
            await act(async () => {
                await vi.advanceTimersByTimeAsync(200);
            });
            expect(screen.getByRole("status")).toHaveTextContent(SLOW_MESSAGE);
        } finally {
            await act(async () => {
                resolve({ success: false, error: "x" });
            });
            vi.useRealTimers();
        }
        await waitFor(() => expect(screen.queryByText(SLOW_MESSAGE)).not.toBeInTheDocument());
    });

    it("on a timeout says the site was slow, offers Try again and the planner import fallback", async () => {
        mocks.fetchLeagueSchedule.mockResolvedValueOnce({
            success: false,
            error: "The league site was too slow to respond, so the request timed out.",
            details: { kind: "timeout" },
        });
        open(`#src=${encodeURIComponent(LEAGUE)}`);
        fireEvent.click(await screen.findByRole("button", { name: FETCH_BUTTON_LABEL }));
        expect(await screen.findByText("The league site was slow")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /planner's import/ })).toHaveAttribute("href", `${PLANNER}#/rankings/import`);

        mocks.fetchLeagueSchedule.mockResolvedValueOnce({ success: true, data: { redirectUrl: `${PLANNER}#/rankings/import?pull=abc`, host: HOST, games: 1, teams: 2 } });
        // The alert can render a beat before the transition settles and the button relabels.
        fireEvent.click(await screen.findByRole("button", { name: TRY_AGAIN_LABEL }));
        await waitFor(() => expect(navigate).toHaveBeenCalledWith(`${PLANNER}#/rankings/import?pull=abc`));
        expect(mocks.fetchLeagueSchedule).toHaveBeenCalledTimes(2);
    });

    it("reads a league page carried over login", async () => {
        sessionStorage.setItem("openleague.pendingLeagueSource", JSON.stringify({ value: LEAGUE, savedAt: Date.now() }));
        open("");
        expect(await screen.findByRole("heading", { name: `Fetch ${HOST} schedule page?` })).toBeInTheDocument();
    });

    it("accepts an allowed host written with a trailing dot, as the server does", async () => {
        open(`#src=${encodeURIComponent(`https://${HOST}./schedule/8u`)}`);
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
