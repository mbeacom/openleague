import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth helpers
const mockRequireUserId = vi.fn();
const mockRequireTeamAdmin = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
  requireTeamAdmin: (...args: unknown[]) => mockRequireTeamAdmin(...args),
}));

// Mock Prisma
const mockPrismaTeam = { findUnique: vi.fn() };
const mockPrismaPlayer = { findMany: vi.fn() };
const mockPrismaTeamMember = { findMany: vi.fn() };
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    team: mockPrismaTeam,
    player: mockPrismaPlayer,
    teamMember: mockPrismaTeamMember,
  },
}));

import { GET } from "@/app/api/roster/export/route";

const TEAM_ID = "clxxxxxxxxxxxxxxxxxxxxxxxxx";

function makeRequest(teamId?: string): Request {
  const url = teamId
    ? `http://localhost:3000/api/roster/export?teamId=${teamId}`
    : "http://localhost:3000/api/roster/export";
  return new Request(url, { method: "GET" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockResolvedValue("user-123");
  mockRequireTeamAdmin.mockResolvedValue("user-123");
});

describe("GET /api/roster/export", () => {
  it("returns 400 when teamId is missing", async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(400);
  });

  it("returns 403 when user is not admin", async () => {
    mockRequireTeamAdmin.mockRejectedValue(
      new Error("Unauthorized: Only team admins can perform this action")
    );

    const response = await GET(makeRequest(TEAM_ID));
    expect(response.status).toBe(403);
  });

  it("returns 401 when user is not authenticated", async () => {
    mockRequireUserId.mockRejectedValue(new Error("NEXT_REDIRECT"));

    const response = await GET(makeRequest(TEAM_ID));
    expect(response.status).toBe(401);
  });

  it("returns 404 when team not found", async () => {
    mockPrismaTeam.findUnique.mockResolvedValue(null);

    const response = await GET(makeRequest(TEAM_ID));
    expect(response.status).toBe(404);
  });

  it("returns valid CSV with header row only for empty roster", async () => {
    mockPrismaTeam.findUnique.mockResolvedValue({ name: "Test Team" });
    mockPrismaPlayer.findMany.mockResolvedValue([]);
    mockPrismaTeamMember.findMany.mockResolvedValue([]);

    const response = await GET(makeRequest(TEAM_ID));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/csv; charset=utf-8"
    );

    const body = await response.text();
    // Should have BOM + header row only
    expect(body.charCodeAt(0)).toBe(0xfeff);
    const lines = body.slice(1).split("\r\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Name");
    expect(lines[0]).toContain("USA Hockey Member ID");
  });

  it("quotes player name containing comma in CSV output", async () => {
    mockPrismaTeam.findUnique.mockResolvedValue({ name: "Test Team" });
    mockPrismaPlayer.findMany.mockResolvedValue([
      {
        name: "Smith, John",
        email: "john@test.com",
        phone: null,
        jerseyNumber: 7,
        usahMemberId: null,
        emergencyContact: null,
        emergencyPhone: null,
      },
    ]);
    mockPrismaTeamMember.findMany.mockResolvedValue([]);

    const response = await GET(makeRequest(TEAM_ID));
    const body = await response.text();
    // The name should be double-quoted per RFC 4180
    expect(body).toContain('"Smith, John"');
  });

  it("escapes player name containing double-quote in CSV output", async () => {
    mockPrismaTeam.findUnique.mockResolvedValue({ name: "Test Team" });
    mockPrismaPlayer.findMany.mockResolvedValue([
      {
        name: 'O"Brien',
        email: null,
        phone: null,
        jerseyNumber: null,
        usahMemberId: null,
        emergencyContact: null,
        emergencyPhone: null,
      },
    ]);
    mockPrismaTeamMember.findMany.mockResolvedValue([]);

    const response = await GET(makeRequest(TEAM_ID));
    const body = await response.text();
    // Double-quote should be escaped as ""
    expect(body).toContain('"O""Brien"');
  });

  it("places officials before players in output", async () => {
    mockPrismaTeam.findUnique.mockResolvedValue({ name: "Test Team" });
    mockPrismaPlayer.findMany.mockResolvedValue([
      {
        name: "Alice Player",
        email: null,
        phone: null,
        jerseyNumber: 7,
        usahMemberId: null,
        emergencyContact: null,
        emergencyPhone: null,
      },
    ]);
    mockPrismaTeamMember.findMany.mockResolvedValue([
      {
        role: "ADMIN",
        usahMemberId: "COACH1",
        user: { name: "Coach Bob", email: "bob@test.com" },
      },
    ]);

    const response = await GET(makeRequest(TEAM_ID));
    const body = await response.text();
    const lines = body.slice(1).split("\r\n");
    // Line 0: header, Line 1: official, Line 2: player
    expect(lines[1]).toContain("Team Official");
    expect(lines[1]).toContain("Coach Bob");
    expect(lines[2]).toContain("Player");
    expect(lines[2]).toContain("Alice Player");
  });

  it("sets Content-Disposition header with team name slug", async () => {
    mockPrismaTeam.findUnique.mockResolvedValue({
      name: "My Awesome Team!",
    });
    mockPrismaPlayer.findMany.mockResolvedValue([]);
    mockPrismaTeamMember.findMany.mockResolvedValue([]);

    const response = await GET(makeRequest(TEAM_ID));
    const disposition = response.headers.get("Content-Disposition");
    expect(disposition).toContain("my-awesome-team");
    expect(disposition).toContain(".csv");
  });
});
