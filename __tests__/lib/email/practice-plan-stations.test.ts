/** Practice-plan emails (spec R10): "Your stations" for a recipient linked to an assigned staff member. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSendEmail, mockPrisma } = vi.hoisted(() => ({
    mockSendEmail: vi.fn(),
    mockPrisma: {
        practiceSession: { findUnique: vi.fn() },
        practiceSessionStaff: { findMany: vi.fn() },
        practiceSessionPlay: { findMany: vi.fn() },
    },
}));

vi.mock("@/lib/email/client", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/env", () => ({ getBaseUrl: () => "http://localhost:3000" }));
vi.mock("@/lib/services/notification", () => ({ notificationService: {} }));

import { sendPracticePlanNotifications } from "@/lib/email/templates";

type Pref = { leagueId: string | null; practicePlanNotifications: boolean; emailEnabled: boolean };
const member = (id: string, prefs: Pref[] = []) => ({ user: { id, email: `${id}@example.com`, notificationPreferences: prefs } });
const MUTED: Pref[] = [{ leagueId: null, practicePlanNotifications: false, emailEnabled: true }];

/** 6:00 PM EDT on Tuesday, October 6, 2026; a 2-minute gap between blocks. */
function session(extra: Record<string, unknown> = {}) {
    return {
        id: "sess1", title: "Skills", date: new Date("2026-10-06T22:00:00.000Z"), startAt: null, duration: 60, teamId: "team1",
        transitionMinutes: 2, venue: null,
        team: { name: "Sharks", leagueId: null, members: [member("coach"), member("parent"), member("muted", MUTED)] },
        _count: { plays: 2 },
        plays: [{ kind: "warmup", label: null, duration: 8 }],
        ...extra,
    };
}

const ROWS = [
    { sequence: 0, duration: 8, runsWithPrevious: false, kind: "warmup", label: null, stays: false, rotateEveryMinutes: null, play: null, staff: [{ staffId: "st-coach" }] },
    { sequence: 1, duration: 10, runsWithPrevious: false, kind: "drill", label: null, stays: false, rotateEveryMinutes: null, play: { name: "<Breakout>" }, staff: [{ staffId: "st-coach" }, { staffId: "st-other" }] },
    { sequence: 2, duration: 10, runsWithPrevious: false, kind: "drill", label: null, stays: false, rotateEveryMinutes: null, play: { name: "Scrimmage" }, staff: [{ staffId: "st-muted" }] },
];

const to = (call: number) => mockSendEmail.mock.calls[call][0].to.map((recipient: { email: string }) => recipient.email);

beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue(undefined);
    mockPrisma.practiceSession.findUnique.mockResolvedValue(session());
    mockPrisma.practiceSessionStaff.findMany.mockResolvedValue([]);
    mockPrisma.practiceSessionPlay.findMany.mockResolvedValue(ROWS);
});

describe("sendPracticePlanNotifications: Your stations (spec R10)", () => {
    it("sends an assigned official with an account their own email, rows in schedule order with start times; the rest get the shared email", async () => {
        mockPrisma.practiceSessionStaff.findMany.mockResolvedValue([{ id: "st-coach", userId: null, teamOfficial: { userId: "coach" } }]);
        await sendPracticePlanNotifications("sess1", "team1", "shared");

        expect(mockSendEmail).toHaveBeenCalledTimes(2);
        expect(to(0)).toEqual(["coach@example.com"]);
        const personal = mockSendEmail.mock.calls[0][0];
        expect(personal.text).toContain("Your stations: Warm-up (6:00 PM), <Breakout> (6:10 PM)");
        expect(personal.html).toContain("<strong>Your stations:</strong> Warm-up (6:00 PM), &lt;Breakout&gt; (6:10 PM)");
        expect(to(1)).toEqual(["parent@example.com"]);
        expect(mockSendEmail.mock.calls[1][0].text).not.toContain("Your stations");
        expect(mockPrisma.practiceSessionStaff.findMany).toHaveBeenCalledWith({
            where: { sessionId: "sess1", OR: [{ userId: { in: ["coach", "parent"] } }, { teamOfficial: { userId: { in: ["coach", "parent"] } } }] },
            select: { id: true, userId: true, teamOfficial: { select: { userId: true } } },
        });
    });

    it("links a team admin by their own account, and joins two staff entries for one person into one line", async () => {
        mockPrisma.practiceSessionStaff.findMany.mockResolvedValue([
            { id: "st-coach", userId: "coach", teamOfficial: null },
            { id: "st-other", userId: "coach", teamOfficial: null },
        ]);
        await sendPracticePlanNotifications("sess1", "team1", "updated");
        expect(mockSendEmail.mock.calls[0][0].subject).toBe("Practice Plan Updated: Skills");
        expect(mockSendEmail.mock.calls[0][0].text).toContain("Your stations: Warm-up (6:00 PM), <Breakout> (6:10 PM)\n");
    });

    it("never emails a recipient whose preference is off, even when assigned", async () => {
        await sendPracticePlanNotifications("sess1", "team1", "shared");
        const where = mockPrisma.practiceSessionStaff.findMany.mock.calls[0][0].where;
        expect(where.OR[0].userId.in).not.toContain("muted");
        expect(mockSendEmail.mock.calls.flatMap((_, call) => to(call))).not.toContain("muted@example.com");
    });

    it("sends the shared email exactly as before when nobody is linked (a typed name gets nothing)", async () => {
        await sendPracticePlanNotifications("sess1", "team1", "shared");
        expect(mockSendEmail).toHaveBeenCalledTimes(1);
        expect(to(0)).toEqual(["coach@example.com", "parent@example.com"]);
        expect(mockSendEmail.mock.calls[0][0].text).not.toContain("Your stations");
        expect(mockPrisma.practiceSessionPlay.findMany).not.toHaveBeenCalled();
    });

    it("tells times in the venue's zone when the practice is booked", async () => {
        mockPrisma.practiceSession.findUnique.mockResolvedValue(session({
            venue: { timezone: "America/Denver" },
            startAt: new Date("2026-10-07T00:00:00.000Z"), // 6:00 PM MDT
        }));
        mockPrisma.practiceSessionStaff.findMany.mockResolvedValue([{ id: "st-coach", userId: "coach", teamOfficial: null }]);
        await sendPracticePlanNotifications("sess1", "team1", "shared");
        expect(mockSendEmail.mock.calls[0][0].text).toContain("Your stations: Warm-up (6:00 PM), <Breakout> (6:10 PM)");
        expect(mockPrisma.practiceSessionPlay.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { sessionId: "sess1" }, orderBy: { sequence: "asc" } }));
    });

    it("leaves out a linked person who runs nothing, and keeps going when one personal send fails", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        mockPrisma.practiceSessionStaff.findMany.mockResolvedValue([
            { id: "st-coach", userId: "coach", teamOfficial: null },
            { id: "st-idle", userId: "parent", teamOfficial: null },
        ]);
        mockSendEmail.mockRejectedValueOnce(new Error("provider down"));
        await sendPracticePlanNotifications("sess1", "team1", "shared");
        // coach's own email failed (logged); parent runs nothing, so gets the shared one.
        expect(mockSendEmail).toHaveBeenCalledTimes(2);
        expect(to(1)).toEqual(["parent@example.com"]);
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });
});
