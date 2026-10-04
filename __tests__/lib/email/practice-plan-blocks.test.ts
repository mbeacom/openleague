/** Practice-plan emails (spec R11): drills are counted, block rows are listed by label with minutes. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSendEmail, mockPrisma } = vi.hoisted(() => ({
    mockSendEmail: vi.fn(),
    mockPrisma: { practiceSession: { findUnique: vi.fn() } },
}));

vi.mock("@/lib/email/client", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/utils/date", () => ({ FALLBACK_TIME_ZONE: "America/New_York", formatDateTime: vi.fn(() => "Jan 1, 2026, 10:00 AM") }));
vi.mock("@/lib/env", () => ({ getBaseUrl: () => "http://localhost:3000" }));
vi.mock("@/lib/services/notification", () => ({ notificationService: {} }));

import { sendPracticePlanNotifications } from "@/lib/email/templates";

function session(plays: Array<{ kind: string; label: string | null; duration: number }>) {
    return {
        id: "sess1", title: "Skills", date: new Date("2026-01-01T15:00:00Z"), duration: 60, teamId: "team1",
        team: { name: "Sharks", leagueId: null, members: [{ user: { id: "u1", email: "u1@example.com", notificationPreferences: [] } }] },
        _count: { plays: 2 },
        plays,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue(undefined);
});

describe("practice-plan emails with block rows", () => {
    it("counts drills only and lists blocks by label with minutes, escaped in HTML", async () => {
        mockPrisma.practiceSession.findUnique.mockResolvedValue(session([
            { kind: "warmup", label: null, duration: 8 },
            { kind: "break", label: "<Water>", duration: 2 },
        ]));
        await sendPracticePlanNotifications("sess1", "team1", "shared");
        const message = mockSendEmail.mock.calls[0][0];
        expect(message.text).toContain("Number of Drills: 2");
        expect(message.text).toContain("Also planned: Warm-up · 8 min, <Water> · 2 min");
        expect(message.html).toContain("Warm-up · 8 min, &lt;Water&gt; · 2 min");
        const query = mockPrisma.practiceSession.findUnique.mock.calls[0][0];
        expect(query.include._count).toEqual({ select: { plays: { where: { kind: "drill" } } } });
        expect(query.include.plays).toMatchObject({ where: { kind: { not: "drill" } }, orderBy: { sequence: "asc" } });
    });

    it("adds no line for a plan without blocks, in the updated email too", async () => {
        mockPrisma.practiceSession.findUnique.mockResolvedValue(session([]));
        await sendPracticePlanNotifications("sess1", "team1", "updated");
        expect(mockSendEmail.mock.calls[0][0].text).not.toContain("Also planned");
    });
});
