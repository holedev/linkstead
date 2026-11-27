/**
 * Days and wall-clock times in the Organization's time zone (an IANA name such as
 * `Asia/Ho_Chi_Minh` or `Europe/Berlin`). Built on `Intl` alone, so it runs in a Worker, in Node
 * and in the browser alike.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

/** One formatter per zone: making one is the slow part. */
const partsFormatter = (timeZone: string): Intl.DateTimeFormat => {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone,
      year: "numeric"
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
};

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const wallClockOf = (at: Date, timeZone: string): WallClock => {
  const parts = partsFormatter(timeZone).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  return {
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    month: part("month"),
    second: part("second"),
    year: part("year")
  };
};

const pad = (value: number, length = 2): string => String(value).padStart(length, "0");

/** Whether a string names a time zone this runtime knows. */
const isTimeZone = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) {
    return false;
  }
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
};

/** The day a moment falls on in a zone, as `yyyy-mm-dd`. */
const dayIn = (at: Date, timeZone: string): string => {
  const clock = wallClockOf(at, timeZone);
  return `${pad(clock.year, 4)}-${pad(clock.month)}-${pad(clock.day)}`;
};

/** The hour, 0 to 23, a clock in the zone shows at a moment. */
const hourIn = (at: Date, timeZone: string): number => wallClockOf(at, timeZone).hour;

/** A moment as the `datetime-local` value (`yyyy-mm-ddThh:mm`) a clock in the zone shows. */
const toWallClock = (at: Date, timeZone: string): string => {
  const clock = wallClockOf(at, timeZone);
  return `${dayIn(at, timeZone)}T${pad(clock.hour)}:${pad(clock.minute)}`;
};

/** How far ahead of UTC the zone's clocks are at a moment, in milliseconds. */
const offsetAt = (at: Date, timeZone: string): number => {
  const clock = wallClockOf(at, timeZone);
  const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * The moment a `datetime-local` value means when read on a clock in the zone, or null when it is
 * not one. A time that a change to summer time skips is read as if the clocks had not moved yet,
 * which lands it an hour later; a time that happens twice is the first of the two.
 */
const fromWallClock = (value: string, timeZone: string): Date | null => {
  const match = WALL_CLOCK.exec(value);
  if (!match) {
    return null;
  }
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  if (Number.isNaN(asUtc)) {
    return null;
  }
  // A zone changes its offset at most once a day, so the offsets a day either side are the only
  // ones the answer can have. The earliest that reads back as the value wins.
  const before = offsetAt(new Date(asUtc - DAY_MS), timeZone);
  const offsets = new Set([before, offsetAt(new Date(asUtc), timeZone), offsetAt(new Date(asUtc + DAY_MS), timeZone)]);
  const matching = [...offsets]
    .map((offset) => asUtc - offset)
    .filter((candidate) => toWallClock(new Date(candidate), timeZone) === value);
  return new Date(matching.length > 0 ? Math.min(...matching) : asUtc - before);
};

export { dayIn, fromWallClock, hourIn, isTimeZone, toWallClock };
