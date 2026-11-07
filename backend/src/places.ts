import { GeoPlacesClient, GetPlaceCommand, SuggestCommand, type SuggestResultItem } from "@aws-sdk/client-geo-places";
import { haversine } from "../../shared/geo";
import type { CityDef, PlaceDetails, PlaceSuggestion } from "../../shared/types";
import { MAX_RADIUS_M } from "./commute";
import { ApiError, consumeQuota } from "./quota";

const places = new GeoPlacesClient({});

/** Typing costs $0.20 / 1000 (Suggest, Label bucket); a selection costs $4 / 1000 (GetPlace, Storage). */
const SUGGEST_QUOTA = {
  name: "suggest",
  perIp: Number(process.env.SUGGEST_PER_IP_LIMIT ?? 300),
  global: Number(process.env.SUGGEST_DAILY_LIMIT ?? 10_000),
};
const PLACE_QUOTA = {
  name: "place",
  perIp: Number(process.env.PLACE_PER_IP_LIMIT ?? 40),
  global: Number(process.env.PLACE_DAILY_LIMIT ?? 500),
};

export const MIN_QUERY = 3;
export const MAX_QUERY = 120;

/** "ulica Puławska 30, 02-512 Warszawa, Polska" -> "ul. Puławska 30, 02-512 Warszawa" */
export function shortLabel(label: string): string {
  return label
    .replace(/,\s*Polska$/, "")
    .replace(/^ulica\s/i, "ul. ")
    .replace(/(,\s*)ulica\s/i, "$1ul. ")
    .replace(/^aleja\s/i, "al. ")
    .replace(/(,\s*)aleja\s/i, "$1al. ");
}

export function toSuggestion(item: SuggestResultItem): PlaceSuggestion | null {
  const place = item.Place;
  if (item.SuggestResultItemType !== "Place" || !place?.PlaceId) return null;
  const label = shortLabel(place.Address?.Label ?? item.Title ?? "");
  const isPoi = place.PlaceType === "PointOfInterest";
  if (!isPoi) return { id: place.PlaceId, title: label, subtitle: "" };
  // For a POI the address label starts with its name; show the name once, address below.
  const title = item.Title ?? label;
  return { id: place.PlaceId, title, subtitle: label.startsWith(`${title},`) ? label.slice(title.length + 1).trim() : label };
}

/**
 * Address / place suggestions while typing. SingleUse results: never cached or stored,
 * so the response is sent with no-store.
 */
export async function suggestPlaces(city: CityDef, query: string, ip: string): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY) return [];
  if (q.length > MAX_QUERY) throw new ApiError(400, "Za długie zapytanie.");
  await consumeQuota(SUGGEST_QUOTA, ip, city.timezone);
  const res = await places.send(
    new SuggestCommand({
      QueryText: q,
      Filter: { IncludeCountries: ["POL"], Circle: { Center: city.center, Radius: MAX_RADIUS_M } },
      Language: "pl",
      MaxResults: 6,
      IntendedUse: "SingleUse",
    }),
  );
  const seen = new Set<string>();
  const out: PlaceSuggestion[] = [];
  for (const item of res.ResultItems ?? []) {
    const s = toSuggestion(item);
    const key = s ? `${s.title}|${s.subtitle}` : "";
    if (s && !seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

/** Coordinates of a chosen suggestion. Requested with IntendedUse=Storage, because the browser keeps the point. */
export async function getPlace(city: CityDef, id: string, ip: string): Promise<PlaceDetails> {
  if (!/^[A-Za-z0-9_\-=]{20,1024}$/.test(id)) throw new ApiError(400, "Nieprawidłowy identyfikator miejsca.");
  await consumeQuota(PLACE_QUOTA, ip, city.timezone);
  const res = await places.send(new GetPlaceCommand({ PlaceId: id, Language: "pl", IntendedUse: "Storage" }));
  const pos = res.Position;
  if (!pos || pos.length !== 2) throw new ApiError(404, "Nie znaleziono miejsca.");
  const position: [number, number] = [pos[0]!, pos[1]!];
  if (haversine(city.center, position) > MAX_RADIUS_M) {
    throw new ApiError(400, `To miejsce leży dalej niż ${MAX_RADIUS_M / 1000} km od centrum.`);
  }
  const label = shortLabel(res.Address?.Label ?? res.Title ?? "");
  const title = res.PlaceType === "PointOfInterest" && res.Title && !label.startsWith(res.Title) ? `${res.Title}, ${label}` : label;
  return { title, position };
}
