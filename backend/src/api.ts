import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchGetCommand, DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { CITIES, findCity } from "../../shared/cities";
import { round } from "../../shared/congestion";
import { parseLngLat } from "../../shared/geo";
import { isIsoDate, localParts } from "../../shared/time";
import type {
  CityDef,
  CityResponse,
  CitySummary,
  DayResponse,
  LngLat,
  ProfileResponse,
  ProfileSlot,
  Snapshot,
  TravelMode,
} from "../../shared/types";
import { getCommute, MODES } from "./commute";
import { ApiError } from "./quota";
import { getPlace, suggestPlaces } from "./places";
import { keys } from "./keys";

const TABLE = process.env.TABLE_NAME!;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type Result = APIGatewayProxyResultV2 & { statusCode: number; body: string };

function json(statusCode: number, body: unknown, maxAge = 0): Result {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": maxAge > 0 ? `public, max-age=${maxAge}, s-maxage=${maxAge}` : "no-store",
    },
    body: JSON.stringify(body),
  };
}

async function queryAll(pk: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ExclusiveStartKey: start,
      }),
    );
    items.push(...(res.Items ?? []));
    start = res.LastEvaluatedKey;
  } while (start);
  return items;
}

async function getCity(city: CityDef): Promise<CityResponse> {
  const [routesRes, latestRes] = await Promise.all([
    ddb.send(
      new BatchGetCommand({
        RequestItems: {
          [TABLE]: { Keys: city.routes.map((r) => keys.route(city.id, r.id)), ProjectionExpression: "sk, geometry" },
        },
      }),
    ),
    ddb.send(new GetCommand({ TableName: TABLE, Key: keys.latest(city.id) })),
  ]);
  const geometries = new Map<string, LngLat[]>();
  for (const item of routesRes.Responses?.[TABLE] ?? []) {
    geometries.set(String(item.sk).replace("ROUTE#", ""), JSON.parse(String(item.geometry)));
  }
  const { routes, ...meta } = city;
  return {
    city: meta,
    routes: routes.map((r) => ({ ...r, geometry: geometries.get(r.id) ?? null })),
    latest: latestRes.Item ? (JSON.parse(String(latestRes.Item.data)) as Snapshot) : null,
  };
}

async function getDay(city: CityDef, date: string): Promise<DayResponse> {
  const items = await queryAll(keys.dayPk(city.id, date));
  return { date, snapshots: items.map((i) => JSON.parse(String(i.data)) as Snapshot) };
}

export function toProfileSlot(city: CityDef, item: Record<string, unknown>): ProfileSlot {
  const num = (k: string) => Number(item[k] ?? 0);
  const routes: ProfileSlot["routes"] = {};
  for (const r of city.routes) {
    const n = num(`n_${r.id}`);
    if (n > 0) routes[r.id] = { duration: Math.round(num(`d_${r.id}`) / n), freeFlow: Math.round(num(`f_${r.id}`) / n) };
  }
  const n = num("n");
  return {
    slot: String(item.sk),
    n,
    index: n ? round(num("si") / n, 3) : 0,
    meanDuration: n ? Math.round(num("sm") / n) : 0,
    routes,
  };
}

async function getProfile(city: CityDef, dow: number): Promise<ProfileResponse> {
  const items = await queryAll(keys.profilePk(city.id, dow));
  return { dow, slots: items.map((i) => toProfileSlot(city, i)).filter((s) => s.n > 0) };
}

/** CloudFront passes the real client as "ip:port" (IPv6 too, so strip only the last segment). */
export function viewerIp(event: APIGatewayProxyEventV2): string {
  const v = event.headers?.["cloudfront-viewer-address"];
  if (v) return v.replace(/:\d+$/, "");
  return event.requestContext.http.sourceIp ?? "unknown";
}

export async function handler(event: APIGatewayProxyEventV2): Promise<Result> {
  if (event.requestContext.http.method !== "GET") return json(405, { message: "Method not allowed" });
  const path = event.rawPath.replace(/\/+$/, "");
  const q = event.queryStringParameters ?? {};

  try {
    if (path === "/api/cities") {
      const list: CitySummary[] = CITIES.map(({ id, name, center, zoom }) => ({ id, name, center, zoom }));
      return json(200, list, 3600);
    }

    if (path === "/api/places/suggest") {
      const city = findCity(q.city ?? "warszawa");
      if (!city) return json(404, { message: "Not found" });
      return json(200, await suggestPlaces(city, q.q ?? "", viewerIp(event))); // SingleUse: never cached
    }

    if (path === "/api/places/detail") {
      const city = findCity(q.city ?? "warszawa");
      if (!city || !q.id) return json(400, { message: "id is required" });
      return json(200, await getPlace(city, q.id, viewerIp(event)), 7 * 86400);
    }

    if (path === "/api/commute") {
      const city = findCity(q.city ?? "warszawa");
      const home = parseLngLat(q.home);
      const work = parseLngLat(q.work);
      const dow = Number(q.dow ?? 1);
      if (!city || !home || !work) return json(400, { message: "home and work must be lng,lat" });
      if (!Number.isInteger(dow) || dow < 1 || dow > 7) return json(400, { message: "dow must be 1..7" });
      const mode = (q.mode ?? "car") as TravelMode;
      if (!MODES.includes(mode)) return json(400, { message: "mode must be car, transit or bike" });
      return json(200, await getCommute(city, home, work, dow, viewerIp(event), mode), 21600);
    }

    const m = path.match(/^\/api\/cities\/([a-z0-9-]+)(?:\/(day|profile))?$/);
    const city = m ? findCity(m[1]!) : undefined;
    if (!m || !city) return json(404, { message: "Not found" });

    switch (m[2]) {
      case undefined:
        return json(200, await getCity(city), 60);
      case "day": {
        const today = localParts(new Date(), city.timezone).date;
        const date = q.date ?? today;
        if (!isIsoDate(date)) return json(400, { message: "date must be YYYY-MM-DD" });
        return json(200, await getDay(city, date), date < today ? 86400 : 60);
      }
      case "profile": {
        const dow = Number(q.dow);
        if (!Number.isInteger(dow) || dow < 1 || dow > 7) return json(400, { message: "dow must be 1..7" });
        return json(200, await getProfile(city, dow), 900);
      }
    }
    return json(404, { message: "Not found" });
  } catch (e) {
    if (e instanceof ApiError) return json(e.status, { message: e.message });
    console.error(e);
    return json(500, { message: "Internal error" });
  }
}
