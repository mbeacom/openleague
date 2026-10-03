/** Import a practice plan (ADR-0020): file or #plan= link → preview → team → new session. */
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push }) }));
const actions = vi.hoisted(() => ({ importPracticePlan: vi.fn() }));
vi.mock("@/lib/actions/practice-plan-import", () => actions);
const planBytes = vi.hoisted(() => ({ override: null as number | null }));
vi.mock("@/lib/plan-document", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/lib/plan-document")>();
    return {
        ...original,
        planByteLength: (plan: Parameters<typeof original.planByteLength>[0]) => planBytes.override ?? original.planByteLength(plan),
    };
});
vi.mock("@/lib/utils/canvas/thumbnail-generator", () => ({
    generateThumbnail: vi.fn(() => "data:image/png;base64,AA=="),
}));

import {
    FILE_TOO_LARGE_MESSAGE,
    NO_IMPORT_TEAMS_MESSAGE,
    PLAN_TOO_LARGE_TO_IMPORT_MESSAGE,
    PlanImportView,
} from "@/components/features/practice-planner/PlanImportView";
import {
    INVALID_PLAN_MESSAGE,
    LINK_UNREADABLE_MESSAGE,
    MAX_PLAN_FILE_BYTES,
    NEWER_VERSION_MESSAGE,
    NOT_A_PLAN_MESSAGE,
    PLAN_FORMAT,
    encodePlanLink,
    serializePlan,
    type PlanSessionInput,
} from "@/lib/plan-document";
import { PENDING_PLAN_KEY } from "@/lib/plan-document/pending";
import { createEmptyPlayData } from "@/lib/utils/play-data";
import { parseDateTimeLocalToUtc, resolveTimeZone } from "@/lib/utils/date";

const LIONS = { id: "clionsxxxxxxxxxxxxxxxxxxx", name: "Lions" };
const BEARS = { id: "cbearsxxxxxxxxxxxxxxxxxxx", name: "Bears" };
const NEW_SESSION = "cnewsessionxxxxxxxxxxxxxx";

function plan(overrides: Partial<PlanSessionInput> = {}) {
    return serializePlan(
        {
            title: "Tuesday Skills Practice",
            durationMinutes: 60,
            date: "2026-10-06",
            startTime: "19:00",
            drills: [
                { sequence: 0, duration: 10, runsWithPrevious: false, instructions: "Two laps", name: "Warmup Laps", description: "", playData: createEmptyPlayData() },
                { sequence: 1, duration: 15, runsWithPrevious: false, instructions: "", name: "Breakout", description: "", playData: createEmptyPlayData() },
                { sequence: 2, duration: 10, runsWithPrevious: true, instructions: "", name: "Regroup", description: "", playData: createEmptyPlayData() },
            ],
            ...overrides,
        },
        "openleague-static",
        new Date("2026-10-03T18:00:00.000Z"),
    );
}

function upload(contents: BlobPart, name = "plan.olplan.json") {
    fireEvent.change(screen.getByTestId("plan-file-input"), {
        target: { files: [new File([contents], name, { type: "application/json" })] },
    });
}

const title = () => screen.findByRole("heading", { name: "Tuesday Skills Practice" });

beforeEach(() => {
    vi.clearAllMocks();
    planBytes.override = null;
    sessionStorage.clear();
    window.history.replaceState(null, "", "/practice-planner/import");
});

afterEach(() => {
    sessionStorage.clear();
});

describe("PlanImportView: getting the plan in", () => {
    it("reads a #plan= fragment and clears the hash", async () => {
        window.history.replaceState(null, "", `/practice-planner/import#plan=${await encodePlanLink(plan())}`);
        render(<PlanImportView teams={[LIONS]} />);
        expect(await title()).toBeInTheDocument();
        expect(window.location.hash).toBe("");
    });

    it("still shows the fragment's plan when StrictMode replays the mount effect", async () => {
        window.history.replaceState(null, "", `/practice-planner/import#plan=${await encodePlanLink(plan())}`);
        render(
            <StrictMode>
                <PlanImportView teams={[LIONS]} />
            </StrictMode>,
        );
        expect(await title()).toBeInTheDocument();
    });

    it("consumes a plan stashed by the login page", async () => {
        sessionStorage.setItem(PENDING_PLAN_KEY, JSON.stringify({ value: await encodePlanLink(plan()), savedAt: Date.now() }));
        render(<PlanImportView teams={[LIONS]} />);
        expect(await title()).toBeInTheDocument();
        expect(sessionStorage.getItem(PENDING_PLAN_KEY)).toBeNull();
    });

    it("reads a chosen file", async () => {
        render(<PlanImportView teams={[LIONS]} />);
        upload(JSON.stringify(plan()));
        expect(await title()).toBeInTheDocument();
    });
});

describe("PlanImportView: preview", () => {
    it("shows duration, planned minutes and station groups", async () => {
        render(<PlanImportView teams={[LIONS]} />);
        upload(JSON.stringify(plan()));
        await title();
        expect(screen.getByText("60 min · Planned 25 of 60 min")).toBeInTheDocument();
        expect(screen.getByText("Stations · 2 · 15 min")).toBeInTheDocument();
        expect(screen.getByText("Warmup Laps")).toBeInTheDocument();
        expect(screen.getAllByRole("img", { name: /diagram$/ })).toHaveLength(3);
    });
});

