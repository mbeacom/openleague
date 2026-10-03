/**
 * The hosted store is the server actions themselves, by identity, so no
 * wrapper can change their arguments, timing or errors. Both route groups
 * provide it.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const plays = vi.hoisted(() => ({ getPlaysByTeam: vi.fn(), getPlayById: vi.fn(), createPlay: vi.fn(), deletePlay: vi.fn() }));
const drills = vi.hoisted(() => ({ saveSessionDrill: vi.fn(), copySessionDrillToLibrary: vi.fn(), duplicatePracticeSession: vi.fn() }));
const sessions = vi.hoisted(() => ({ deletePracticeSession: vi.fn(), sharePracticeSession: vi.fn() }));
vi.mock("@/lib/actions/plays", () => plays);
vi.mock("@/lib/actions/practice-session-drills", () => drills);
vi.mock("@/lib/actions/practice-sessions", () => sessions);

import { HostedPlannerProvider, hostedPlannerStore } from "@/components/providers/HostedPlannerProvider";
import { usePlannerPlatform, usePlannerStore } from "@/lib/planner-store";
import PracticePlannerLayout from "@/app/(dashboard)/practice-planner/layout";
import PracticePlannerPrintLayout from "@/app/(print)/practice-planner/layout";

function Probe() {
    const store = usePlannerStore();
    const { routes } = usePlannerPlatform();
    return <p>{`${store === hostedPlannerStore ? "hosted" : "other"} ${routes.list()}`}</p>;
}

describe("HostedPlannerProvider", () => {
    it.each([
        ["getPlaysByTeam", plays.getPlaysByTeam],
        ["getPlayById", plays.getPlayById],
        ["createPlay", plays.createPlay],
        ["deletePlay", plays.deletePlay],
        ["saveSessionDrill", drills.saveSessionDrill],
        ["copySessionDrillToLibrary", drills.copySessionDrillToLibrary],
        ["duplicatePracticeSession", drills.duplicatePracticeSession],
        ["deletePracticeSession", sessions.deletePracticeSession],
        ["sharePracticeSession", sessions.sharePracticeSession],
    ] as const)("store.%s is the server action itself", (name, action) => {
        expect(hostedPlannerStore[name]).toBe(action);
    });

    it("provides the hosted store and platform", () => {
        render(<HostedPlannerProvider><Probe /></HostedPlannerProvider>);
        expect(screen.getByText("hosted /practice-planner")).toBeInTheDocument();
    });

    it("is mounted by the dashboard practice-planner layout", () => {
        render(<PracticePlannerLayout><Probe /></PracticePlannerLayout>);
        expect(screen.getByText("hosted /practice-planner")).toBeInTheDocument();
    });

    it("is mounted by the print layout, so the bench sheet has it too", () => {
        render(<PracticePlannerPrintLayout><Probe /></PracticePlannerPrintLayout>);
        expect(screen.getByText("hosted /practice-planner")).toBeInTheDocument();
    });
});
