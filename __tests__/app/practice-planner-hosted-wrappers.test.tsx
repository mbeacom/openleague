/** The hosted wrappers pass the goaltender fields from the shared editors to the server actions. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const captured = vi.hoisted(() => ({ props: null as null | Record<string, (arg: unknown) => Promise<unknown>> }));
const actions = vi.hoisted(() => ({
    updatePracticeSession: vi.fn(),
    createPracticeSession: vi.fn(),
    sharePracticeSession: vi.fn(),
    createPlay: vi.fn(),
    updatePlay: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/actions/practice-sessions", () => actions);
vi.mock("@/lib/actions/plays", () => actions);
vi.mock("@/components/features/practice-planner/PracticeSessionEditor", () => ({
    PracticeSessionEditor: (props: Record<string, (arg: unknown) => Promise<unknown>>) => {
        captured.props = props;
        return null;
    },
    extractBookingConflicts: () => undefined,
}));
vi.mock("@/components/features/practice-planner/PlayEditor", () => ({
    PlayEditor: (props: Record<string, (arg: unknown) => Promise<unknown>>) => {
        captured.props = props;
        return null;
    },
}));

import { EditSessionWrapper } from "@/app/(dashboard)/practice-planner/[sessionId]/edit/EditSessionWrapper";
import { PracticeSessionEditorWrapper } from "@/app/(dashboard)/practice-planner/new/PracticeSessionEditorWrapper";
import { PlayEditorWrapper } from "@/app/(dashboard)/practice-planner/library/PlayEditorWrapper";
import { createEmptyPlayData } from "@/lib/utils/play-data";

const TEAM = "cteamxxxxxxxxxxxxxxxxxxxx";
const SESSION = "csessionxxxxxxxxxxxxxxxxx";
const BOOKING = { venues: [], reservations: [], currentReservationId: null, surfacesByVenue: {}, segmentsBySurface: {}, wholeLabelBySurface: {} };
const submitted = {
    title: "Tuesday", date: new Date("2026-04-07T22:00:00.000Z"), duration: 60, plays: [], isShared: false,
    goaliesAttending: 0, overrideConflicts: false, overrideReason: "", notify: false,
};

beforeEach(() => {
    vi.clearAllMocks();
    actions.updatePracticeSession.mockResolvedValue({ success: true, data: { id: SESSION, plays: [] } });
    actions.createPracticeSession.mockResolvedValue({ success: true, data: { id: SESSION, plays: [] } });
    actions.createPlay.mockResolvedValue({ success: true, data: { id: "p", name: "D", isTemplate: true } });
});

describe("hosted wrappers: goaltender fields", () => {
    it("EditSessionWrapper sends goaliesAttending", async () => {
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={{}} bookingOptions={BOOKING as never} />);
        await captured.props!.onSave(submitted);
        expect(actions.updatePracticeSession.mock.calls[0][0]).toMatchObject({ goaliesAttending: 0 });
    });

    it("EditSessionWrapper leaves the count alone when the editor omits it (an explicit null still clears)", async () => {
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={{}} bookingOptions={BOOKING as never} />);
        const { goaliesAttending: _omitted, ...withoutCount } = submitted;
        await captured.props!.onSave(withoutCount);
        expect(actions.updatePracticeSession.mock.calls[0][0]).not.toHaveProperty("goaliesAttending");
        await captured.props!.onSave({ ...submitted, goaliesAttending: null });
        expect(actions.updatePracticeSession.mock.calls[1][0]).toMatchObject({ goaliesAttending: null });
    });

    it("PracticeSessionEditorWrapper sends goaliesAttending", async () => {
        render(<PracticeSessionEditorWrapper teamId={TEAM} bookingOptions={BOOKING as never} />);
        await captured.props!.onSave({ ...submitted, goaliesAttending: 2 });
        expect(actions.createPracticeSession.mock.calls[0][0]).toMatchObject({ goaliesAttending: 2 });
    });

    it("PlayEditorWrapper sends the drill tags", async () => {
        render(<PlayEditorWrapper teamId={TEAM} />);
        await captured.props!.onSave({
            id: "", name: "Warm-up", description: "", thumbnail: "", playData: createEmptyPlayData(), isTemplate: true,
            focus: "goalies", goalies: "required", createdAt: new Date(), updatedAt: new Date(),
        });
        expect(actions.createPlay.mock.calls[0][0]).toMatchObject({ focus: "goalies", goalies: "required" });
    });
});
