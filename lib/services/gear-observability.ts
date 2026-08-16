import { Prisma } from "@prisma/client";
import { z } from "zod";
import { GearConflictError } from "@/lib/services/gear-transaction";

type GearFailure = {
  action: "need" | "wishlist" | "pledge";
  error: unknown;
};

/**
 * Emits only structured operational classifications. Inputs, tokens, and donor
 * fields are deliberately excluded so this remains safe at public boundaries.
 */
export function reportGearActionFailure({ action, error }: GearFailure): void {
  if (error instanceof z.ZodError) return;
  if (error instanceof GearConflictError) {
    if (error.retryExhausted) {
      console.error({ event: "gear.retry_exhausted", action, errorType: error.name });
    }
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error({ event: "gear.action_failed", action, category: "prisma", code: error.code });
    return;
  }
  if (error instanceof Error && !error.message.startsWith("Gear validation:") && !error.message.startsWith("Unauthorized")) {
    console.error({ event: "gear.action_failed", action, category: "unexpected", errorType: error.name });
  }
}
