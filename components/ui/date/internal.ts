/**
 * Shared internals for the DateTimeField/DateField/TimeField wrappers.
 *
 * The public API of the field components speaks the canonical wall-clock
 * strings the forms already serialize ('YYYY-MM-DDTHH:MM', 'YYYY-MM-DD',
 * 'HH:MM'). The `Date` objects produced here are presentation-only — they are
 * composed in the runtime's local zone purely so MUI X can render the picker,
 * and are never serialized. Timezone interpretation (venue zone vs browser
 * zone) stays in the forms via lib/utils/date.ts, exactly as today.
 */

import { useState } from "react";

const DATETIME_VALUE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/;
const DATE_VALUE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_VALUE_RE = /^(\d{2}):(\d{2})(?::\d{2})?$/;

/**
 * Fixed reference day used to carry time-only values in a `Date`. Any date
 * works — only the hour/minute sections are shown — but a stable one keeps
 * minTime comparisons and tests deterministic.
 */
const TIME_REFERENCE = { year: 2000, monthIndex: 0, day: 1 } as const;

const pad = (value: number) => String(value).padStart(2, "0");

/** 'YYYY-MM-DDTHH:MM' → display Date (local composition). Invalid/empty → null. */
export function parseDateTimeValue(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = DATETIME_VALUE_RE.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  // The Date constructor silently rolls invalid components over (Feb 31 →
  // Mar 3, 25:00 → the next day); reject anything that doesn't round-trip
  // rather than display — and later re-serialize — a shifted value.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }
  return date;
}

/** Display Date → 'YYYY-MM-DDTHH:MM'. Null/invalid → ''. */
export function formatDateTimeValue(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 'YYYY-MM-DD' → display Date (local midnight). Invalid/empty → null. */
export function parseDateValue(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = DATE_VALUE_RE.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  // Reject constructor rollover (Feb 31 → Mar 3). Only the date components
  // are checked: in zones where DST skips midnight the constructor
  // legitimately lands on 01:00 of the same (valid) day.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** Display Date → 'YYYY-MM-DD'. Null/invalid → ''. */
export function formatDateValue(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 'HH:MM' → display Date on a fixed reference day. Invalid/empty → null. */
export function parseTimeValue(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = TIME_VALUE_RE.exec(value.trim());
  if (!match) return null;
  const [, hour, minute] = match;
  if (Number(hour) > 23 || Number(minute) > 59) return null;
  const date = new Date(
    TIME_REFERENCE.year,
    TIME_REFERENCE.monthIndex,
    TIME_REFERENCE.day,
    Number(hour),
    Number(minute)
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Display Date → 'HH:MM'. Null/invalid → ''. */
export function formatTimeValue(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Props every field wrapper shares (see the concrete components for docs). */
export interface BaseFieldProps {
  label: string;
  /** When set, a hidden `<input name>` carries the canonical string for FormData forms. */
  name?: string;
  /** Controlled canonical string ('' = empty). */
  value?: string;
  /** Uncontrolled initial canonical string. */
  defaultValue?: string;
  /** Fires with the canonical string, or '' when cleared/invalid. */
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: React.ReactNode;
  /** @default true */
  fullWidth?: boolean;
}

/**
 * Semi-controlled state shared by the three fields.
 *
 * The picker always renders from internal `Date` state so partially typed
 * (invalid) input is not clobbered when a controlled parent echoes back the
 * '' we emitted for it; a genuinely new `value` prop re-derives the display.
 */
export function useDateFieldState(
  parse: (value: string | null | undefined) => Date | null,
  format: (date: Date | null) => string,
  { value, defaultValue, onChange }: Pick<BaseFieldProps, "value" | "defaultValue" | "onChange">
): {
  displayValue: Date | null;
  canonicalValue: string;
  handleChange: (next: Date | null) => void;
} {
  const [displayValue, setDisplayValue] = useState<Date | null>(() =>
    parse(value ?? defaultValue)
  );
  const [lastValueProp, setLastValueProp] = useState(value);

  // Controlled sync (render-phase derived state, per React's "storing
  // information from previous renders" guidance): only re-derive when the
  // prop no longer matches what the display serializes to.
  if (value !== undefined && value !== lastValueProp) {
    setLastValueProp(value);
    if (value !== format(displayValue)) {
      setDisplayValue(parse(value));
    }
  }

  const handleChange = (next: Date | null) => {
    setDisplayValue(next);
    // Invalid/partial input serializes to '' — never emit garbage.
    onChange?.(format(next));
  };

  return { displayValue, canonicalValue: format(displayValue), handleChange };
}
