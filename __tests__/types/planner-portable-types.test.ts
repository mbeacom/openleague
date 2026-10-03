/**
 * Portable planner types (ADR-0020). These are type-level checks:
 * `bun run type-check` enforces them, and Vitest only runs them as no-ops.
 */
import { describe, expectTypeOf, it } from "vitest";
import type { SegmentKind as PrismaSegmentKind } from "@prisma/client";
import type { PracticeSessionDetail } from "@/lib/actions/practice-session-queries";
import type { SegmentKind } from "@/types/segments";
import type { PracticeSessionView } from "@/types/practice-planner";

describe("portable practice-planner types", () => {
    it("SegmentKind is exactly Prisma's enum, so a new schema value fails type-check", () => {
        expectTypeOf<SegmentKind>().toEqualTypeOf<PrismaSegmentKind>();
    });

    it("the detail query's session is a PracticeSessionView", () => {
        expectTypeOf<PracticeSessionDetail["session"]>().toExtend<PracticeSessionView>();
    });
});
