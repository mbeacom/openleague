import { describe, it, expect } from "vitest";
import {
  addPlayerSchema,
  createEventSchema,
  updateEventSchema,
  updateTeamMemberUsahIdSchema,
} from "@/lib/utils/validation";

describe("addPlayerSchema — jerseyNumber", () => {
  const base = { name: "Player One", teamId: "clxxxxxxxxxxxxxxxxxxxxxxxxx" };

  it("accepts valid jersey numbers (1, 50, 99)", () => {
    for (const num of [1, 50, 99]) {
      const result = addPlayerSchema.safeParse({ ...base, jerseyNumber: num });
      expect(result.success).toBe(true);
    }
  });

  it("accepts null jersey number", () => {
    const result = addPlayerSchema.safeParse({ ...base, jerseyNumber: null });
    expect(result.success).toBe(true);
  });

  it("accepts omitted jersey number", () => {
    const result = addPlayerSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("rejects jersey number 0", () => {
    const result = addPlayerSchema.safeParse({ ...base, jerseyNumber: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects jersey number 100", () => {
    const result = addPlayerSchema.safeParse({ ...base, jerseyNumber: 100 });
    expect(result.success).toBe(false);
  });

  it("rejects negative jersey number", () => {
    const result = addPlayerSchema.safeParse({ ...base, jerseyNumber: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer jersey number (1.5)", () => {
    const result = addPlayerSchema.safeParse({ ...base, jerseyNumber: 1.5 });
    expect(result.success).toBe(false);
  });
});

describe("addPlayerSchema — usahMemberId", () => {
  const base = { name: "Player One", teamId: "clxxxxxxxxxxxxxxxxxxxxxxxxx" };

  it("accepts valid alphanumeric IDs", () => {
    for (const id of ["ABC123", "12345", "A", "abcXYZ0123456789ABCD"]) {
      const result = addPlayerSchema.safeParse({ ...base, usahMemberId: id });
      expect(result.success).toBe(true);
    }
  });

  it("trims whitespace from USAH ID", () => {
    const result = addPlayerSchema.safeParse({
      ...base,
      usahMemberId: "  ABC123  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.usahMemberId).toBe("ABC123");
    }
  });

  it("accepts null USAH ID", () => {
    const result = addPlayerSchema.safeParse({ ...base, usahMemberId: null });
    expect(result.success).toBe(true);
  });

  it("rejects USAH ID longer than 20 characters", () => {
    const result = addPlayerSchema.safeParse({
      ...base,
      usahMemberId: "A".repeat(21),
    });
    expect(result.success).toBe(false);
  });

  it("rejects USAH ID with special characters (#)", () => {
    const result = addPlayerSchema.safeParse({
      ...base,
      usahMemberId: "ABC#123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects USAH ID with spaces (after trim)", () => {
    const result = addPlayerSchema.safeParse({
      ...base,
      usahMemberId: "ABC 123",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateTeamMemberUsahIdSchema", () => {
  const base = {
    teamMemberId: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
    teamId: "clyyyyyyyyyyyyyyyyyyyyyyyy",
  };

  it("accepts valid input with USAH ID", () => {
    const result = updateTeamMemberUsahIdSchema.safeParse({
      ...base,
      usahMemberId: "ABC123",
    });

    expect(result.success).toBe(true);
  });

  it("accepts null USAH ID", () => {
    const result = updateTeamMemberUsahIdSchema.safeParse({
      ...base,
      usahMemberId: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid teamMemberId", () => {
    const result = updateTeamMemberUsahIdSchema.safeParse({
      ...base,
      teamMemberId: "not-a-cuid",
      usahMemberId: "ABC123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid teamId", () => {
    const result = updateTeamMemberUsahIdSchema.safeParse({
      ...base,
      teamId: "not-a-cuid",
      usahMemberId: "ABC123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects USAH ID longer than 20 characters", () => {
    const result = updateTeamMemberUsahIdSchema.safeParse({
      ...base,
      usahMemberId: "A".repeat(21),
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-alphanumeric USAH ID", () => {
    const result = updateTeamMemberUsahIdSchema.safeParse({
      ...base,
      usahMemberId: "ABC@123",
    });
    expect(result.success).toBe(false);
  });
});

describe("venue event end time", () => {
  const base = {
    type: "PRACTICE" as const,
    title: "Practice",
    startAt: new Date("2099-08-01T18:00:00.000Z"),
    location: "North Rink",
    teamId: "cteam00000000000000000001",
    venueId: "cvenue0000000000000000001",
    overrideConflicts: false,
  };

  it("requires endAt when creating a venue event", () => {
    const result = createEventSchema.safeParse(base);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          path: ["endAt"],
          message: "End date and time is required when a venue is selected",
        }),
      ]));
    }
  });

  it("requires endAt when updating a venue event", () => {
    const result = updateEventSchema.safeParse({
      ...base,
      id: "cevent0000000000000000001",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ["endAt"] }),
      ]));
    }
  });

  it("keeps endAt optional for events without a venue", () => {
    expect(createEventSchema.safeParse({ ...base, venueId: "" }).success).toBe(true);
  });
});
