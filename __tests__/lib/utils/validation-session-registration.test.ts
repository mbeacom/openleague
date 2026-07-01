import { describe, expect, it } from "vitest";
import { sessionRegistrationSchema } from "@/lib/utils/validation";

const BLOCK_ID = "clblkxxxxxxxxxxxxxxxxxxxxxxx";
const LESSON_ID = "cllesxxxxxxxxxxxxxxxxxxxxxxx";
const VENUE_ID = "clvenxxxxxxxxxxxxxxxxxxxxxxx";

const base = {
  venueId: VENUE_ID,
  participantName: "Jordan Skater",
  participantEmail: "jordan@example.com",
  quantity: 1,
};

describe("sessionRegistrationSchema", () => {
  it("accepts a schedule block registration", () => {
    const result = sessionRegistrationSchema.safeParse({ ...base, scheduleBlockId: BLOCK_ID });
    expect(result.success).toBe(true);
  });

  it("accepts a lesson registration", () => {
    const result = sessionRegistrationSchema.safeParse({ ...base, lessonOfferingId: LESSON_ID });
    expect(result.success).toBe(true);
  });

  it("rejects when neither block nor lesson is provided", () => {
    const result = sessionRegistrationSchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it("rejects when both block and lesson are provided", () => {
    const result = sessionRegistrationSchema.safeParse({
      ...base,
      scheduleBlockId: BLOCK_ID,
      lessonOfferingId: LESSON_ID,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = sessionRegistrationSchema.safeParse({
      ...base,
      scheduleBlockId: BLOCK_ID,
      participantEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects quantity below 1 and above 20", () => {
    expect(
      sessionRegistrationSchema.safeParse({ ...base, scheduleBlockId: BLOCK_ID, quantity: 0 }).success
    ).toBe(false);
    expect(
      sessionRegistrationSchema.safeParse({ ...base, scheduleBlockId: BLOCK_ID, quantity: 21 }).success
    ).toBe(false);
  });

  it("normalizes email to lowercase", () => {
    const result = sessionRegistrationSchema.parse({
      ...base,
      scheduleBlockId: BLOCK_ID,
      participantEmail: "JORDAN@EXAMPLE.COM",
    });
    expect(result.participantEmail).toBe("jordan@example.com");
  });
});
