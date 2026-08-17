import { sanitizeErrorForLogging } from "@/lib/utils/error-handling";

export function logGearInventoryFailure(
  action: string,
  leagueId: string | undefined,
  error: unknown,
): string {
  const incidentId = crypto.randomUUID();
  console.error("Gear inventory action failed", {
    action,
    leagueId: leagueId ?? "unknown",
    incidentId,
    error: sanitizeErrorForLogging(error),
  });
  return incidentId;
}
