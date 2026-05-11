export interface TimeRange {
  startAt: Date;
  endAt: Date;
}

export interface RecurrenceWindow extends TimeRange {
  recurrenceRule?: string | null;
  recurrenceEndAt?: Date | null;
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
  const frequency = rule.FREQ;
  const interval = Math.max(Number(rule.INTERVAL ?? '1'), 1);
  const count = rule.COUNT ? Math.max(Number(rule.COUNT), 0) : undefined;
  const recurrenceEnd = minDate(window.recurrenceEndAt ?? rangeEnd, rangeEnd);
  const durationMs = window.endAt.getTime() - window.startAt.getTime();
  const occurrences: TimeRange[] = [];

  if (frequency === 'DAILY') {
    let cursor = new Date(window.startAt);
    let emitted = 0;
    while (cursor <= recurrenceEnd && (!count || emitted < count)) {
      pushOccurrence(occurrences, cursor, durationMs, rangeStart, rangeEnd);
      cursor = addDays(cursor, interval);
      emitted += 1;
    }
    return occurrences;
  }

  if (frequency === 'WEEKLY') {
    const weekdays = parseWeekdays(rule.BYDAY) ?? [window.startAt.getDay()];
    let cursor = startOfDay(window.startAt);
    let emitted = 0;

    while (cursor <= recurrenceEnd && (!count || emitted < count)) {
      if (weekdays.includes(cursor.getDay()) && isWeeklyIntervalMatch(window.startAt, cursor, interval)) {
        const occurrenceStart = copyTime(window.startAt, cursor);
        if (occurrenceStart >= window.startAt) {
          pushOccurrence(occurrences, occurrenceStart, durationMs, rangeStart, rangeEnd);
          emitted += 1;
        }
      }
      cursor = addDays(cursor, 1);
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
  durationMs: number,
  rangeStart: Date,
  rangeEnd: Date
) {
  const occurrence = {
    startAt,
    endAt: new Date(startAt.getTime() + durationMs),
  };

  if (rangesOverlap(occurrence, { startAt: rangeStart, endAt: rangeEnd })) {
    occurrences.push(occurrence);
  }
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function copyTime(source: Date, targetDay: Date): Date {
  const next = new Date(targetDay);
  next.setHours(source.getHours(), source.getMinutes(), source.getSeconds(), source.getMilliseconds());
  return next;
}

function minDate(left: Date, right: Date): Date {
  return left < right ? left : right;
}

function isWeeklyIntervalMatch(start: Date, candidate: Date, interval: number): boolean {
  const startWeek = startOfDay(start).getTime();
  const candidateWeek = startOfDay(candidate).getTime();
  const days = Math.round((candidateWeek - startWeek) / 86_400_000);
  const weeks = Math.floor(days / 7);
  return weeks % interval === 0;
}
