import { prisma } from "@/lib/db/prisma";

/**
 * Record a signup-event management action in the audit log (FR-029).
 * Best-effort by design: an audit write must never fail the mutation it
 * documents, so callers can fire-and-forget.
 */
export async function logSignupEventActivity(input: {
  eventId: string;
  actorId: string;
  /** Short verb phrase, e.g. "published", "registration.removed", "manager.added". */
  action: string;
  summary: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const event = await prisma.signupEvent.findUnique({
      where: { id: input.eventId },
      select: { hostLeagueId: true, hostTeamId: true },
    });

    await prisma.auditLog.create({
      data: {
        action: `signup_event.${input.action}`,
        userId: input.actorId,
        leagueId: event?.hostLeagueId ?? null,
        teamId: event?.hostTeamId ?? null,
        resourceId: input.eventId,
        resourceType: "SignupEvent",
        details: { summary: input.summary, ...input.details },
        severity: "info",
      },
    });
  } catch (error) {
    console.error("Failed to write signup-event activity log:", error);
  }
}

/** Recent management activity for one event (host-admin/manager view). */
export async function getSignupEventActivity(eventId: string, limit = 25) {
  return prisma.auditLog.findMany({
    where: { resourceId: eventId, resourceType: "SignupEvent" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      action: true,
      details: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
    },
  });
}
