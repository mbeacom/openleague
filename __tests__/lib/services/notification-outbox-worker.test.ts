import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockNotificationService } = vi.hoisted(() => ({
  mockPrisma: {
    notificationOutbox: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  mockNotificationService: {
    shouldReceiveNotification: vi.fn(),
    sendOrBatchNotification: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/services/notification", () => ({
  notificationService: mockNotificationService,
}));

import { GEAR_NOTIFICATION_EVENT_TYPES } from "@/lib/services/gear-notification-registry";
import { claimDueGearOutbox } from "@/lib/services/gear-outbox-worker";
import {
  ASSOCIATION_OPERATIONS_NOTIFICATION_EVENT_TYPES,
} from "@/lib/services/association-operations-notification-registry";
import {
  claimDueAssociationOperationsOutbox,
  processAssociationOperationsOutbox,
} from "@/lib/services/association-operations-outbox-worker";

describe("notification outbox namespace ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([]);
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue(null);
    mockPrisma.notificationOutbox.updateMany.mockResolvedValue({ count: 0 });
  });

  it("keeps the gear worker limited to the gear namespace", async () => {
    await claimDueGearOutbox(10, new Date("2026-08-17T12:00:00.000Z"));

    expect(mockPrisma.notificationOutbox.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventType: { startsWith: "gear." },
        }),
      }),
    );
    expect(GEAR_NOTIFICATION_EVENT_TYPES.every((type) => type.startsWith("gear."))).toBe(true);
  });

  it("keeps the association worker limited to its registered non-gear events", async () => {
    await claimDueAssociationOperationsOutbox(10, new Date("2026-08-17T12:00:00.000Z"));

    expect(mockPrisma.notificationOutbox.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventType: { in: [...ASSOCIATION_OPERATIONS_NOTIFICATION_EVENT_TYPES] },
        }),
      }),
    );
    expect(
      ASSOCIATION_OPERATIONS_NOTIFICATION_EVENT_TYPES.every(
        (type) => !type.startsWith("gear."),
      ),
    ).toBe(true);
  });

  it("has disjoint ownership registries", () => {
    const gear = new Set<string>(GEAR_NOTIFICATION_EVENT_TYPES);
    expect(
      ASSOCIATION_OPERATIONS_NOTIFICATION_EVENT_TYPES.some((type) => gear.has(type)),
    ).toBe(false);
  });

  it("rejects malformed association events before preferences or delivery", async () => {
    const lockedAt = new Date("2026-08-17T12:00:00.000Z");
    mockPrisma.notificationOutbox.findMany.mockResolvedValue([
      { id: "malformed-association-event" },
    ]);
    mockPrisma.notificationOutbox.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    mockPrisma.notificationOutbox.findUnique.mockResolvedValue({
      id: "malformed-association-event",
      eventType: "association.venue_request.submitted",
      aggregateType: "VENUE_REQUEST",
      aggregateId: "venue-request-1",
      payload: {
        kind: "VENUE_REQUEST",
        data: {
          requestId: "venue-request-1",
          email: "member@example.com",
        },
      },
      status: "PROCESSING",
      lockedAt,
      attempts: 1,
      recipientUserId: "user-1",
      recipientRedactedAt: null,
      leagueId: "league-1",
    });

    const result = await processAssociationOperationsOutbox(1);

    expect(result).toMatchObject({
      claimed: 1,
      rejected: 1,
      deadLettered: 1,
      sent: 0,
      suppressed: 0,
    });
    expect(mockNotificationService.shouldReceiveNotification).not.toHaveBeenCalled();
    expect(mockNotificationService.sendOrBatchNotification).not.toHaveBeenCalled();
  });
});
