import { describe, expect, it } from "vitest";

import {
  ASSOCIATION_OPERATIONS_NOTIFICATION_EVENT_TYPES,
  parseAssociationOperationsNotificationEvent,
} from "@/lib/services/association-operations-notification-registry";

const REQUEST = "crrrrrrrrrrrrrrrrrrrrrrrr";
const RESERVATION = "cssssssssssssssssssssssss";
const OTHER_ID = "coooooooooooooooooooooooo";

function parseRequest(payload: unknown) {
  return parseAssociationOperationsNotificationEvent({
    eventType: "association.venue_request.submitted",
    aggregateType: "VENUE_REQUEST",
    aggregateId: REQUEST,
    payload,
  });
}

describe("association operations notification registry", () => {
  it("accepts each registered event with only its allowlisted identifier", () => {
    for (const eventType of ASSOCIATION_OPERATIONS_NOTIFICATION_EVENT_TYPES) {
      const isRequest = eventType.startsWith("association.venue_request.");
      const result = parseAssociationOperationsNotificationEvent({
        eventType,
        aggregateType: isRequest ? "VENUE_REQUEST" : "VENUE_RESERVATION",
        aggregateId: isRequest ? REQUEST : RESERVATION,
        payload: isRequest
          ? { kind: "VENUE_REQUEST", data: { requestId: REQUEST } }
          : {
              kind: "VENUE_RESERVATION",
              data: { venueReservationId: RESERVATION },
            },
      });

      expect(result.ok, eventType).toBe(true);
    }
  });

  it("rejects unknown data keys", () => {
    expect(
      parseRequest({
        kind: "VENUE_REQUEST",
        data: { requestId: REQUEST, decision: "submitted" },
      }).ok,
    ).toBe(false);
  });

  it("rejects PII-looking data fields", () => {
    expect(
      parseRequest({
        kind: "VENUE_REQUEST",
        data: { requestId: REQUEST, email: "member@example.com" },
      }).ok,
    ).toBe(false);
  });

  it("rejects nested data values", () => {
    expect(
      parseRequest({
        kind: "VENUE_REQUEST",
        data: { requestId: { value: REQUEST } },
      }).ok,
    ).toBe(false);
  });

  it("rejects PII-shaped aggregate and payload identifiers", () => {
    expect(
      parseAssociationOperationsNotificationEvent({
        eventType: "association.venue_request.submitted",
        aggregateType: "VENUE_REQUEST",
        aggregateId: "member@example.com",
        payload: {
          kind: "VENUE_REQUEST",
          data: { requestId: "member@example.com" },
        },
      }).ok,
    ).toBe(false);
    expect(
      parseRequest({
        kind: "VENUE_REQUEST",
        data: { requestId: "member@example.com" },
      }).ok,
    ).toBe(false);
    expect(
      parseAssociationOperationsNotificationEvent({
        eventType: "association.venue_reservation.confirmed",
        aggregateType: "VENUE_RESERVATION",
        aggregateId: RESERVATION,
        payload: {
          kind: "VENUE_RESERVATION",
          data: { venueReservationId: "555-867-5309" },
        },
      }).ok,
    ).toBe(false);
  });

  it("rejects identifiers that do not match the aggregate ID", () => {
    expect(
      parseRequest({
        kind: "VENUE_REQUEST",
        data: { requestId: OTHER_ID },
      }).ok,
    ).toBe(false);
    expect(
      parseAssociationOperationsNotificationEvent({
        eventType: "association.venue_reservation.confirmed",
        aggregateType: "VENUE_RESERVATION",
        aggregateId: RESERVATION,
        payload: {
          kind: "VENUE_RESERVATION",
          data: { venueReservationId: OTHER_ID },
        },
      }).ok,
    ).toBe(false);
  });

  it("rejects the wrong payload kind", () => {
    expect(
      parseRequest({
        kind: "VENUE_RESERVATION",
        data: { requestId: REQUEST },
      }).ok,
    ).toBe(false);
  });

  it("rejects an aggregate that contradicts the event registry", () => {
    const result = parseAssociationOperationsNotificationEvent({
      eventType: "association.venue_request.submitted",
      aggregateType: "VENUE_RESERVATION",
      aggregateId: REQUEST,
      payload: {
        kind: "VENUE_REQUEST",
        data: { requestId: REQUEST },
      },
    });

    expect(result.ok).toBe(false);
  });

  it("rejects an unknown event", () => {
    const result = parseAssociationOperationsNotificationEvent({
      eventType: "association.venue_request.teleported",
      aggregateType: "VENUE_REQUEST",
      aggregateId: REQUEST,
      payload: {
        kind: "VENUE_REQUEST",
        data: { requestId: REQUEST },
      },
    });

    expect(result.ok).toBe(false);
  });
});
