const SLOT_MINUTES = 15;

export interface LocalParts {
  date: string; // YYYY-MM-DD
  hour: number;
  minute: number;
  /** ISO weekday, 1 = Monday ... 7 = Sunday */
  dow: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function localParts(d: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    dow: WEEKDAYS[get("weekday")] ?? 0,
  };
}

/** Floors a timestamp to its 15-minute slot (slots are aligned in UTC, which is also aligned locally for whole-hour zones). */
export function floorToSlot(d: Date): Date {
  const ms = SLOT_MINUTES * 60_000;
  return new Date(Math.floor(d.getTime() / ms) * ms);
}

export function slotLabel(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** ISO weekday (1..7) of a YYYY-MM-DD calendar date. */
export function dowOfDate(date: string): number {
  const d = new Date(`${date}T12:00:00Z`);
  return ((d.getUTCDay() + 6) % 7) + 1;
}

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** UTC instant for a wall-clock time in `timeZone` (handles DST by iterating on the offset). */
export function zonedToUtc(date: string, hour: number, minute: number, timeZone: string): Date {
  const target = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), hour, minute);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(guess), timeZone);
    const seen = Date.UTC(+p.date.slice(0, 4), +p.date.slice(5, 7) - 1, +p.date.slice(8, 10), p.hour, p.minute);
    const diff = target - seen;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/** Next calendar date (strictly after `from`'s local date) that falls on ISO weekday `dow`. */
export function nextDateForDow(dow: number, timeZone: string, from = new Date()): string {
  const today = localParts(from, timeZone).date;
  const base = Date.parse(`${today}T12:00:00Z`);
  for (let i = 1; i <= 7; i++) {
    const d = new Date(base + i * 86_400_000).toISOString().slice(0, 10);
    if (dowOfDate(d) === dow) return d;
  }
  return today;
}

/** "HH:MM" labels from start to end inclusive, every `step` minutes. */
export function slotRange(start: string, end: string, step: number): string[] {
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const out: string[] = [];
  for (let m = toMin(start); m <= toMin(end); m += step) out.push(slotLabel(Math.floor(m / 60), m % 60));
  return out;
}
