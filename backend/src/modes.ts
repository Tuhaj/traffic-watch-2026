import { CalculateRoutesCommand, type RouteLeg } from "@aws-sdk/client-geo-routes";
import { localParts, slotLabel } from "../../shared/time";
import type { CommuteLeg, CommuteOption, LngLat } from "../../shared/types";
import { simplify } from "./geometry";
import { calculateRoute, geo } from "./routing";

const hhmm = (d: Date, tz: string) => {
  const p = localParts(d, tz);
  return slotLabel(p.hour, p.minute);
};

/** Car with predicted traffic for the given departure. */
export async function carOption(from: LngLat, to: LngLat, at: Date, tz: string): Promise<CommuteOption> {
  const r = await calculateRoute(from, to, at);
  return {
    depart: hhmm(at, tz),
    arrive: hhmm(new Date(at.getTime() + r.duration * 1000), tz),
    duration: r.duration,
    distance: r.distance,
    legs: [{ kind: "drive", duration: r.duration, distance: r.distance, geometry: r.geometry }],
  };
}

const VEHICLE_LABEL: Record<string, string> = {
  Bus: "Autobus",
  BusRapid: "Autobus",
  Intercity: "Pociąg",
  LightRail: "Tramwaj",
  Monorail: "Kolej",
  RegionalTrain: "Pociąg",
  CityTrain: "SKM",
  Subway: "Metro",
  Train: "Pociąg",
  Ferry: "Prom",
  Aerial: "Kolejka",
  Inclined: "Kolejka",
};

export function vehicleLabel(mode: string | undefined): string {
  return (mode && VEHICLE_LABEL[mode]) ?? "Transport";
}

export function transitLeg(l: RouteLeg, tz: string): CommuteLeg | null {
  const geometry = simplify((l.Geometry?.LineString ?? []) as LngLat[], 0.00008);
  const t = l.TransitLegDetails;
  if (t) {
    const time = (s?: string) => (s ? hhmm(new Date(s), tz) : undefined);
    const depart = t.Departure?.Time ? Date.parse(t.Departure.Time) : NaN;
    const arrive = t.Arrival?.Time ? Date.parse(t.Arrival.Time) : NaN;
    return {
      kind: "transit",
      duration: t.Summary?.Overview?.Duration ?? (Number.isFinite(arrive - depart) ? (arrive - depart) / 1000 : 0),
      distance: t.Summary?.Overview?.Distance ?? 0,
      geometry,
      vehicle: vehicleLabel(t.Transport?.Mode),
      line: t.Transport?.ShortRouteName ?? t.Transport?.RouteName,
      headsign: t.Transport?.Headsign,
      color: t.Transport?.Color,
      textColor: t.Transport?.TextColor,
      from: t.Departure?.Place?.Name,
      to: t.Arrival?.Place?.Name,
      departs: time(t.Departure?.Time),
      arrives: time(t.Arrival?.Time),
    };
  }
  const p = l.PedestrianLegDetails;
  if (p) return { kind: "walk", duration: p.Summary?.Overview?.Duration ?? 0, distance: p.Summary?.Overview?.Distance ?? 0, geometry };
  const v = l.VehicleLegDetails;
  if (v) return { kind: "drive", duration: v.Summary?.Overview?.Duration ?? 0, distance: v.Summary?.Overview?.Distance ?? 0, geometry };
  const f = l.FerryLegDetails;
  if (f) return { kind: "transit", vehicle: "Prom", duration: f.Summary?.Overview?.Duration ?? 0, distance: f.Summary?.Overview?.Distance ?? 0, geometry };
  return null;
}

/** HERE splits walks at station access points; show consecutive walks as one. */
export function mergeWalks(legs: CommuteLeg[]): CommuteLeg[] {
  const out: CommuteLeg[] = [];
  for (const l of legs) {
    const prev = out[out.length - 1];
    if (prev && prev.kind === "walk" && l.kind === "walk") {
      out[out.length - 1] = {
        ...prev,
        duration: prev.duration + l.duration,
        distance: prev.distance + l.distance,
        geometry: [...prev.geometry, ...l.geometry],
      };
    } else out.push(l);
  }
  return out;
}

function legArrival(l: RouteLeg): string | undefined {
  return l.TransitLegDetails?.Arrival?.Time ?? l.PedestrianLegDetails?.Arrival?.Time ?? l.VehicleLegDetails?.Arrival?.Time ?? l.FerryLegDetails?.Arrival?.Time;
}

/** Public transport (HERE, ZTM timetables). Duration is door to door from the requested departure, waiting included. */
export async function transitOption(from: LngLat, to: LngLat, at: Date, tz: string): Promise<CommuteOption> {
  const res = await geo.send(
    new CalculateRoutesCommand({
      Origin: from,
      Destination: to,
      TravelMode: "Transit",
      DepartureTime: at.toISOString().replace(/\.\d{3}Z$/, "Z"),
      LegGeometryFormat: "Simple",
      MaxAlternatives: 0,
    }),
  );
  const route = res.Routes?.[0];
  const rawLegs = route?.Legs ?? [];
  if (!route || !rawLegs.length) throw new Error("No transit route");
  const legs = mergeWalks(rawLegs.map((l) => transitLeg(l, tz)).filter((l): l is CommuteLeg => l !== null));
  const lastArrival = legArrival(rawLegs[rawLegs.length - 1]!);
  const arriveAt = lastArrival ? new Date(lastArrival) : new Date(at.getTime() + (route.Summary?.Duration ?? 0) * 1000);
  return {
    depart: hhmm(at, tz),
    arrive: hhmm(arriveAt, tz),
    duration: Math.max(0, Math.round((arriveAt.getTime() - at.getTime()) / 1000)),
    distance: route.Summary?.Distance ?? legs.reduce((a, l) => a + l.distance, 0),
    legs,
  };
}

/** Decodes a Valhalla polyline (precision 6) into [lng, lat] pairs. */
export function decodePolyline6(str: string): LngLat[] {
  const out: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < str.length) {
    for (const which of [0, 1]) {
      let result = 0;
      let shift = 0;
      let b: number;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    out.push([lng / 1e6, lat / 1e6]);
  }
  return out;
}

const VALHALLA_URL = process.env.VALHALLA_URL ?? "https://valhalla1.openstreetmap.de/route";

/**
 * Bicycle via Valhalla on OpenStreetMap (FOSSGIS public server, fair use: low volume,
 * identifying User-Agent, results cached). Amazon Location has no bicycle mode.
 */
export async function bikeOption(from: LngLat, to: LngLat): Promise<CommuteOption> {
  const res = await fetch(VALHALLA_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "traffic-watch/2.0 (+https://traffic.isy.sh)" },
    body: JSON.stringify({
      locations: [
        { lon: from[0], lat: from[1] },
        { lon: to[0], lat: to[1] },
      ],
      costing: "bicycle",
      costing_options: { bicycle: { bicycle_type: "Hybrid", cycling_speed: 18 } },
      units: "kilometers",
      directions_type: "none",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Valhalla ${res.status}`);
  const body = (await res.json()) as { trip?: { summary?: { time: number; length: number }; legs?: { shape: string }[] } };
  const summary = body.trip?.summary;
  if (!summary) throw new Error("No bike route");
  const duration = Math.round(summary.time);
  const distance = Math.round(summary.length * 1000);
  const geometry = simplify(decodePolyline6(body.trip?.legs?.[0]?.shape ?? ""), 0.00006);
  return { depart: "", arrive: "", duration, distance, legs: [{ kind: "bike", duration, distance, geometry }] };
}
