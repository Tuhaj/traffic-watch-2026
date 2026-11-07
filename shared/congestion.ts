import type { RouteReading } from "./types";

export interface Level {
  key: "free" | "moderate" | "heavy" | "jam";
  label: string;
  color: string;
}

export const LEVELS: Level[] = [
  { key: "free", label: "Płynnie", color: "#1fa463" },
  { key: "moderate", label: "Umiarkowanie", color: "#e0b000" },
  { key: "heavy", label: "Korki", color: "#ef7a1a" },
  { key: "jam", label: "Paraliż", color: "#d93025" },
];

/** ratio = duration / freeFlow */
export function levelFor(ratio: number): Level {
  if (ratio < 1.15) return LEVELS[0]!;
  if (ratio < 1.4) return LEVELS[1]!;
  if (ratio < 1.8) return LEVELS[2]!;
  return LEVELS[3]!;
}

export function summarize(readings: RouteReading[]): { index: number; meanDuration: number } {
  let dur = 0;
  let free = 0;
  let weighted = 0;
  for (const r of readings) {
    dur += r.duration;
    free += r.freeFlow;
    weighted += r.freeFlow * r.duration;
  }
  if (free === 0) return { index: 1, meanDuration: 0 };
  return {
    index: round(dur / free, 3),
    meanDuration: Math.round(weighted / free),
  };
}

export function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
