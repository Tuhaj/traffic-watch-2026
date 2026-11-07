import { localParts } from "../../shared/time";

export const minutes = (sec: number) => Math.round(sec / 60);

export function fmtMinutes(sec: number): string {
  return `${minutes(sec)} min`;
}

export function fmtDelay(sec: number): string {
  const m = minutes(sec);
  if (m <= 0) return "bez opóźnień";
  return `+${m} min`;
}

export function fmtPercent(ratio: number): string {
  const p = Math.round((ratio - 1) * 100);
  return p <= 0 ? "0%" : `+${p}%`;
}

export function slotToMinutes(slot: string): number {
  const [h, m] = slot.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const WEEKDAY = ["", "pon", "wt", "śr", "czw", "pt", "sob", "nd"];
const WEEKDAY_LONG = ["", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota", "niedziela"];

export function weekdayShort(dow: number) {
  return WEEKDAY[dow] ?? "";
}
export function weekdayLong(dow: number) {
  return WEEKDAY_LONG[dow] ?? "";
}

export interface DayOption {
  date: string;
  dow: number;
  label: string;
  sub: string;
}

/** Last `count` days in the city's timezone, today first. */
export function recentDays(timeZone: string, count = 7, now = new Date()): DayOption[] {
  const out: DayOption[] = [];
  for (let i = 0; i < count; i++) {
    const p = localParts(new Date(now.getTime() - i * 86_400_000), timeZone);
    const [, mm, dd] = p.date.split("-");
    out.push({
      date: p.date,
      dow: p.dow,
      label: i === 0 ? "Dziś" : i === 1 ? "Wczoraj" : weekdayShort(p.dow),
      sub: `${Number(dd)}.${mm}`,
    });
  }
  return out;
}

export function fmtUpdated(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pl-PL", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
