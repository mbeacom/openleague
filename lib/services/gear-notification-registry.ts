import { z } from "zod";
import type { GearNotificationPayload } from "@/types/gear";
import { gearNotificationPayloadSchema } from "@/lib/utils/validation";

/**
 * The single, exhaustive registry of durable gear notification events.
 *
 * Every gear event that may be persisted to the notification outbox is declared
 * exactly once here, and everything downstream is *derived* from this table:
 * the event-type union, the aggregate it belongs to, the Zod schema its payload
 * must satisfy, its delivery priority, its rendered email copy, and its digest
 * copy. Producers (Layer 4 mutations) and the delivery worker therefore cannot
 * drift apart: a producer that emits an unregistered event is rejected at
 * enqueue time, and a persisted row whose contract no longer holds is rejected
 * at delivery time instead of being retried forever.
 */

export type GearNotificationPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type GearAggregateType = "NEED" | "PLEDGE" | "WISHLIST" | "RESERVATION" | "ALLOCATION";
export type GearNotificationPayloadKind = GearNotificationPayload["kind"];

const scalar = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);
const identifier = z.string().min(1).max(500);
const quantity = z.number().int();

/**
 * Payload `data` contract for one event: the named operational keys it must
 * carry, plus tolerance for additional scalar keys so a producer can enrich a
 * payload without a lockstep worker deploy. The no-PII guarantee is enforced
 * separately by `gearNotificationPayloadSchema`, which every payload passes
 * through first.
 */
function data<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.object(shape).catchall(scalar);
}

const reservationData = data({ reservationId: identifier });
const allocationData = data({ reservationId: identifier, allocationId: identifier });
const custodyReminderData = data({ reservationId: identifier, dueDate: identifier });
const needData = data({ needId: identifier });
const pledgeData = data({ pledgeId: identifier });
const pledgeReceiptData = data({ pledgeId: identifier, quantity });
const wishlistData = data({ wishlistId: identifier });

type GearNotificationDefinition = {
  aggregateType: GearAggregateType;
  payloadKind: GearNotificationPayloadKind;
  priority: GearNotificationPriority;
  data: z.ZodType;
  /** Copy for an immediately rendered email. */
  email: { subject: string; body: string };
  /** Copy for a line inside a batched daily digest. */
  digest: { subject: string; content: string };
};

