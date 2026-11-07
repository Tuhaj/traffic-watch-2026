import type { LngLat } from "./types";

/** Parses "lng,lat" and rounds to 3 decimals (~70-110 m), which is also the cache granularity. */
export function parseLngLat(s: string | undefined): LngLat | null {
  if (!s) return null;
  const parts = s.split(",").map(Number);
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return null;
  return roundLngLat([parts[0]!, parts[1]!]);
}

export function roundLngLat(p: LngLat): LngLat {
  return [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000];
}

export function formatLngLat(p: LngLat): string {
  const r = roundLngLat(p);
  return `${r[0].toFixed(3)},${r[1].toFixed(3)}`;
}

/** Great-circle distance in metres. */
export function haversine(a: LngLat, b: LngLat): number {
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
