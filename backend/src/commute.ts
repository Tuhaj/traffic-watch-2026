import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { haversine } from "../../shared/geo";
import { nextDateForDow, slotRange, zonedToUtc } from "../../shared/time";
import type { CityDef, CommuteOption, CommuteResponse, LngLat, TravelMode } from "../../shared/types";
import { ApiError, consumeQuota, hash } from "./quota";
import { bikeOption, carOption, transitOption } from "./modes";
import { pool } from "./routing";

const TABLE = process.env.TABLE_NAME!;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/** Departure windows. 11 + 13 + 2 = 26 routes per uncached lookup (~$0.013). */
export const WINDOWS = {
  toWork: slotRange("05:30", "10:30", 30),
  toHome: slotRange("14:00", "20:00", 30),
  night: "03:00",
};
export const MAX_RADIUS_M = 60_000;
const MIN_DISTANCE_M = 500;
const CACHE_DAYS = 7;
export const MODES: TravelMode[] = ["car", "transit", "bike"];
/** Car and transit: 26 Amazon Location routes per uncached lookup. Bike: 2 Valhalla requests. */
const QUOTAS: Record<TravelMode, { name: string; global: number; perIp: number }> = {
  car: { name: "commute", global: Number(process.env.COMMUTE_DAILY_LIMIT ?? 150), perIp: Number(process.env.COMMUTE_PER_IP_LIMIT ?? 12) },
  transit: { name: "transit", global: Number(process.env.COMMUTE_DAILY_LIMIT ?? 150), perIp: Number(process.env.COMMUTE_PER_IP_LIMIT ?? 12) },
  bike: { name: "bike", global: 600, perIp: 30 },
};

export function validate(city: CityDef, home: LngLat, work: LngLat) {
  if (haversine(city.center, home) > MAX_RADIUS_M || haversine(city.center, work) > MAX_RADIUS_M) {
    throw new ApiError(400, "outside_radius", { km: MAX_RADIUS_M / 1000 });
  }
  if (haversine(home, work) < MIN_DISTANCE_M) {
    throw new ApiError(400, "too_close");
  }
}

export function pickBest(options: CommuteOption[]): CommuteOption | undefined {
  return options.reduce<CommuteOption | undefined>((best, o) => (!best || o.duration < best.duration ? o : best), undefined);
}

async function computeTimed(
  city: CityDef,
  home: LngLat,
  work: LngLat,
  dow: number,
  mode: "car" | "transit",
): Promise<CommuteResponse> {
  const date = nextDateForDow(dow, city.timezone);
  type Job = { dir: "toWork" | "toHome"; depart: string; night?: boolean };
  const jobs: Job[] = [
    ...WINDOWS.toWork.map((depart) => ({ dir: "toWork" as const, depart })),
    ...WINDOWS.toHome.map((depart) => ({ dir: "toHome" as const, depart })),
    { dir: "toWork", depart: WINDOWS.night, night: true },
    { dir: "toHome", depart: WINDOWS.night, night: true },
  ];
  const calc = mode === "car" ? carOption : transitOption;
  const results = await pool(jobs, 6, (j) => {
    const at = zonedToUtc(date, Number(j.depart.slice(0, 2)), Number(j.depart.slice(3, 5)), city.timezone);
    return j.dir === "toWork" ? calc(home, work, at, city.timezone) : calc(work, home, at, city.timezone);
  });

  const out = { toWork: [] as CommuteOption[], toHome: [] as CommuteOption[] };
  const night: Partial<CommuteResponse["night"]> = {};
  results.forEach((r, i) => {
    const job = jobs[i]!;
    if (r.status === "rejected") {
      console.error(JSON.stringify({ msg: "commute route failed", mode, depart: job.depart, dir: job.dir, error: String(r.reason) }));
      return;
    }
    if (job.night) night[job.dir] = r.value;
    else out[job.dir].push(r.value);
  });

  if (!out.toWork.length || !out.toHome.length) {
    throw new ApiError(502, mode === "transit" ? "transit_failed" : "route_failed");
  }
  return {
    mode,
    date,
    dow,
    timeIndependent: false,
    ...out,
    night: {
      // If the night calculation failed (e.g. no night bus), fall back to the fastest daytime option.
      toWork: night.toWork ?? pickBest(out.toWork)!,
      toHome: night.toHome ?? pickBest(out.toHome)!,
    },
  };
}

async function computeBike(city: CityDef, home: LngLat, work: LngLat, dow: number): Promise<CommuteResponse> {
  const [toWork, toHome] = await Promise.all([bikeOption(home, work), bikeOption(work, home)]).catch((e) => {
    console.error(JSON.stringify({ msg: "bike route failed", error: String(e) }));
    throw new ApiError(502, "bike_failed");
  });
  return {
    mode: "bike",
    date: nextDateForDow(dow, city.timezone),
    dow,
    timeIndependent: true,
    toWork: [toWork],
    toHome: [toHome],
    night: { toWork, toHome },
  };
}

export function computeCommute(city: CityDef, home: LngLat, work: LngLat, dow: number, mode: TravelMode = "car") {
  return mode === "bike" ? computeBike(city, home, work, dow) : computeTimed(city, home, work, dow, mode);
}

/** Cached, quota-protected commute lookup. Coordinates are only stored hashed. */
export async function getCommute(
  city: CityDef,
  home: LngLat,
  work: LngLat,
  dow: number,
  ip: string,
  mode: TravelMode = "car",
): Promise<CommuteResponse> {
  validate(city, home, work);
  // Bike durations do not depend on the weekday, so one cache entry serves all days.
  const dayKey = mode === "bike" ? "any" : String(dow);
  const key = { pk: `COMMUTE#${hash(`${city.id}|${mode}|${home.join(",")}|${work.join(",")}|${dayKey}`)}`, sk: "v4" };
  const cached = await ddb.send(new GetCommand({ TableName: TABLE, Key: key }));
  if (cached.Item && Number(cached.Item.ttl) > Date.now() / 1000) {
    const res = JSON.parse(String(cached.Item.data)) as CommuteResponse;
    return mode === "bike" ? { ...res, dow, date: nextDateForDow(dow, city.timezone) } : res;
  }

  await consumeQuota(QUOTAS[mode], ip, city.timezone);
  const res = await computeCommute(city, home, work, dow, mode);
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: { ...key, data: JSON.stringify(res), ttl: Math.floor(Date.now() / 1000) + CACHE_DAYS * 86400 },
    }),
  );
  return res;
}