export const GEAR_NOTIFICATION_REGISTRY = {
  "gear.reservation.requested": {
    aggregateType: "RESERVATION",
    payloadKind: "GEAR_RESERVATION",
    priority: "NORMAL",
    data: reservationData,
    email: { subject: "New gear reservation request", body: "A team has requested association gear." },
    digest: { subject: "New gear reservation request", content: "A team requested association gear and is waiting on a decision." },
  },
  "gear.reservation.approved": {
    aggregateType: "RESERVATION",
    payloadKind: "GEAR_RESERVATION",
    priority: "NORMAL",
    data: reservationData,
    email: { subject: "Gear reservation approved", body: "Your team gear reservation has been approved and allocated." },
    digest: { subject: "Gear reservation approved", content: "A team gear reservation was approved and allocated." },
  },
  "gear.reservation.declined": {
    aggregateType: "RESERVATION",
    payloadKind: "GEAR_RESERVATION",
    priority: "NORMAL",
    data: reservationData,
    email: { subject: "Gear reservation update", body: "Your team gear reservation was not approved." },
    digest: { subject: "Gear reservation update", content: "A team gear reservation was not approved." },
  },
  "gear.reservation.canceled": {
    aggregateType: "RESERVATION",
    payloadKind: "GEAR_RESERVATION",
    priority: "NORMAL",
    data: reservationData,
    email: { subject: "Gear reservation canceled", body: "A team gear reservation has been canceled." },
    digest: { subject: "Gear reservation canceled", content: "A team gear reservation was canceled." },
  },
  "gear.reservation.rescheduled": {
    aggregateType: "RESERVATION",
    payloadKind: "GEAR_RESERVATION",
    priority: "NORMAL",
    data: reservationData,
    email: { subject: "Gear reservation dates changed", body: "The requested dates on a team gear reservation have changed." },
    digest: { subject: "Gear reservation dates changed", content: "The requested dates on a team gear reservation changed." },
  },
  "gear.reservation.picked_up": {
    aggregateType: "RESERVATION",
    payloadKind: "GEAR_ALLOCATION",
    priority: "NORMAL",
    data: allocationData,
    email: { subject: "Gear pickup recorded", body: "Association gear pickup has been recorded." },
    digest: { subject: "Gear pickup recorded", content: "An association gear pickup was recorded." },
  },
  "gear.reservation.returned": {
    aggregateType: "RESERVATION",
    payloadKind: "GEAR_ALLOCATION",
    priority: "NORMAL",
    data: allocationData,
    email: { subject: "Gear return recorded", body: "Association gear return has been recorded." },
    digest: { subject: "Gear return recorded", content: "An association gear return was recorded." },
  },
  "gear.reservation.due_soon": {
    aggregateType: "RESERVATION",
    payloadKind: "GEAR_RESERVATION",
    priority: "NORMAL",
    data: custodyReminderData,
    email: { subject: "Gear return due soon", body: "Association gear in your team's custody is due soon." },
    digest: { subject: "Gear return due soon", content: "Association gear in your team's custody is due back soon." },
  },
  "gear.reservation.overdue": {
    // Overdue custody is the one gear event that reaches a recipient who has
    // asked for urgent messages only, and it is never held for a digest.
    aggregateType: "RESERVATION",
    payloadKind: "GEAR_RESERVATION",
    priority: "HIGH",
    data: custodyReminderData,
    email: { subject: "Gear return is overdue", body: "Association gear in your team's custody is overdue. Please coordinate its return." },
    digest: { subject: "Gear return is overdue", content: "Association gear in your team's custody is overdue." },
  },
  "gear.need.submitted": {
    aggregateType: "NEED",
    payloadKind: "GEAR_NEED",
    priority: "NORMAL",
    data: needData,
    email: { subject: "New team gear need", body: "A team submitted a gear need for review." },
    digest: { subject: "New team gear need", content: "A team submitted a gear need for review." },
  },
  "gear.need.approved": {
    aggregateType: "NEED",
    payloadKind: "GEAR_NEED",
    priority: "NORMAL",
    data: needData,
    email: { subject: "Gear need approved", body: "A team gear need has been approved." },
    digest: { subject: "Gear need approved", content: "A team gear need was approved." },
  },
  "gear.need.fulfilled": {
    aggregateType: "NEED",
    payloadKind: "GEAR_NEED",
    priority: "NORMAL",
    data: needData,
    email: { subject: "Gear need fulfilled", body: "A team gear need has been marked fulfilled." },
    digest: { subject: "Gear need fulfilled", content: "A team gear need was marked fulfilled." },
  },
  "gear.need.canceled": {
    aggregateType: "NEED",
    payloadKind: "GEAR_NEED",
    priority: "NORMAL",
    data: needData,
    email: { subject: "Gear need canceled", body: "A team gear need has been canceled." },
    digest: { subject: "Gear need canceled", content: "A team gear need was canceled." },
  },
  "gear.pledge.created": {
    aggregateType: "PLEDGE",
    payloadKind: "GEAR_PLEDGE",
    priority: "NORMAL",
    data: pledgeData,
    email: { subject: "New in-kind gear pledge", body: "A public visitor pledged an in-kind gear item for review." },
    digest: { subject: "New in-kind gear pledge", content: "A public visitor pledged an in-kind gear item for review." },
  },
  "gear.pledge.acknowledged": {
    aggregateType: "PLEDGE",
    payloadKind: "GEAR_PLEDGE",
    priority: "NORMAL",
    data: pledgeData,
    email: { subject: "Thank you for your gear pledge", body: "Thank you for offering in-kind gear. A league administrator will follow up if needed." },
    digest: { subject: "Thank you for your gear pledge", content: "Thank you for offering in-kind gear." },
  },
  "gear.pledge.received": {
    aggregateType: "PLEDGE",
    payloadKind: "GEAR_PLEDGE",
    priority: "NORMAL",
    data: pledgeReceiptData,
    email: { subject: "Gear pledge received", body: "An in-kind gear pledge has been received into association inventory." },
    digest: { subject: "Gear pledge received", content: "An in-kind gear pledge was received into association inventory." },
  },
  "gear.pledge.receipt_corrected": {
    aggregateType: "PLEDGE",
    payloadKind: "GEAR_PLEDGE",
    priority: "NORMAL",
    data: pledgeReceiptData,
    email: { subject: "Gear pledge receipt corrected", body: "A recorded in-kind gear receipt has been corrected." },
    digest: { subject: "Gear pledge receipt corrected", content: "A recorded in-kind gear receipt was corrected." },
  },
  "gear.pledge.declined": {
    aggregateType: "PLEDGE",
    payloadKind: "GEAR_PLEDGE",
    priority: "NORMAL",
    data: pledgeData,
    email: { subject: "Gear pledge declined", body: "An in-kind gear pledge has been declined." },
    digest: { subject: "Gear pledge declined", content: "An in-kind gear pledge was declined." },
  },
  "gear.pledge.canceled": {
    aggregateType: "PLEDGE",
    payloadKind: "GEAR_PLEDGE",
    priority: "NORMAL",
    data: pledgeData,
    email: { subject: "Gear pledge canceled", body: "An in-kind gear pledge has been canceled." },
    digest: { subject: "Gear pledge canceled", content: "An in-kind gear pledge was canceled." },
  },
  "gear.pledge.expired": {
    aggregateType: "PLEDGE",
    payloadKind: "GEAR_PLEDGE",
    priority: "NORMAL",
    data: pledgeData,
    email: { subject: "Gear pledge expired", body: "An in-kind gear pledge has expired without being received." },
    digest: { subject: "Gear pledge expired", content: "An in-kind gear pledge expired without being received." },
  },
  "gear.pledge.pii_redacted": {
    aggregateType: "PLEDGE",
    payloadKind: "GEAR_PLEDGE",
    priority: "NORMAL",
    data: pledgeData,
    email: { subject: "Gear pledge contact details removed", body: "Donor contact details on a terminal in-kind gear pledge have been removed under the retention policy." },
    digest: { subject: "Gear pledge contact details removed", content: "Donor contact details on a terminal in-kind gear pledge were removed under the retention policy." },
  },
  "gear.wishlist.created": {
    aggregateType: "WISHLIST",
    payloadKind: "GEAR_WISHLIST",
    priority: "NORMAL",
    data: wishlistData,
    email: { subject: "Gear wishlist created", body: "A gear wishlist has been created." },
    digest: { subject: "Gear wishlist created", content: "A gear wishlist was created." },
  },
  "gear.wishlist.created_and_published": {
    aggregateType: "WISHLIST",
    payloadKind: "GEAR_WISHLIST",
    priority: "NORMAL",
    data: wishlistData,
    email: { subject: "Gear wishlist published", body: "A gear wishlist has been created and published." },
    digest: { subject: "Gear wishlist published", content: "A gear wishlist was created and published." },
  },
  "gear.wishlist.published": {
    aggregateType: "WISHLIST",
    payloadKind: "GEAR_WISHLIST",
    priority: "NORMAL",
    data: wishlistData,
    email: { subject: "Gear wishlist published", body: "A gear wishlist is now publicly visible." },
    digest: { subject: "Gear wishlist published", content: "A gear wishlist became publicly visible." },
  },
  "gear.wishlist.recycled": {
    aggregateType: "WISHLIST",
    payloadKind: "GEAR_WISHLIST",
    priority: "NORMAL",
    data: wishlistData,
    email: { subject: "Gear wishlist reopened", body: "An archived gear wishlist has been reopened." },
    digest: { subject: "Gear wishlist reopened", content: "An archived gear wishlist was reopened." },
  },
  "gear.wishlist.archived": {
    aggregateType: "WISHLIST",
    payloadKind: "GEAR_WISHLIST",
    priority: "NORMAL",
    data: wishlistData,
    email: { subject: "Gear wishlist archived", body: "A gear wishlist has been archived and is no longer public." },
    digest: { subject: "Gear wishlist archived", content: "A gear wishlist was archived and is no longer public." },
  },
  "gear.wishlist.share_token_rotated": {
    aggregateType: "WISHLIST",
    payloadKind: "GEAR_WISHLIST",
    priority: "NORMAL",
    data: wishlistData,
    email: { subject: "Gear wishlist share link changed", body: "The public share link for a gear wishlist has been rotated. Previously shared links no longer work." },
    digest: { subject: "Gear wishlist share link changed", content: "The public share link for a gear wishlist was rotated." },
  },
} as const satisfies Record<string, GearNotificationDefinition>;

