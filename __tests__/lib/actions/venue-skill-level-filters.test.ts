import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    venue: { findFirst: vi.fn() },
    venueContentPost: { findMany: vi.fn() },
    lessonOffering: { findMany: vi.fn() },
    venueScheduleBlock: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", () => ({ requireVenueContentManager: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email/templates", () => ({ sendVenueRelationshipInvitationEmail: vi.fn() }));

import { getPublicVenueContent } from "@/lib/actions/venue-content";
import { getPublicVenueSchedule } from "@/lib/actions/venue-schedules";

describe("public skill level filters", () => {
  it("filters public schedule blocks by level IDs", async () => {
    mockPrisma.venue.findFirst.mockResolvedValue({ id: "venue", name: "Rink", scheduleBlocks: [] });

    await getPublicVenueSchedule("north-rink", { skillLevelIds: ["clsklxxxxxxxxxxxxxxxxxxxxxxx"] });

    expect(mockPrisma.venue.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          scheduleBlocks: expect.objectContaining({
            where: expect.objectContaining({
              skillLevels: { some: { id: { in: ["clsklxxxxxxxxxxxxxxxxxxxxxxx"] } } },
            }),
          }),
        }),
      })
    );
  });

  it("filters public lessons by level IDs", async () => {
    mockPrisma.venueContentPost.findMany.mockResolvedValue([]);
    mockPrisma.lessonOffering.findMany.mockResolvedValue([]);
    mockPrisma.venueScheduleBlock.findMany.mockResolvedValue([]);

    await getPublicVenueContent("clvenxxxxxxxxxxxxxxxxxxxxxxx", { skillLevelIds: ["clsklxxxxxxxxxxxxxxxxxxxxxxx"] });

    expect(mockPrisma.lessonOffering.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          skillLevels: { some: { id: { in: ["clsklxxxxxxxxxxxxxxxxxxxxxxx"] } } },
        }),
      })
    );
  });
});
