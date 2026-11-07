import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createHash } from "node:crypto";
import { haversine } from "../../shared/geo";
import { localParts, nextDateForDow, slotRange, zonedToUtc } from "../../shared/time";
import type { CityDef, CommuteOption, CommuteResponse, LngLat } from "../../shared/types";
import { calculateRoute, pool, type RouteResult } from "./routing";

const TABLE = process.env.TABLE_NAME!;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/** Departure windows. 11 + 13 + 2 = 26 routes per uncached lookup (~$0.013). */
export const WINDOWS = {
  toWork: slotRange("05:30", "10:30", 30),
  toHome: slotRange("14:00", "20:00", 30),
  night: "03:00",
};
const MAX_RADIUS_M = 60_000;
const MIN_DISTANCE_M = 500;
const CACHE_DAYS = 7;
const DAILY_LIMIT = Number(process.env.COMMUTE_DAILY_LIMIT ?? 150);
const PER_IP_LIMIT = Number(process.env.COMMUTE_PER_IP_LIMIT ?? 12);
const SALT = process.env.HASH_SALT ?? "traffic-watch";

export class CommuteError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const hash = (s: string) => createHash("sha256").update(`${SALT}:${s}`).digest("hex").slice(0, 32);

export function validate(city: CityDef, home: LngLat, work: LngLat) {
  if (haversine(city.center, home) > MAX_RADIUS_M || haversine(city.center, work) > MAX_RADIUS_M) {
    throw new CommuteError(400, `Oba punkty muszą leżeć w promieniu ${MAX_RADIUS_M / 1000} km od centrum.`);
  }
  if (haversine(home, work) < MIN_DISTANCE_M) {
    throw new CommuteError(400, "Dom i praca są zbyt blisko siebie.");
  }
}

/** Counts one uncached lookup against the per-IP and global daily quotas. */
async function consumeQuota(city: CityDef, ip: string) {
  const date = localParts(new Date(), city.timezone).date;
  const ttl = Math.floor(Date.now() / 1000) + 2 * 86400;
  const bump = (sk: string, max: number) =>
    ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk: `QUOTA#${date}`, sk },
        UpdateExpression: "ADD n :one SET #ttl = :ttl",
        ConditionExpression: "attribute_not_exists(n) OR n < :max",
        ExpressionAttributeNames: { "#ttl": "ttl" },
        ExpressionAttributeValues: { ":one": 1, ":max": max, ":ttl": ttl },
      }),
    );
  try {
    await bump(`IP#${hash(ip)}`, PER_IP_LIMIT);
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) throw new CommuteError(429, "Dzienny limit wyszukiwań dla Ciebie został wyczerpany. Wróć jutro.");
    throw e;
  }
  try {
    await bump("ALL", DAILY_LIMIT);
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) throw new CommuteError(429, "Dzienny limit wyszukiwań został wyczerpany. Wróć jutro.");
    throw e;
  }
}

export function pickBest(options: CommuteOption[]): CommuteOption | undefined {
  return options.reduce<CommuteOption | undefined>((best, o) => (!best || o.duration < best.duration ? o : best), undefined);
}

export async function computeCommute(city: CityDef, home: LngLat, work: LngLat, dow: number): Promise<CommuteResponse> {
  const date = nextDateForDow(dow, city.timezone);
  type Job = { dir: "toWork" | "toHome"; depart: string; night?: boolean };
  const jobs: Job[] = [
    ...WINDOWS.toWork.map((depart) => ({ dir: "toWork" as const, depart })),
    ...WINDOWS.toHome.map((depart) => ({ dir: "toHome" as const, depart })),
    { dir: "toWork", depart: WINDOWS.night, night: true },
    { dir: "toHome", depart: WINDOWS.night, night: true },
  ];
  const results = await pool(jobs, 6, (j) => {
    const at = zonedToUtc(date, Number(j.depart.slice(0, 2)), Number(j.depart.slice(3, 5)), city.timezone);
    return j.dir === "toWork" ? calculateRoute(home, work, at) : calculateRoute(work, home, at);
  });

  const out: CommuteResponse = {
    date,
    dow,
    toWork: [],
    toHome: [],
    night: { toWork: { depart: WINDOWS.night, duration: 0, distance: 0 }, toHome: { depart: WINDOWS.night, duration: 0, distance: 0 } },
    geometry: { toWork: [], toHome: [] },
  };
  const bestGeometry: Record<"toWork" | "toHome", RouteResult | undefined> = { toWork: undefined, toHome: undefined };

  results.forEach((r, i) => {
    const job = jobs[i]!;
    if (r.status === "rejected") {
      console.error(JSON.stringify({ msg: "commute route failed", depart: job.depart, dir: job.dir, error: String(r.reason) }));
      return;
    }
    const opt: CommuteOption = { depart: job.depart, duration: r.value.duration, distance: r.value.distance };
    if (job.night) out.night[job.dir] = opt;
    else out[job.dir].push(opt);
    const cur = bestGeometry[job.dir];
    if (!job.night && (!cur || r.value.duration < cur.duration)) bestGeometry[job.dir] = r.value;
  });

  if (!out.toWork.length || !out.toHome.length) throw new CommuteError(502, "Nie udało się wyznaczyć trasy. Spróbuj przesunąć punkty bliżej drogi.");
  // Fall back to the fastest daytime option if the night calculation failed.
  for (const dir of ["toWork", "toHome"] as const) {
    if (!out.night[dir].duration) out.night[dir] = { ...pickBest(out[dir])!, depart: WINDOWS.night };
    out.geometry[dir] = bestGeometry[dir]?.geometry ?? [];
  }
  return out;
}

/** Cached, quota-protected commute lookup. Coordinates are only stored hashed. */
export async function getCommute(city: CityDef, home: LngLat, work: LngLat, dow: number, ip: string): Promise<CommuteResponse> {
  validate(city, home, work);
  const key = { pk: `COMMUTE#${hash(`${city.id}|${home.join(",")}|${work.join(",")}|${dow}`)}`, sk: "v1" };
  const cached = await ddb.send(new GetCommand({ TableName: TABLE, Key: key }));
  if (cached.Item && Number(cached.Item.ttl) > Date.now() / 1000) return JSON.parse(String(cached.Item.data)) as CommuteResponse;

  await consumeQuota(city, ip);
  const res = await computeCommute(city, home, work, dow);
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: { ...key, data: JSON.stringify(res), ttl: Math.floor(Date.now() / 1000) + CACHE_DAYS * 86400 },
    }),
  );
  return res;
}