export type GearNotificationEventType = keyof typeof GEAR_NOTIFICATION_REGISTRY;

/**
 * The delivery-side event, discriminated on `type` and derived wholesale from
 * the registry so a new registry entry is immediately part of the union.
 */
export type GearNotificationEvent = {
  [Type in GearNotificationEventType]: {
    type: Type;
    aggregateType: (typeof GEAR_NOTIFICATION_REGISTRY)[Type]["aggregateType"];
    aggregateId: string;
    priority: (typeof GEAR_NOTIFICATION_REGISTRY)[Type]["priority"];
    payload: GearNotificationPayload;
  };
}[GearNotificationEventType];

export const GEAR_NOTIFICATION_EVENT_TYPES = Object.keys(
  GEAR_NOTIFICATION_REGISTRY,
) as readonly GearNotificationEventType[];

export function isGearNotificationEventType(value: string): value is GearNotificationEventType {
  return Object.hasOwn(GEAR_NOTIFICATION_REGISTRY, value);
}

export function gearNotificationDefinition(type: GearNotificationEventType) {
  return GEAR_NOTIFICATION_REGISTRY[type];
}

export type GearNotificationContractViolationReason =
  | "UNKNOWN_EVENT_TYPE"
  | "AGGREGATE_MISMATCH"
  | "MALFORMED_PAYLOAD";

