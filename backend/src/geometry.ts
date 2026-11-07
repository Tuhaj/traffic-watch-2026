import type { LngLat } from "../../shared/types";

/** Douglas-Peucker simplification; tolerance in degrees (~1e-4 is about 7-11 m in Warsaw). */
export function simplify(points: LngLat[], tolerance = 0.00006): LngLat[] {
  if (points.length <= 2) return points.map(roundPoint);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxDist = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = perpendicular(points[i]!, points[a]!, points[b]!);
      if (d > maxDist) {
        maxDist = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxDist > tolerance) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]).map(roundPoint);
}

function perpendicular(p: LngLat, a: LngLat, b: LngLat): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function roundPoint(p: LngLat): LngLat {
  return [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5];
}