describe("PlanImportView: errors", () => {
    it.each([
        ["a file that isn't JSON", "not json at all", NOT_A_PLAN_MESSAGE],
        ["a newer plan", JSON.stringify({ format: PLAN_FORMAT, version: 2 }), NEWER_VERSION_MESSAGE],
    ])("shows %s with a way to choose another file", async (_label, contents, message) => {
        render(<PlanImportView teams={[LIONS]} />);
        upload(contents);
        expect(await screen.findByText(message)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Choose another file" })).toBeInTheDocument();
    });

    it("lists each problem in an invalid plan", async () => {
        const broken = JSON.parse(JSON.stringify(plan()));
        broken.session.drills[0].durationMinutes = 0;
        render(<PlanImportView teams={[LIONS]} />);
        upload(JSON.stringify(broken));
        expect(await screen.findByText(INVALID_PLAN_MESSAGE)).toBeInTheDocument();
        expect(screen.getByText('Drill 1 ("Warmup Laps"): Drill length must be at least 1 minute')).toBeInTheDocument();
    });

    it("refuses a file over the size cap before reading it", async () => {
        render(<PlanImportView teams={[LIONS]} />);
        upload(new Uint8Array(MAX_PLAN_FILE_BYTES + 1));
        expect(await screen.findByText(FILE_TOO_LARGE_MESSAGE)).toBeInTheDocument();
    });

    it("caps plan files at 900 KB, under the 1 MB server-action body limit", async () => {
        expect(MAX_PLAN_FILE_BYTES).toBe(900_000);
        expect(FILE_TOO_LARGE_MESSAGE).toBe("This file is too large to be a practice plan (the limit is 900 KB).");
        render(<PlanImportView teams={[LIONS]} />);
        upload(new Uint8Array(MAX_PLAN_FILE_BYTES)); // at the cap: read, then refused as not a plan
        expect(await screen.findByText(NOT_A_PLAN_MESSAGE)).toBeInTheDocument();
        expect(screen.queryByText(FILE_TOO_LARGE_MESSAGE)).not.toBeInTheDocument();
    });

    it("shows a damaged link as unreadable", async () => {
        window.history.replaceState(null, "", "/practice-planner/import#plan=@@@");
        render(<PlanImportView teams={[LIONS]} />);
        expect(await screen.findByText(LINK_UNREADABLE_MESSAGE)).toBeInTheDocument();
    });
});

describe("PlanImportView: form", () => {
    it("auto-selects the only team and imports, then opens the editor", async () => {
        actions.importPracticePlan.mockResolvedValue({ success: true, data: { sessionId: NEW_SESSION } });
        render(<PlanImportView teams={[LIONS]} />);
        upload(JSON.stringify(plan()));
        await title();

        expect(screen.getByRole("combobox", { name: /team/i })).toHaveTextContent("Lions");
        fireEvent.click(screen.getByLabelText("Also add these drills to the team library"));
        fireEvent.click(screen.getByRole("button", { name: "Import plan" }));

        await waitFor(() => expect(nav.push).toHaveBeenCalledWith(`/practice-planner/${NEW_SESSION}/edit`));
        expect(actions.importPracticePlan).toHaveBeenCalledWith({
            teamId: LIONS.id,
            document: plan(),
            date: parseDateTimeLocalToUtc("2026-10-06T19:00", resolveTimeZone())!.toISOString(),
            addToLibrary: true,
        });
    });

    it("needs a team chosen when there are several", async () => {
        render(<PlanImportView teams={[BEARS, LIONS]} />);
        upload(JSON.stringify(plan()));
        await title();
        expect(screen.getByRole("button", { name: "Import plan" })).toBeDisabled();
    });

    it("needs both date and start time when the plan has none", async () => {
        render(<PlanImportView teams={[LIONS]} />);
        upload(JSON.stringify(plan({ date: null, startTime: null })));
        await title();
        const button = screen.getByRole("button", { name: "Import plan" });
        expect(button).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: "2026-10-06" } });
        expect(button).toBeDisabled();
        fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: "19:00" } });
        expect(button).toBeEnabled();
    });

    it("shows the action's error and stays on the page", async () => {
        actions.importPracticePlan.mockResolvedValue({ success: false, error: "You can't schedule practices for this team." });
        render(<PlanImportView teams={[LIONS]} />);
        upload(JSON.stringify(plan()));
        await title();
        fireEvent.click(screen.getByRole("button", { name: "Import plan" }));
        expect(await screen.findByText("You can't schedule practices for this team.")).toBeInTheDocument();
        expect(nav.push).not.toHaveBeenCalled();
    });

    it("refuses to send a plan whose JSON is over the cap, without calling the action", async () => {
        render(<PlanImportView teams={[LIONS]} />);
        upload(JSON.stringify(plan()));
        await title();
        planBytes.override = MAX_PLAN_FILE_BYTES + 1;
        fireEvent.click(screen.getByRole("button", { name: "Import plan" }));
        expect(await screen.findByText(PLAN_TOO_LARGE_TO_IMPORT_MESSAGE)).toBeInTheDocument();
        expect(PLAN_TOO_LARGE_TO_IMPORT_MESSAGE).toBe("This plan is too large to import (over 900 KB).");
        expect(actions.importPracticePlan).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Import plan" })).toBeEnabled();
    });

    it("explains when the user can't import into any team", async () => {
        render(<PlanImportView teams={[]} />);
        expect(screen.getByText(NO_IMPORT_TEAMS_MESSAGE)).toBeInTheDocument();
        upload(JSON.stringify(plan()));
        await title();
        expect(screen.getByRole("button", { name: "Import plan" })).toBeDisabled();
    });
});
