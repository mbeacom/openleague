import { describe, expect, it } from "vitest";

import {
  assertGearNotificationEvent,
  GEAR_NOTIFICATION_EVENT_TYPES,
  GEAR_NOTIFICATION_REGISTRY,
  GearNotificationContractError,
  gearNotificationDefinition,
  isGearNotificationEventType,
  parseGearNotificationEvent,
  type GearNotificationEventType,
} from "@/lib/services/gear-notification-registry";

/**
 * Hard-coded rather than derived from the registry: a list generated from the
 * thing under test can never catch an entry going missing. This set was read
 * off the producers themselves —
 * `rg -o '"gear\.[a-z_.]+"' lib/ app/` plus the two dynamic builders in
 * `gear-needs.ts` (`gear.need.${target}` over SUBMITTED/APPROVED/FULFILLED/
 * CANCELED) and `gear-pledges.ts` (`gear.pledge.${target}` over DECLINED/
 * CANCELED/EXPIRED). A new producer that this list does not name will fail
 * here before it can dead-letter in production.
 */
const EMITTED_EVENT_TYPES = [
  "gear.reservation.requested",
  "gear.reservation.approved",
  "gear.reservation.declined",
  "gear.reservation.canceled",
  "gear.reservation.rescheduled",
  "gear.reservation.picked_up",
  "gear.reservation.returned",
  "gear.reservation.due_soon",
  "gear.reservation.overdue",
  "gear.need.submitted",
  "gear.need.approved",
  "gear.need.fulfilled",
  "gear.need.canceled",
  "gear.pledge.created",
  "gear.pledge.acknowledged",
  "gear.pledge.declined",
  "gear.pledge.received",
  "gear.pledge.canceled",
  "gear.pledge.expired",
  "gear.pledge.receipt_corrected",
  "gear.pledge.pii_redacted",
  "gear.wishlist.created",
  "gear.wishlist.created_and_published",
  "gear.wishlist.published",
  "gear.wishlist.archived",
  "gear.wishlist.recycled",
  "gear.wishlist.share_token_rotated",
] as const;

const RESERVATION = "crrrrrrrrrrrrrrrrrrrrrrrr";

describe("gear notification registry", () => {
  it("covers every event type a producer emits, and no more", () => {
    expect([...GEAR_NOTIFICATION_EVENT_TYPES].sort()).toEqual([...EMITTED_EVENT_TYPES].sort());
  });

  it("gives every event copy for both delivery channels", () => {
    for (const [type, definition] of Object.entries(GEAR_NOTIFICATION_REGISTRY)) {
      expect(definition.email.subject, type).toBeTruthy();
      expect(definition.email.body, type).toBeTruthy();
      expect(definition.digest.subject, type).toBeTruthy();
      expect(definition.digest.content, type).toBeTruthy();
    }
  });

  it("marks only overdue custody as high priority", () => {
    const elevated = Object.entries(GEAR_NOTIFICATION_REGISTRY)
      .filter(([, definition]) => definition.priority !== "NORMAL")
      .map(([type]) => type);
    expect(elevated).toEqual(["gear.reservation.overdue"]);
  });

  it("narrows a known event type", () => {
    expect(isGearNotificationEventType("gear.pledge.acknowledged")).toBe(true);
    expect(isGearNotificationEventType("gear.pledge.teleported")).toBe(false);
  });

  it("parses a well-formed persisted event", () => {
    const result = parseGearNotificationEvent({
      eventType: "gear.reservation.approved",
      aggregateType: "RESERVATION",
      aggregateId: RESERVATION,
      payload: { kind: "GEAR_RESERVATION", data: { reservationId: RESERVATION } },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.type).toBe("gear.reservation.approved");
    expect(result.event.priority).toBe("NORMAL");
    expect(result.event.payload).toEqual({
      kind: "GEAR_RESERVATION",
      data: { reservationId: RESERVATION },
    });
  });

  it("rejects an event type that is no longer in the registry", () => {
    const result = parseGearNotificationEvent({
      eventType: "gear.reservation.teleported",
      aggregateType: "RESERVATION",
      aggregateId: RESERVATION,
      payload: { kind: "GEAR_RESERVATION", data: { reservationId: RESERVATION } },
    });

    expect(result).toMatchObject({ ok: false, reason: "UNKNOWN_EVENT_TYPE" });
  });

  it("rejects a row whose aggregate type contradicts the registry", () => {
    const result = parseGearNotificationEvent({
      eventType: "gear.reservation.approved",
      aggregateType: "PLEDGE",
      aggregateId: RESERVATION,
      payload: { kind: "GEAR_RESERVATION", data: { reservationId: RESERVATION } },
    });

    expect(result).toMatchObject({ ok: false, reason: "AGGREGATE_MISMATCH" });
  });

  it("rejects a payload envelope of the wrong kind", () => {
    const result = parseGearNotificationEvent({
      eventType: "gear.reservation.approved",
      aggregateType: "RESERVATION",
      aggregateId: RESERVATION,
      payload: { kind: "GEAR_PLEDGE", data: { pledgeId: RESERVATION } },
    });

    expect(result).toMatchObject({ ok: false, reason: "MALFORMED_PAYLOAD" });
    if (result.ok) return;
    expect(result.diagnostic).toContain("expects payload kind GEAR_RESERVATION");
  });

  it("rejects a payload missing a field the event requires", () => {
    const result = parseGearNotificationEvent({
      eventType: "gear.reservation.due_soon",
      aggregateType: "RESERVATION",
      aggregateId: RESERVATION,
      payload: { kind: "GEAR_RESERVATION", data: { reservationId: RESERVATION } },
    });

    expect(result).toMatchObject({ ok: false, reason: "MALFORMED_PAYLOAD" });
  });

  it("names offending fields in diagnostics without echoing their values", () => {
    const result = parseGearNotificationEvent({
      eventType: "gear.reservation.due_soon",
      aggregateType: "RESERVATION",
      aggregateId: RESERVATION,
      payload: {
        kind: "GEAR_RESERVATION",
        data: { reservationId: RESERVATION, dueDate: { secret: "member@example.com" } },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic).toContain("dueDate");
    expect(result.diagnostic).not.toContain("member@example.com");
  });

  it("refuses payloads carrying recipient contact details", () => {
    const result = parseGearNotificationEvent({
      eventType: "gear.reservation.approved",
      aggregateType: "RESERVATION",
      aggregateId: RESERVATION,
      payload: {
        kind: "GEAR_RESERVATION",
        data: { reservationId: RESERVATION, email: "member@example.com" },
      },
    });

    expect(result.ok).toBe(false);
  });

  it("throws a typed contract error from the assert form", () => {
    expect(() => assertGearNotificationEvent({
      eventType: "gear.reservation.teleported",
      aggregateType: "RESERVATION",
      aggregateId: RESERVATION,
      payload: { kind: "GEAR_RESERVATION", data: { reservationId: RESERVATION } },
    })).toThrow(GearNotificationContractError);
  });

  it("exposes the definition backing a known type", () => {
    const definition = gearNotificationDefinition("gear.reservation.overdue" as GearNotificationEventType);
    expect(definition.aggregateType).toBe("RESERVATION");
    expect(definition.priority).toBe("HIGH");
  });
});
