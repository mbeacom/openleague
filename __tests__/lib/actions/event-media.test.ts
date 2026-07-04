import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { mockRequireUserId, mockGetCurrentUserId, mockIsEventManager, mockDel, mockPrisma } = vi.hoisted(() => ({
  mockRequireUserId: vi.fn(),
  mockGetCurrentUserId: vi.fn(),
  mockIsEventManager: vi.fn(),
  mockDel: vi.fn(),
  mockPrisma: {
    signupEvent: { findUnique: vi.fn() },
    eventMediaItem: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    eventRegistration: { count: vi.fn() },
    eventInvitation: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireUserId: (...args: unknown[]) => mockRequireUserId(...args),
  getCurrentUserId: (...args: unknown[]) => mockGetCurrentUserId(...args),
  isEventManager: (...args: unknown[]) => mockIsEventManager(...args),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@vercel/blob", () => ({ del: (...args: unknown[]) => mockDel(...args) }));

vi.mock("@/lib/env", () => ({
  isBlobConfigured: true,
  env: {},
  getBaseUrl: () => "http://localhost:3000",
  EVENT_WAITLIST_CLAIM_HOURS: 24,
  STATS_MIN_AGE_LEVEL: "SQUIRT_U10",
  isStripeConfigured: false,
  DEFAULT_PLATFORM_FEE_BPS: 0,
}));

vi.mock("@/lib/actions/venue-organizations", () => ({}));

import {
  finalizeEventMediaUpload,
  listEventMedia,
  removeEventMediaItem,
} from "@/lib/actions/event-media";

const EVENT_ID = "cldevent0000000000000001";
const BLOB_URL = `https://abc123.public.blob.vercel-storage.com/signup-events/${EVENT_ID}/photo-abc123.jpg`;

function galleryEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    status: "PUBLISHED",
    visibility: "PUBLIC",
    linkToken: null,
    galleryEnabled: true,
    galleryVisibility: "PARTICIPANTS",
    ...overrides,
  };
}

describe("finalizeEventMediaUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUserId.mockResolvedValue("parent-1");
    mockPrisma.signupEvent.findUnique.mockResolvedValue({
      id: EVENT_ID,
      status: "PUBLISHED",
      galleryEnabled: true,
    });
    mockIsEventManager.mockResolvedValue(false);
    mockPrisma.eventRegistration.count.mockResolvedValue(1); // confirmed registrant
    mockPrisma.eventMediaItem.findFirst.mockResolvedValue(null);
    mockPrisma.eventMediaItem.create.mockResolvedValue({ id: "media-1" });
  });

  it("records an upload from a confirmed registrant", async () => {
    const result = await finalizeEventMediaUpload({
      eventId: EVENT_ID,
      url: BLOB_URL,
      contentType: "image/jpeg",
      sizeBytes: 1024 * 1024,
    });

    expect(result).toEqual({ success: true, data: { mediaItemId: "media-1" } });
    expect(mockPrisma.eventMediaItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "PHOTO", uploaderId: "parent-1" }),
      })
    );
  });

  it("rejects uploads from non-participants", async () => {
    mockPrisma.eventRegistration.count.mockResolvedValue(0);

    const result = await finalizeEventMediaUpload({
      eventId: EVENT_ID,
      url: BLOB_URL,
      contentType: "image/jpeg",
      sizeBytes: 1024,
    });

    expect(result).toEqual({
      success: false,
      error: "Only event participants and organizers can share media.",
    });
  });

  it("rejects blobs stored outside this event's prefix", async () => {
    const result = await finalizeEventMediaUpload({
      eventId: EVENT_ID,
      url: "https://abc123.public.blob.vercel-storage.com/signup-events/other-event/photo.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1024,
    });

    expect(result).toEqual({ success: false, error: "That upload doesn't belong to this event." });
  });

  it("rejects external hosts even when the path contains the event prefix", async () => {
    const result = await finalizeEventMediaUpload({
      eventId: EVENT_ID,
      url: `https://attacker.example/x/signup-events/${EVENT_ID}/fake.png`,
      contentType: "image/jpeg",
      sizeBytes: 1024,
    });

    expect(result).toEqual({ success: false, error: "Invalid media URL." });
  });

  it("anchors the prefix check to the start of the pathname", async () => {
    const result = await finalizeEventMediaUpload({
      eventId: EVENT_ID,
      url: `https://abc123.public.blob.vercel-storage.com/elsewhere/signup-events/${EVENT_ID}/fake.png`,
      contentType: "image/jpeg",
      sizeBytes: 1024,
    });

    expect(result).toEqual({ success: false, error: "That upload doesn't belong to this event." });
  });

  it("enforces the per-kind size cap", async () => {
    const result = await finalizeEventMediaUpload({
      eventId: EVENT_ID,
      url: BLOB_URL,
      contentType: "image/jpeg",
      sizeBytes: 11 * 1024 * 1024, // over the 10 MB image cap
    });

    expect(result).toEqual({ success: false, error: "That file is too large." });
  });

  it("rejects when the gallery is disabled", async () => {
    mockPrisma.signupEvent.findUnique.mockResolvedValue({
      id: EVENT_ID,
      status: "PUBLISHED",
      galleryEnabled: false,
    });

    const result = await finalizeEventMediaUpload({
      eventId: EVENT_ID,
      url: BLOB_URL,
      contentType: "image/jpeg",
      sizeBytes: 1024,
    });

    expect(result).toEqual({ success: false, error: "The gallery is disabled for this event." });
  });
});

