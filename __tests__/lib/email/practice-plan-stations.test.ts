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
            where: {
                sessionId: "sess1",
                OR: [
                    { userId: { in: ["coach", "parent"] }, user: { teamMembers: { some: { teamId: "team1", role: "ADMIN" } } } },
                    { teamOfficial: { userId: { in: ["coach", "parent"] }, teamId: "team1", status: { in: ["ACTIVE", "INVITED"] } } },
                ],
            },
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

    it("leaves out a linked person who runs nothing, and falls back to the shared email when a personal send fails", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        mockPrisma.practiceSessionStaff.findMany.mockResolvedValue([
            { id: "st-coach", userId: "coach", teamOfficial: null },
            { id: "st-idle", userId: "parent", teamOfficial: null },
        ]);
        mockSendEmail.mockRejectedValueOnce(new Error("provider down"));
        await sendPracticePlanNotifications("sess1", "team1", "shared");
        // coach's own email failed (logged), so coach joins the shared one; parent runs nothing, so gets the shared one.
        expect(mockSendEmail).toHaveBeenCalledTimes(2);
        expect(to(0)).toEqual(["coach@example.com"]);
        expect(to(1)).toEqual(["coach@example.com", "parent@example.com"]);
        expect(mockSendEmail.mock.calls[1][0].text).not.toContain("Your stations");
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });

    it("keeps going after a failed personal send: the next person still gets theirs, and nobody is sent the shared email twice", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        mockPrisma.practiceSessionStaff.findMany.mockResolvedValue([
            { id: "st-coach", userId: "coach", teamOfficial: null },
            { id: "st-other", userId: "parent", teamOfficial: null },
        ]);
        mockSendEmail.mockRejectedValueOnce(new Error("provider down"));
        await sendPracticePlanNotifications("sess1", "team1", "shared");
        expect(mockSendEmail).toHaveBeenCalledTimes(3);
        expect(to(1)).toEqual(["parent@example.com"]);
        expect(mockSendEmail.mock.calls[1][0].text).toContain("Your stations: <Breakout> (6:10 PM)");
        expect(to(2)).toEqual(["coach@example.com"]);
        consoleError.mockRestore();
    });

    it("sends the shared email to everyone eligible when the staff read fails", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        mockPrisma.practiceSessionStaff.findMany.mockRejectedValue(new Error("db down"));
        await sendPracticePlanNotifications("sess1", "team1", "shared");
        expect(mockSendEmail).toHaveBeenCalledTimes(1);
        expect(to(0)).toEqual(["coach@example.com", "parent@example.com"]);
        expect(mockSendEmail.mock.calls[0][0].text).not.toContain("Your stations");
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });

    it.each([
        ["REMOVED", ["coach@example.com", "parent@example.com"], 1],
        ["INVITED", ["parent@example.com"], 2],
    ] as const)("gives stations only through a live link: an official %s on the team (a demoted admin never)", async (status, sharedTo, sends) => {
        const consoleError = vi.spyOn(console, "error");
        // A stand-in for the database: applies the query's link rules to stored staff.
        const stored = [
            { id: "st-coach", userId: null, teamOfficial: { userId: "coach", teamId: "team1", status }, user: null },
            { id: "st-other", userId: "parent", teamOfficial: null, user: { memberships: [{ teamId: "team1", role: "MEMBER" }] } },
        ];
        // Like Prisma, a filter the query leaves out matches everything.
        type Where = { OR: [
            { userId: { in: string[] }; user?: { teamMembers: { some: { teamId: string; role: string } } } },
            { teamOfficial: { userId: { in: string[] }; teamId?: string; status?: { in: string[] } } },
        ] };
        mockPrisma.practiceSessionStaff.findMany.mockImplementation(async ({ where }: { where: Where }) => {
            const [byUser, byOfficial] = where.OR;
            const admin = byUser.user?.teamMembers.some;
            const official = byOfficial.teamOfficial;
            return stored
                .filter((member) =>
                    (member.userId !== null && byUser.userId.in.includes(member.userId) &&
                        (!admin || member.user!.memberships.some((m) => m.teamId === admin.teamId && m.role === admin.role))) ||
                    (member.teamOfficial !== null && official.userId.in.includes(member.teamOfficial.userId) &&
                        (official.teamId === undefined || member.teamOfficial.teamId === official.teamId) &&
                        (official.status === undefined || official.status.in.includes(member.teamOfficial.status))))
                .map(({ id, userId, teamOfficial }) => ({ id, userId, teamOfficial: teamOfficial && { userId: teamOfficial.userId } }));
        });
        await sendPracticePlanNotifications("sess1", "team1", "shared");
        expect(consoleError).not.toHaveBeenCalled();
        expect(mockSendEmail).toHaveBeenCalledTimes(sends);
        if (sends === 2) expect(to(0)).toEqual(["coach@example.com"]);
        expect(to(sends - 1)).toEqual(sharedTo);
        expect(mockSendEmail.mock.calls[sends - 1][0].text).not.toContain("Your stations");
        consoleError.mockRestore();
    });

    it("counts each gap between blocks in a later row's start", async () => {
        mockPrisma.practiceSessionStaff.findMany.mockResolvedValue([{ id: "st-muted", userId: "coach", teamOfficial: null }]);
        await sendPracticePlanNotifications("sess1", "team1", "shared");
        // 6:00 + 8 min warm-up + 2 min gap + 10 min Breakout + 2 min gap.
        expect(mockSendEmail.mock.calls[0][0].text).toContain("Your stations: Scrimmage (6:22 PM)\n");
    });
});
