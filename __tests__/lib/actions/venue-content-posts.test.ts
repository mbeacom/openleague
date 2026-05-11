import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockRequireVenueContentManager, mockPrisma } = vi.hoisted(() => ({
  mockRequireVenueContentManager: vi.fn(),
  mockPrisma: {
    venue: { findFirst: vi.fn() },
    venueContentPost: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    lessonOffering: { findMany: vi.fn() },
    venueScheduleBlock: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireVenueContentManager: (...args: unknown[]) => mockRequireVenueContentManager(...args),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import { archiveVenueContentPost, getPublicVenueContent, saveVenueContentPost } from "@/lib/actions/venue-content";

const ORGANIZATION_ID = "clorgxxxxxxxxxxxxxxxxxxxxxxx";
const VENUE_ID = "clvenxxxxxxxxxxxxxxxxxxxxxxx";
const POST_ID = "clpstxxxxxxxxxxxxxxxxxxxxxxx";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireVenueContentManager.mockResolvedValue("clusrxxxxxxxxxxxxxxxxxxxxxxx");
  mockPrisma.venue.findFirst.mockResolvedValue({ id: VENUE_ID, organizationId: ORGANIZATION_ID, slug: "north-rink" });
});

describe("venue content posts", () => {
  it("creates and archives venue posts", async () => {
    mockPrisma.venueContentPost.create.mockResolvedValue({ id: POST_ID, status: "PUBLISHED" });
    mockPrisma.venueContentPost.update.mockResolvedValue({ id: POST_ID, status: "ARCHIVED" });

    const created = await saveVenueContentPost({
      organizationId: ORGANIZATION_ID,
      venueId: VENUE_ID,
      title: "Try Hockey Night",
      slug: "try-hockey-night",
      body: "Join us.",
      status: "PUBLISHED",
    });
    const archived = await archiveVenueContentPost({ organizationId: ORGANIZATION_ID, venueId: VENUE_ID, postId: POST_ID });

    expect(created.success).toBe(true);
    expect(archived.success).toBe(true);
  });

  it("queries public posts, lessons, and specialty events", async () => {
    mockPrisma.venueContentPost.findMany.mockResolvedValue([{ id: POST_ID, title: "Post" }]);
    mockPrisma.lessonOffering.findMany.mockResolvedValue([{ id: "lesson", title: "Lesson" }]);
    mockPrisma.venueScheduleBlock.findMany.mockResolvedValue([{ id: "event", title: "Event" }]);

    const result = await getPublicVenueContent(VENUE_ID);

    expect(result.posts).toHaveLength(1);
    expect(result.lessons).toHaveLength(1);
    expect(result.events).toHaveLength(1);
  });
});
