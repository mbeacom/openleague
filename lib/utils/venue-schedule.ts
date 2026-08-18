import { TZDate } from "@date-fns/tz";
import { isValidTimeZone } from "@/lib/utils/date";

export interface TimeRange {
  startAt: Date;
  endAt: Date;
}

export interface RecurrenceWindow extends TimeRange {
  recurrenceRule?: string | null;
  recurrenceEndAt?: Date | null;
  /** Venue IANA timezone whose wall clock defines the recurrence. */
  timezone: string;
}

export interface ScheduleConflict<T extends TimeRange = TimeRange> {
  existing: T;
  candidate: TimeRange;
  reason: 'OVERLAP' | 'CLOSURE';
}

export interface ScheduleBlockRange extends TimeRange {
  id?: string | null;
  surfaceId?: string | null;
  status?: 'DRAFT' | 'PUBLISHED' | 'CANCELED' | 'ARCHIVED' | string | null;
  activityType?: string | null;
}

export interface ConflictDetectionOptions {
  ignoreIds?: string[];
  includeDrafts?: boolean;
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

export function assertValidRange(range: TimeRange): void {
  if (range.endAt <= range.startAt) {
    throw new Error('Schedule end time must be after start time');
  }
}

export function findScheduleConflicts<T extends TimeRange>(
  candidate: TimeRange,
  existingRanges: T[],
  options: ConflictDetectionOptions = {}
): ScheduleConflict<T>[] {
  assertValidRange(candidate);

  return existingRanges
    .filter((existing) => shouldConsiderRange(existing, options))
    .filter((existing) => rangesOverlap(candidate, existing))
    .map((existing) => ({
      existing,
      candidate,
      reason: isClosureRange(existing) || isClosureRange(candidate) ? 'CLOSURE' : 'OVERLAP',
    }));
}

export function expandRecurrenceWindow(
  window: RecurrenceWindow,
  rangeStart: Date,
  rangeEnd: Date
): TimeRange[] {
  assertValidRange(window);
  assertValidRange({ startAt: rangeStart, endAt: rangeEnd });

  if (!window.recurrenceRule) {
    return rangesOverlap(window, { startAt: rangeStart, endAt: rangeEnd }) ? [window] : [];
  }

  const rule = parseRecurrenceRule(window.recurrenceRule);
  if (!isValidTimeZone(window.timezone)) {
    throw new Error(`Invalid recurrence timezone: ${window.timezone}`);
  }
  const frequency = rule.FREQ;
  const interval = Math.max(Number(rule.INTERVAL ?? '1'), 1);
  const count = rule.COUNT ? Math.max(Number(rule.COUNT), 0) : undefined;
  const recurrenceEnd = minDate(window.recurrenceEndAt ?? rangeEnd, rangeEnd);
  const localStart = localDateTime(window.startAt, window.timezone);
  const localEnd = localDateTime(window.endAt, window.timezone);
  const endDayOffset = Math.round(
    (localDayNumber(localEnd) - localDayNumber(localStart)) / 86_400_000,
  );
  const occurrences: TimeRange[] = [];

  if (frequency === 'DAILY') {
    let cursor = localDayNumber(localStart);
    let emitted = 0;
    while (!count || emitted < count) {
      const occurrenceStart = dateAtLocalTime(
        cursor,
        localStart,
        window.timezone,
      );
      if (occurrenceStart > recurrenceEnd) break;
      pushOccurrence(
        occurrences,
        occurrenceStart,
        dateAtLocalTime(
          cursor + endDayOffset * 86_400_000,
          localEnd,
          window.timezone,
        ),
        rangeStart,
        rangeEnd,
      );
      cursor += interval * 86_400_000;
      emitted += 1;
    }
    return occurrences;
  }

  if (frequency === 'WEEKLY') {
    const weekdays = parseWeekdays(rule.BYDAY) ?? [
      new Date(localDayNumber(localStart)).getUTCDay(),
    ];
    const startDay = localDayNumber(localStart);
    let cursor = startDay;
    let emitted = 0;

    while (!count || emitted < count) {
      const occurrenceStart = dateAtLocalTime(
        cursor,
        localStart,
        window.timezone,
      );
      if (occurrenceStart > recurrenceEnd) break;
      if (
        weekdays.includes(new Date(cursor).getUTCDay())
        && isWeeklyIntervalMatch(startDay, cursor, interval)
      ) {
        if (occurrenceStart >= window.startAt) {
          pushOccurrence(
            occurrences,
            occurrenceStart,
            dateAtLocalTime(
              cursor + endDayOffset * 86_400_000,
              localEnd,
              window.timezone,
            ),
            rangeStart,
            rangeEnd,
          );
          emitted += 1;
        }
      }
      cursor += 86_400_000;
    }

    return occurrences;
  }

  throw new Error(`Unsupported recurrence frequency: ${frequency ?? 'UNKNOWN'}`);
}

function shouldConsiderRange(range: TimeRange, options: ConflictDetectionOptions): boolean {
  const block = range as ScheduleBlockRange;
  if (block.id && options.ignoreIds?.includes(block.id)) {
    return false;
  }
  if (block.status === 'CANCELED' || block.status === 'ARCHIVED') {
    return false;
  }
  if (block.status === 'DRAFT' && !options.includeDrafts) {
    return false;
  }
  return true;
}

function isClosureRange(range: TimeRange): boolean {
  return (range as ScheduleBlockRange).activityType === 'CLOSURE';
}

function parseRecurrenceRule(rule: string): Record<string, string> {
  return rule.split(';').reduce<Record<string, string>>((parsed, part) => {
    const [key, value] = part.split('=');
    if (key && value) {
      parsed[key.trim().toUpperCase()] = value.trim().toUpperCase();
    }
    return parsed;
  }, {});
}

function parseWeekdays(byDay: string | undefined): number[] | undefined {
  if (!byDay) {
    return undefined;
  }

  const weekdayMap: Record<string, number> = {
    SU: 0,
    MO: 1,
    TU: 2,
    WE: 3,
    TH: 4,
    FR: 5,
    SA: 6,
  };

  return byDay
    .split(',')
    .map((day) => weekdayMap[day])
    .filter((day): day is number => day !== undefined);
}

function pushOccurrence(
  occurrences: TimeRange[],
  startAt: Date,
  endAt: Date,
  rangeStart: Date,
  rangeEnd: Date
) {
  const occurrence = { startAt, endAt };

  if (rangesOverlap(occurrence, { startAt: rangeStart, endAt: rangeEnd })) {
    occurrences.push(occurrence);
  }
}

function minDate(left: Date, right: Date): Date {
  return left < right ? left : right;
}

function isWeeklyIntervalMatch(startDay: number, candidateDay: number, interval: number): boolean {
  const days = Math.round((candidateDay - startDay) / 86_400_000);
  const weeks = Math.floor(days / 7);
  return weeks % interval === 0;
}

type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
};

function localDateTime(date: Date, timezone: string): LocalDateTime {
  const zoned = new TZDate(date.getTime(), timezone);
  return {
    year: zoned.getFullYear(),
    month: zoned.getMonth(),
    day: zoned.getDate(),
    hours: zoned.getHours(),
    minutes: zoned.getMinutes(),
    seconds: zoned.getSeconds(),
    milliseconds: zoned.getMilliseconds(),
  };
}

function localDayNumber(value: Pick<LocalDateTime, "year" | "month" | "day">): number {
  return Date.UTC(value.year, value.month, value.day);
}

function dateAtLocalTime(
  localDay: number,
  time: Pick<LocalDateTime, "hours" | "minutes" | "seconds" | "milliseconds">,
  timezone: string,
): Date {
  const day = new Date(localDay);
  const zoned = new TZDate(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    time.hours,
    time.minutes,
    time.seconds,
    time.milliseconds,
    timezone,
  );
  return new Date(zoned.getTime());
}