export type GearNotificationParseResult =
  | { ok: true; event: GearNotificationEvent }
  | { ok: false; reason: GearNotificationContractViolationReason; diagnostic: string };

/** Raised when a producer tries to enqueue an event the registry does not define. */
export class GearNotificationContractError extends Error {
  readonly reason: GearNotificationContractViolationReason;

  constructor(reason: GearNotificationContractViolationReason, diagnostic: string) {
    super(`Gear notification contract violation (${reason}): ${diagnostic}`);
    this.name = "GearNotificationContractError";
    this.reason = reason;
  }
}

/** Zod issue paths only — never issue values, which may echo payload contents. */
function issuePaths(error: z.ZodError): string {
  const paths = error.issues
    .map((issue) => (issue.path.length > 0 ? issue.path.join(".") : "(root)"))
    .slice(0, 5);
  return [...new Set(paths)].join(", ");
}

/**
 * Validates one persisted or about-to-be-persisted outbox row against the
 * registry. Returns a result rather than throwing so the worker can dead-letter
 * an undeliverable row without aborting the run; producers use
 * `assertGearNotificationEvent`, which throws inside their transaction.
 */
export function parseGearNotificationEvent(input: {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
}): GearNotificationParseResult {
  if (!isGearNotificationEventType(input.eventType)) {
    return {
      ok: false,
      reason: "UNKNOWN_EVENT_TYPE",
      diagnostic: `no registry entry for event type "${input.eventType.slice(0, 120)}"`,
    };
  }

  const definition = GEAR_NOTIFICATION_REGISTRY[input.eventType];
  if (definition.aggregateType !== input.aggregateType) {
    return {
      ok: false,
      reason: "AGGREGATE_MISMATCH",
      diagnostic: `event ${input.eventType} expects aggregate ${definition.aggregateType}, row carries ${String(input.aggregateType).slice(0, 40)}`,
    };
  }

  const envelope = gearNotificationPayloadSchema.safeParse(input.payload);
  if (!envelope.success) {
    return {
      ok: false,
      reason: "MALFORMED_PAYLOAD",
      diagnostic: `payload envelope invalid at ${issuePaths(envelope.error)}`,
    };
  }
  if (envelope.data.kind !== definition.payloadKind) {
    return {
      ok: false,
      reason: "MALFORMED_PAYLOAD",
      diagnostic: `event ${input.eventType} expects payload kind ${definition.payloadKind}, row carries ${envelope.data.kind}`,
    };
  }

  const parsedData = definition.data.safeParse(envelope.data.data);
  if (!parsedData.success) {
    return {
      ok: false,
      reason: "MALFORMED_PAYLOAD",
      diagnostic: `payload data invalid at ${issuePaths(parsedData.error)}`,
    };
  }

  return {
    ok: true,
    event: {
      type: input.eventType,
      aggregateType: definition.aggregateType,
      aggregateId: input.aggregateId,
      priority: definition.priority,
      payload: envelope.data,
    } as GearNotificationEvent,
  };
}

export function assertGearNotificationEvent(input: {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
}): GearNotificationEvent {
  const result = parseGearNotificationEvent(input);
  if (!result.ok) throw new GearNotificationContractError(result.reason, result.diagnostic);
  return result.event;
}
