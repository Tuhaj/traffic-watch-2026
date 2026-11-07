import { DynamoDBClient, ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { CITIES } from "../../shared/cities";
import { summarize } from "../../shared/congestion";
import { floorToSlot, localParts, slotLabel } from "../../shared/time";
import type { CityDef, RouteReading, Snapshot } from "../../shared/types";
import { keys } from "./keys";
import { calculateRoute, pool } from "./routing";

const TABLE = process.env.TABLE_NAME!;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const CONCURRENCY = 4;
/** Snapshots are kept for ~2 years; profiles are aggregates and are kept forever. */
const SNAPSHOT_TTL_DAYS = 730;

export function buildSnapshot(city: CityDef, at: Date, readings: Record<string, RouteReading>): Snapshot {
  const slotTime = floorToSlot(at);
  const local = localParts(slotTime, city.timezone);
  return {
    t: slotTime.toISOString(),
    slot: slotLabel(local.hour, local.minute),
    ...summarize(Object.values(readings)),
    routes: readings,
  };
}

/** UpdateExpression that adds this snapshot to the weekday/slot running sums. */
export function profileUpdate(city: CityDef, snap: Snapshot) {
  const names: Record<string, string> = {};
  const values: Record<string, number> = {};
  const adds: string[] = [];
  const add = (attr: string, value: number) => {
    const n = `#a${adds.length}`;
    const v = `:v${adds.length}`;
    names[n] = attr;
    values[v] = value;
    adds.push(`${n} ${v}`);
  };
  for (const [id, r] of Object.entries(snap.routes)) {
    add(`n_${id}`, 1);
    add(`d_${id}`, r.duration);
    add(`f_${id}`, r.freeFlow);
  }
  // City-wide index only from complete runs so partial outages don't skew it.
  if (Object.keys(snap.routes).length === city.routes.length) {
    add("n", 1);
    add("si", snap.index);
    add("sm", snap.meanDuration);
  }
  return {
    UpdateExpression: `ADD ${adds.join(", ")}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  };
}

export async function collectCity(city: CityDef, at: Date): Promise<Snapshot | null> {
  const results = await pool(city.routes, CONCURRENCY, (r) => calculateRoute(r.origin, city.center));
  const readings: Record<string, RouteReading> = {};
  const geometryWrites: Promise<unknown>[] = [];
  const now = new Date().toISOString();

  results.forEach((res, i) => {
    const route = city.routes[i]!;
    if (res.status === "rejected") {
      console.error(JSON.stringify({ msg: "route failed", city: city.id, route: route.id, error: String(res.reason) }));
      return;
    }
    const { geometry, ...reading } = res.value;
    readings[route.id] = reading;
    if (geometry.length > 1) {
      geometryWrites.push(
        ddb.send(
          new PutCommand({
            TableName: TABLE,
            Item: { ...keys.route(city.id, route.id), geometry: JSON.stringify(geometry), updatedAt: now },
          }),
        ),
      );
    }
  });

  if (Object.keys(readings).length === 0) throw new Error(`All routes failed for ${city.id}`);

  const snap = buildSnapshot(city, at, readings);
  const date = localParts(new Date(snap.t), city.timezone);
  const ttl = Math.floor(Date.parse(snap.t) / 1000) + SNAPSHOT_TTL_DAYS * 86400;

  try {
    // Conditional put makes retries of the same slot idempotent (no double counting in profiles).
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: { pk: keys.dayPk(city.id, date.date), sk: snap.t, data: JSON.stringify(snap), ttl },
        ConditionExpression: "attribute_not_exists(sk)",
      }),
    );
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      console.warn(JSON.stringify({ msg: "slot already collected", city: city.id, t: snap.t }));
      await Promise.all(geometryWrites);
      return null;
    }
    throw e;
  }

  await Promise.all([
    ...geometryWrites,
    ddb.send(new PutCommand({ TableName: TABLE, Item: { ...keys.latest(city.id), data: JSON.stringify(snap) } })),
    ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk: keys.profilePk(city.id, date.dow), sk: snap.slot },
        ...profileUpdate(city, snap),
      }),
    ),
  ]);

  console.log(
    JSON.stringify({
      msg: "collected",
      city: city.id,
      t: snap.t,
      routes: Object.keys(readings).length,
      index: snap.index,
      meanMinutes: Math.round(snap.meanDuration / 60),
    }),
  );
  return snap;
}

/** Invoked by EventBridge Scheduler with {"scheduledTime": "<aws.scheduler.scheduled-time>"}. */
export async function handler(event: { scheduledTime?: string } = {}) {
  const at = event.scheduledTime ? new Date(event.scheduledTime) : new Date();
  const out = await Promise.allSettled(CITIES.map((c) => collectCity(c, at)));
  const failed = out.filter((o) => o.status === "rejected");
  if (failed.length) throw new Error(`${failed.length} cities failed: ${failed.map((f) => String((f as PromiseRejectedResult).reason)).join("; ")}`);
  return { ok: true };
}
