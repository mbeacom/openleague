/** Export plan and the practice roster (roster and suggestions spec R10): names only in files, only when checked. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { ExportPlanMenu, type ExportableSession } from "@/components/features/practice-planner/ExportPlanMenu";
import { decodePlanLink } from "@/lib/plan-document";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { renderWithPlanner } from "@/__tests__/helpers/planner";

const ROSTERED: ExportableSession = {
    title: "Pinewood 8U",
    date: "2026-10-08T22:00:00.000Z",
    duration: 60,
    startAt: null,
    venueTimezone: null,
    roster: {
        ageGroup: "u8",
        roles: ["S", "G"],
        players: [
            { key: "a", name: "Alex", number: "7", role: "S" },
            { key: "b", name: "", number: "", role: "G" },
        ],
    },
    plays: [{ sequence: 0, duration: 10, runsWithPrevious: false, instructions: null, play: { name: "Laps", description: null, playData: createEmptyPlayData() } }],
};

beforeEach(() => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:plan");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Export plan" }));
const downloaded = async () => JSON.parse(await (vi.mocked(URL.createObjectURL).mock.calls.at(-1)?.[0] as Blob).text());

describe("Export plan: Include player names", () => {
    it("isn't offered when no player has a name or a number", () => {
        const anonymous = { ...ROSTERED, roster: { ...ROSTERED.roster!, players: [{ key: "a", name: "", number: "", role: "S" }] } };
        renderWithPlanner(<ExportPlanMenu session={anonymous} />);
        openMenu();
        expect(screen.queryByRole("menuitemcheckbox", { name: /Include player names/ })).toBeNull();
    });

    it("downloads positions only by default", async () => {
        renderWithPlanner(<ExportPlanMenu session={ROSTERED} />);
        openMenu();
        expect(screen.getByRole("menuitemcheckbox", { name: /Include player names/ })).toHaveAttribute("aria-checked", "false");
        fireEvent.click(screen.getByRole("menuitem", { name: "Download plan file" }));
        const doc = await downloaded();
        expect(doc.session.roster.players).toEqual([{ role: "S" }, { role: "G" }]);
        expect(JSON.stringify(doc)).not.toContain("Alex");
    });

    it("downloads names and numbers once checked", async () => {
        renderWithPlanner(<ExportPlanMenu session={ROSTERED} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Include player names/ }));
        expect(screen.getByRole("menuitemcheckbox", { name: /Include player names/ })).toHaveAttribute("aria-checked", "true");
        fireEvent.click(screen.getByRole("menuitem", { name: "Download plan file" }));
        expect((await downloaded()).session.roster.players).toEqual([{ role: "S", name: "Alex", number: "7" }, { role: "G" }]);
    });

    it("never puts names in a plan link, even when checked", async () => {
        vi.stubEnv("NEXT_PUBLIC_STATIC_PLANNER_URL", "https://planner.example/app/");
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
        renderWithPlanner(<ExportPlanMenu session={ROSTERED} />);
        openMenu();
        fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Include player names/ }));
        fireEvent.click(screen.getByRole("menuitem", { name: /open in planner/i }));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        const raw = (await decodePlanLink((writeText.mock.calls[0][0] as string).split("#plan=")[1])) as { session: { roster: unknown } };
        expect(raw.session.roster).toEqual({ ageGroup: "u8", roles: ["S", "G"], players: [{ role: "S" }, { role: "G" }] });
        expect(JSON.stringify(raw)).not.toContain("Alex");
    });
});
