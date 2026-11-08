import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { localParts } from "../../shared/time";
import { hash } from "./quota";

/**
 * Cookieless, privacy-friendly analytics (in the spirit of Plausible / GoatCounter):
 * - no cookies, no localStorage id, nothing that identifies a person is stored;
 * - daily unique visitors are counted with hash(salt, day, ip, user agent): the hash changes
 *   every day, raw IPs are never stored and the per-day hashes expire after 2 days;
 * - only aggregate daily counters are kept.
 */
const TABLE = process.env.TABLE_NAME!;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TZ = "Europe/Warsaw";

export const EVENTS = ["pageview", "commute", "lang", "tab", "faq"] as const;
const PATHS = /^\/(faq\/((en|uk)\/)?)?$/;
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|curl|wget|python|axios/i;

export interface Hit {
  event: string;
  path: string;
  /** Free-form but short value for the event, e.g. the commute mode or the language. */
  value?: string;
  referrer?: string;
  lang?: string;
  device?: string;
}

const clean = (s: string | undefined, max = 40) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9._:/-]/g, "")
    .slice(0, max);

/** Keeps only the referring host, and drops self-referrals. */
export function referrerHost(ref: string | undefined, ownHost = "traffic.isy.sh"): string {
  if (!ref) return "direct";
  try {
    const host = new URL(ref).hostname.replace(/^www\./, "").replace(/^(l|m|lm)\.facebook\.com$/, "facebook.com");
    if (!host || host === ownHost) return "";
    return clean(host, 60);
  } catch {
    return "";
  }
}

/** Counter keys this hit increments (pure, for tests). */
export function counterKeys(hit: Hit, country?: string): string[] {
  const event = EVENTS.includes(hit.event as (typeof EVENTS)[number]) ? hit.event : null;
  if (!event) return [];
  const keys: string[] = [];
  const value = clean(hit.value, 20);
  keys.push(`ev#${event}${value ? `:${value}` : ""}`);
  if (event === "pageview") {
    keys.push(`pv#${PATHS.test(hit.path) ? hit.path : "other"}`);
    const ref = referrerHost(hit.referrer);
    if (ref) keys.push(`ref#${ref}`);
    if (hit.lang && ["pl", "en", "uk"].includes(hit.lang)) keys.push(`lang#${hit.lang}`);
    if (hit.device === "mobile" || hit.device === "desktop") keys.push(`dev#${hit.device}`);
    if (country && /^[A-Z]{2}$/.test(country)) keys.push(`country#${country}`);
  }
  return keys;
}

export function isBot(userAgent: string | undefined): boolean {
  return !userAgent || BOT.test(userAgent);
}

export async function recordHit(hit: Hit, ip: string, userAgent: string | undefined, country?: string) {
  if (isBot(userAgent)) return;
  const keys = counterKeys(hit, country);
  if (!keys.length) return;
  const date = localParts(new Date(), TZ).date;
  const pk = `STATS#${date}`;

  if (hit.event === "pageview") {
    try {
      await ddb.send(
        new PutCommand({
          TableName: TABLE,
          Item: { pk: `VISITOR#${date}`, sk: hash(`${date}|${ip}|${userAgent}`), ttl: Math.floor(Date.now() / 1000) + 2 * 86400 },
          ConditionExpression: "attribute_not_exists(sk)",
        }),
      );
      keys.push("uv");
    } catch (e) {
      if (!(e instanceof ConditionalCheckFailedException)) throw e;
    }
  }

  await Promise.all(
    keys.map((sk) =>
      ddb.send(new UpdateCommand({ TableName: TABLE, Key: { pk, sk }, UpdateExpression: "ADD n :one", ExpressionAttributeValues: { ":one": 1 } })),
    ),
  );
}
