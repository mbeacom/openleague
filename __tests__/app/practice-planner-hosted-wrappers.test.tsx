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
/** The edit page always loads the stored gap and staff (getPracticeSessionForEdit): 0 and [] when none were set. */
const LOADED = { transitionMinutes: 0, staff: [] };
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
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={LOADED} bookingOptions={BOOKING as never} />);
        await captured.props!.onSave(submitted);
        expect(actions.updatePracticeSession.mock.calls[0][0]).toMatchObject({ goaliesAttending: 0 });
    });

    it("EditSessionWrapper leaves the count alone when the editor omits it (an explicit null still clears)", async () => {
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={LOADED} bookingOptions={BOOKING as never} />);
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

    it("PlayEditorWrapper sends the age groups on create and on update", async () => {
        const drill = {
            id: "", name: "Keep-Away", description: "", thumbnail: "", playData: createEmptyPlayData(), isTemplate: true,
            ageGroups: ["u6", "u8"], createdAt: new Date(), updatedAt: new Date(),
        };
        render(<PlayEditorWrapper teamId={TEAM} />);
        await captured.props!.onSave(drill);
        expect(actions.createPlay.mock.calls[0][0]).toMatchObject({ ageGroups: ["u6", "u8"] });

        actions.updatePlay.mockResolvedValue({ success: true, data: { id: "cplayxxxxxxxxxxxxxxxxxxxx", name: "Keep-Away", isTemplate: true } });
        render(<PlayEditorWrapper teamId={TEAM} play={{ ...drill, id: "cplayxxxxxxxxxxxxxxxxxxxx" } as never} />);
        await captured.props!.onSave({ ...drill, ageGroups: [] });
        expect(actions.updatePlay.mock.calls[0][0]).toMatchObject({ id: "cplayxxxxxxxxxxxxxxxxxxxx", ageGroups: [] });
    });
});

describe("hosted wrappers: block rows and the gap", () => {
    const ROWS = [
        { id: "kw", kind: "warmup", label: " Laps ", sequence: 0, duration: 8, instructions: "", runsWithPrevious: false },
        { id: "k1", playId: "cplayxxxxxxxxxxxxxxxxxxxx", name: "A", sequence: 1, runsWithPrevious: false, duration: 10, instructions: "", playData: createEmptyPlayData(), stays: false, rotateEveryMinutes: null },
    ];
    const SENT = [
        { kind: "warmup", clientKey: "kw", sequence: 0, duration: 8, instructions: "", label: "Laps" },
        { kind: "drill", playId: "cplayxxxxxxxxxxxxxxxxxxxx", clientKey: "k1", sequence: 1, runsWithPrevious: false, duration: 10, instructions: "", stays: false, rotateEveryMinutes: null },
    ];

    it("EditSessionWrapper sends every row and the gap", async () => {
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={LOADED} bookingOptions={BOOKING as never} />);
        await captured.props!.onSave({ ...submitted, plays: ROWS, transitionMinutes: 2 });
        const sent = actions.updatePracticeSession.mock.calls[0][0];
        expect(sent.plays).toEqual(SENT);
        expect(sent.transitionMinutes).toBe(2);
    });

    it("EditSessionWrapper hands the editor the loaded gap and sends a 0-minute gap back, so the server knows the editor is current", async () => {
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={LOADED} bookingOptions={BOOKING as never} />);
        expect((captured.props as unknown as { initialData: { transitionMinutes?: number } }).initialData.transitionMinutes).toBe(0);
        await captured.props!.onSave({ ...submitted, plays: [], transitionMinutes: 0 });
        expect(actions.updatePracticeSession.mock.calls[0][0]).toMatchObject({ plays: [], transitionMinutes: 0 });
    });

    it("EditSessionWrapper can't be given a session without its gap (type check)", () => {
        // @ts-expect-error -- the edit page must load transitionMinutes, so every update says the editor is current.
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={{}} bookingOptions={BOOKING as never} />);
        expect(captured.props).not.toBeNull();
    });

    it("EditSessionWrapper leaves the gap out when the editor holds none, so the stored gap stays", async () => {
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={LOADED} bookingOptions={BOOKING as never} />);
        await captured.props!.onSave({ ...submitted });
        expect(actions.updatePracticeSession.mock.calls[0][0]).not.toHaveProperty("transitionMinutes");
    });

    it("PracticeSessionEditorWrapper sends every row on create", async () => {
        render(<PracticeSessionEditorWrapper teamId={TEAM} bookingOptions={BOOKING as never} />);
        await captured.props!.onSave({ ...submitted, plays: ROWS, transitionMinutes: 1 });
        const sent = actions.createPracticeSession.mock.calls[0][0];
        expect(sent.plays).toEqual(SENT);
        expect(sent.transitionMinutes).toBe(1);
    });
});

