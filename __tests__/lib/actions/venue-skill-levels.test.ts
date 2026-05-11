import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockRequireVenueContentManager, mockPrisma } = vi.hoisted(() => ({
  mockRequireVenueContentManager: vi.fn(),
  mockPrisma: {
    skillLevelReference: { upsert: vi.fn(), findMany: vi.fn() },
    lessonOffering: { update: vi.fn() },
    venueScheduleBlock: { update: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireVenueContentManager: (...args: unknown[]) => mockRequireVenueContentManager(...args),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import { assignSkillLevelsToLesson, assignSkillLevelsToScheduleBlock, createSkillLevelReference, getSkillLevelReferences } from "@/lib/actions/venue-content";

const ORGANIZATION_ID = "clorgxxxxxxxxxxxxxxxxxxxxxxx";
const VENUE_ID = "clvenxxxxxxxxxxxxxxxxxxxxxxx";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireVenueContentManager.mockResolvedValue("clusrxxxxxxxxxxxxxxxxxxxxxxx");
});

describe("venue skill levels", () => {
  it("creates and lists skill level references", async () => {
    mockPrisma.skillLevelReference.upsert.mockResolvedValue({ id: "level-1", label: "Squirt" });
    mockPrisma.skillLevelReference.findMany.mockResolvedValue([{ id: "level-1", label: "Squirt" }]);

    expect((await createSkillLevelReference({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      source: "USA_HOCKEY",
      discipline: "HOCKEY",
      label: "Squirt",
    })).success).toBe(true);
    await expect(getSkillLevelReferences()).resolves.toHaveLength(1);
  });

  it("assigns level references to lessons and schedule blocks", async () => {
    mockPrisma.lessonOffering.update.mockResolvedValue({ id: "lesson-1" });
    mockPrisma.venueScheduleBlock.update.mockResolvedValue({ id: "block-1" });

    expect((await assignSkillLevelsToLesson({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      lessonOfferingId: "cllesxxxxxxxxxxxxxxxxxxxxxxx",
      skillLevelIds: ["clsklxxxxxxxxxxxxxxxxxxxxxxx"],
    })).success).toBe(true);
    expect((await assignSkillLevelsToScheduleBlock({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      scheduleBlockId: "clblkxxxxxxxxxxxxxxxxxxxxxxx",
      skillLevelIds: ["clsklxxxxxxxxxxxxxxxxxxxxxxx"],
    })).success).toBe(true);
  });
});