describe("listEventMedia (gallery visibility matrix)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.eventMediaItem.findMany.mockResolvedValue([]);
    mockIsEventManager.mockResolvedValue(false);
  });

  it("PARTICIPANTS default: blocks non-participants and anonymous viewers", async () => {
    mockPrisma.signupEvent.findUnique.mockResolvedValue(galleryEvent());

    mockGetCurrentUserId.mockResolvedValue(null);
    expect(await listEventMedia({ eventId: EVENT_ID })).toBeNull();

    mockGetCurrentUserId.mockResolvedValue("stranger");
    mockPrisma.eventRegistration.count.mockResolvedValue(0);
    expect(await listEventMedia({ eventId: EVENT_ID })).toBeNull();
  });

  it("PARTICIPANTS default: confirmed registrants may view and upload", async () => {
    mockPrisma.signupEvent.findUnique.mockResolvedValue(galleryEvent());
    mockGetCurrentUserId.mockResolvedValue("parent-1");
    mockPrisma.eventRegistration.count.mockResolvedValue(1);

    const result = await listEventMedia({ eventId: EVENT_ID });

    expect(result).not.toBeNull();
    expect(result?.canUpload).toBe(true);
    expect(result?.canModerate).toBe(false);
  });

  it("EVENT_AUDIENCE on a public event opens the gallery to any viewer", async () => {
    mockPrisma.signupEvent.findUnique.mockResolvedValue(
      galleryEvent({ galleryVisibility: "EVENT_AUDIENCE" })
    );
    mockGetCurrentUserId.mockResolvedValue(null);

    const result = await listEventMedia({ eventId: EVENT_ID });

    expect(result).not.toBeNull();
    expect(result?.canUpload).toBe(false);
  });

  it("managers always see the gallery, including flagged items", async () => {
    mockPrisma.signupEvent.findUnique.mockResolvedValue(galleryEvent());
    mockGetCurrentUserId.mockResolvedValue("admin-1");
    mockIsEventManager.mockResolvedValue(true);

    const result = await listEventMedia({ eventId: EVENT_ID });

    expect(result?.canModerate).toBe(true);
    const where = mockPrisma.eventMediaItem.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ["ACTIVE", "FLAGGED"] });
  });

  it("returns null when the gallery is disabled", async () => {
    mockPrisma.signupEvent.findUnique.mockResolvedValue(galleryEvent({ galleryEnabled: false }));
    mockGetCurrentUserId.mockResolvedValue("parent-1");

    expect(await listEventMedia({ eventId: EVENT_ID })).toBeNull();
  });
});

describe("removeEventMediaItem", () => {
  const MEDIA_ID = "cldmedia0000000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.eventMediaItem.findUnique.mockResolvedValue({
      id: MEDIA_ID,
      eventId: EVENT_ID,
      uploaderId: "parent-1",
      blobPathname: BLOB_URL,
      status: "ACTIVE",
    });
    mockPrisma.eventMediaItem.update.mockResolvedValue({});
    mockPrisma.signupEvent.findUnique.mockResolvedValue({ hostLeagueId: null, hostTeamId: null });
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it("lets uploaders delete their own item (blob removed best-effort)", async () => {
    mockRequireUserId.mockResolvedValue("parent-1");
    mockIsEventManager.mockResolvedValue(false);

    const result = await removeEventMediaItem({ mediaItemId: MEDIA_ID });

    expect(result.success).toBe(true);
    expect(mockDel).toHaveBeenCalledWith(BLOB_URL);
    // Own removal is not an organizer moderation action — no audit entry.
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("lets managers remove any item and logs the moderation", async () => {
    mockRequireUserId.mockResolvedValue("admin-1");
    mockIsEventManager.mockResolvedValue(true);

    const result = await removeEventMediaItem({ mediaItemId: MEDIA_ID });

    expect(result.success).toBe(true);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "signup_event.media.removed" }),
      })
    );
  });

  it("blocks strangers from removing other people's uploads", async () => {
    mockRequireUserId.mockResolvedValue("stranger");
    mockIsEventManager.mockResolvedValue(false);

    const result = await removeEventMediaItem({ mediaItemId: MEDIA_ID });

    expect(result).toEqual({ success: false, error: "You can only remove your own uploads." });
    expect(mockDel).not.toHaveBeenCalled();
  });
});
