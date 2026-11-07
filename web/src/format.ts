import { localParts } from "../../shared/time";

/** Locale-independent helpers. Anything with words lives in ./i18n. */
export const minutes = (sec: number) => Math.round(sec / 60);

export function fmtPercent(ratio: number): string {
  const p = Math.round((ratio - 1) * 100);
  return p <= 0 ? "0%" : `+${p}%`;
}

export function slotToMinutes(slot: string): number {
  const [h, m] = slot.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export interface DayOption {
  date: string;
  dow: number;
  /** 0 = today, 1 = yesterday, ... */
  offset: number;
}

/** Last `count` days in the city's timezone, today first. */
export function recentDays(timeZone: string, count = 7, now = new Date()): DayOption[] {
  const out: DayOption[] = [];
  for (let i = 0; i < count; i++) {
    const p = localParts(new Date(now.getTime() - i * 86_400_000), timeZone);
    out.push({ date: p.date, dow: p.dow, offset: i });
  }
  return out;
}
