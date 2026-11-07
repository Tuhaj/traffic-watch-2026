import { CalculateRoutesCommand, GeoRoutesClient } from "@aws-sdk/client-geo-routes";
import type { LngLat } from "../../shared/types";
import { simplify } from "./geometry";

export const geo = new GeoRoutesClient({});

export interface RouteResult {
  duration: number;
  freeFlow: number;
  distance: number;
  geometry: LngLat[];
}

/**
 * Car route with traffic. Without `departure` it uses live traffic; with a future
 * `departure` HERE returns a forecast based on historical traffic patterns.
 */
export async function calculateRoute(origin: LngLat, destination: LngLat, departure?: Date): Promise<RouteResult> {
  const res = await geo.send(
    new CalculateRoutesCommand({
      Origin: origin,
      Destination: destination,
      TravelMode: "Car",
      Traffic: { Usage: "UseTrafficData" },
      ...(departure ? { DepartureTime: departure.toISOString().replace(/\.\d{3}Z$/, "Z") } : { DepartNow: true }),
      LegGeometryFormat: "Simple",
      MaxAlternatives: 0,
    }),
  );
  const leg = res.Routes?.[0]?.Legs?.[0];
  const overview = leg?.VehicleLegDetails?.Summary?.Overview;
  if (!leg || !overview?.Duration) throw new Error("No route returned");
  const duration = overview.Duration;
  return {
    duration,
    // BestCaseDuration is the free-flow estimate. Clamp so the ratio never goes below 1.
    freeFlow: Math.min(overview.BestCaseDuration ?? duration, duration),
    distance: overview.Distance ?? 0,
    geometry: simplify((leg.Geometry?.LineString ?? []) as LngLat[]),
  };
}

/** Runs `fn` over `items` with at most `limit` in flight; never rejects. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: "fulfilled", value: await fn(items[i]!) };
      } catch (reason) {
        out[i] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return out;
}
