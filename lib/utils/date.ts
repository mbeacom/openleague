import { TZDate } from "@date-fns/tz";

/**
 * Fallback IANA timezone used when a preferred zone is missing/invalid and the
 * runtime cannot resolve a local zone. Matches the Prisma schema defaults
 * (Event.timezone, SignupEvent.timezone, Venue.timezone).
 */
export const FALLBACK_TIME_ZONE = "America/New_York";

/**
 * Type guard: true when `timeZone` is a valid IANA zone the runtime understands.
 */
export function isValidTimeZone(
  timeZone: string | null | undefined
): timeZone is string {
  if (!timeZone) return false;
  try {
    // Throws a RangeError for unknown zones.
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the effective IANA timezone to parse/format against.
 * Preference order: an explicit valid `preferred` zone > the runtime's local
 * zone (e.g. the organizer's browser) > {@link FALLBACK_TIME_ZONE}.
 */
export function resolveTimeZone(preferred?: string | null): string {
  if (isValidTimeZone(preferred)) return preferred;
  try {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isValidTimeZone(local)) return local;
  } catch {
    // Intl not available — fall through.
  }
  return FALLBACK_TIME_ZONE;
}

const DATETIME_LOCAL_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Parse a zoneless `datetime-local` wall-clock string (`YYYY-MM-DDTHH:MM`) as a
 * point in time in the given IANA timezone, returning the corresponding UTC
 * `Date`. Returns `null` for empty/invalid input.
 *
 * This is the correct counterpart to a `type="datetime-local"` input: the input
 * yields a wall-clock with no offset, and we must interpret it against the
 * event's timezone rather than the browser's local zone.
 */
export function parseDateTimeLocalToUtc(
  value: string | null | undefined,
  timeZone: string
): Date | null {
  if (!value) return null;
  const match = DATETIME_LOCAL_RE.exec(value.trim());
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const zone = resolveTimeZone(timeZone);
  const zoned = new TZDate(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    second ? Number(second) : 0,
    zone
  );

  const instant = new Date(zoned.getTime());
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/**
 * Format an instant as a `datetime-local` value (`YYYY-MM-DDTHH:MM`) showing the
 * wall-clock time in the given IANA timezone. Use for `defaultValue`/`value` of
 * `type="datetime-local"` inputs so the stored instant round-trips to the same
 * wall-clock the organizer originally entered. Returns "" for invalid input.
 */
export function formatDateTimeLocalInput(
  date: Date | string | null | undefined,
  timeZone: string
): string {
  if (date == null) return "";
  const instant = new Date(date);
  if (Number.isNaN(instant.getTime())) return "";

  const zone = resolveTimeZone(timeZone);
  const zoned = new TZDate(instant.getTime(), zone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${zoned.getFullYear()}-${pad(zoned.getMonth() + 1)}-${pad(
    zoned.getDate()
  )}T${pad(zoned.getHours())}:${pad(zoned.getMinutes())}`;
}

/**
 * Format a date for display with full details (day, date, time, timezone).
 * Used in event details, emails, and other user-facing date displays.
 * Pass an IANA `timeZone` (e.g. the event's stored zone) to render the
 * wall-clock in that zone; otherwise renders in the runtime's local zone.
 */
export function formatDateTime(date: Date | string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...(isValidTimeZone(timeZone) ? { timeZone } : {}),
  }).format(new Date(date));
}

/**
 * Format a date in a specific IANA timezone (e.g. a venue's local timezone).
 * Falls back to the default locale rendering if the timezone is invalid.
 */
export function formatDateTimeInZone(date: Date | string, timeZone: string): string {
  const value = new Date(date);
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    }).format(value);
  } catch {
    return value.toLocaleString("en-US");
  }
}

/**
 * Format a date for datetime-local input fields using the runtime's local zone.
 *
 * @deprecated Prefer {@link formatDateTimeLocalInput} with an explicit IANA
 * timezone so times round-trip against the event's zone rather than the
 * browser's local zone.
 * Returns format: YYYY-MM-DDTHH:MM
 */
export function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