describe("hosted wrappers: practice staff (spec R3, R4)", () => {
    const STAFF = [{ id: "cstaffxxxxxxxxxxxxxxxxxxx", name: "Coach Lee", teamOfficialId: "cofficialxxxxxxxxxxxxxxxx", userId: null }, { id: "k-new", name: "Sam" }];
    const ROWS = [{ id: "k1", playId: "cplayxxxxxxxxxxxxxxxxxxxx", name: "A", sequence: 0, runsWithPrevious: false, duration: 10, instructions: "", playData: createEmptyPlayData(), staff: ["k-new"] }];
    const OPTIONS = [{ kind: "official", id: "cofficialxxxxxxxxxxxxxxxx", name: "Coach Lee", roleLabel: "Head Coach" }];

    it("EditSessionWrapper sends the list as keys and names (links only when set) and each row's keys", async () => {
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={LOADED} bookingOptions={BOOKING as never} />);
        await captured.props!.onSave({ ...submitted, plays: ROWS, staff: STAFF });
        const sentSave = actions.updatePracticeSession.mock.calls[0][0];
        expect(sentSave.staff).toEqual([
            { key: "cstaffxxxxxxxxxxxxxxxxxxx", name: "Coach Lee", teamOfficialId: "cofficialxxxxxxxxxxxxxxxx" },
            { key: "k-new", name: "Sam" },
        ]);
        expect(sentSave.plays[0].staff).toEqual(["k-new"]);
    });

    it("EditSessionWrapper hands the editor the save's staff ids, for the key → id swap", async () => {
        const saved = [{ key: "cstaffxxxxxxxxxxxxxxxxxxx", id: "cstaffxxxxxxxxxxxxxxxxxxx" }, { key: "k-new", id: "cstaffnewxxxxxxxxxxxxxxxx" }];
        actions.updatePracticeSession.mockResolvedValue({ success: true, data: { id: SESSION, plays: [], staff: saved } });
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={LOADED} bookingOptions={BOOKING as never} />);
        await expect(captured.props!.onSave({ ...submitted, plays: ROWS, staff: STAFF })).resolves.toEqual({ success: true, plays: [], staff: saved });
    });

    it("EditSessionWrapper and PracticeSessionEditorWrapper leave staff out when the editor holds none", async () => {
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={LOADED} bookingOptions={BOOKING as never} />);
        await captured.props!.onSave({ ...submitted });
        expect(actions.updatePracticeSession.mock.calls[0][0]).not.toHaveProperty("staff");
        render(<PracticeSessionEditorWrapper teamId={TEAM} bookingOptions={BOOKING as never} />);
        await captured.props!.onSave({ ...submitted });
        expect(actions.createPracticeSession.mock.calls[0][0]).not.toHaveProperty("staff");
    });

    it("both wrappers hand the editor the picker's options", () => {
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={LOADED} bookingOptions={BOOKING as never} staffOptions={OPTIONS as never} />);
        expect((captured.props as unknown as { staffOptions: unknown }).staffOptions).toEqual(OPTIONS);
        render(<PracticeSessionEditorWrapper teamId={TEAM} bookingOptions={BOOKING as never} staffOptions={OPTIONS as never} />);
        expect((captured.props as unknown as { staffOptions: unknown }).staffOptions).toEqual(OPTIONS);
    });

    it("EditSessionWrapper can't be given a session without its staff (type check)", () => {
        // @ts-expect-error -- the edit page must load staff, so a current editor always sends its list.
        render(<EditSessionWrapper sessionId={SESSION} teamId={TEAM} initialData={{ transitionMinutes: 0 }} bookingOptions={BOOKING as never} />);
        expect(captured.props).not.toBeNull();
    });
});
