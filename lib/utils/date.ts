/**
 * Format a date for display with full details (day, date, time, timezone)
 * Used in event details, emails, and other user-facing date displays
 */
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
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
 * Format a date for datetime-local input fields
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
