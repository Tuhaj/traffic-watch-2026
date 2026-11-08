import { describe, expect, it } from "vitest";
import { CITIES } from "../../shared/cities";
import { handler, toProfileSlot } from "../src/api";
import { buildSnapshot, profileUpdate } from "../src/collector";
import { simplify } from "../src/geometry";

const city = CITIES[0]!;
const reading = { duration: 1500, freeFlow: 1000, distance: 15000 };
const allReadings = Object.fromEntries(city.routes.map((r) => [r.id, reading]));

describe("geometry", () => {
  it("drops collinear points and keeps ends", () => {
    const out = simplify([[21, 52], [21.0001, 52], [21.0002, 52], [21.0002, 52.01]]);
    expect(out).toEqual([[21, 52], [21.0002, 52], [21.0002, 52.01]]);
  });
});

describe("collector", () => {
  it("builds a snapshot in the local slot", () => {
    const snap = buildSnapshot(city, new Date("2026-11-09T06:31:12Z"), allReadings);
    expect(snap.t).toBe("2026-11-09T06:30:00.000Z");
    expect(snap.slot).toBe("07:30");
    expect(snap.index).toBe(1.5);
    expect(snap.meanDuration).toBe(1500);
  });

  it("adds city-wide sums only for complete runs", () => {
    const full = profileUpdate(city, buildSnapshot(city, new Date(), allReadings));
    expect(Object.values(full.ExpressionAttributeNames)).toContain("si");
    const partial = profileUpdate(city, buildSnapshot(city, new Date(), { lomianki: reading }));
    expect(Object.values(partial.ExpressionAttributeNames)).toEqual(["n_lomianki", "d_lomianki", "f_lomianki"]);
  });

  it("round-trips through the profile aggregate", () => {
    const snap = buildSnapshot(city, new Date(), allReadings);
    const upd = profileUpdate(city, snap);
    const item: Record<string, unknown> = { sk: snap.slot };
    for (const [n, attr] of Object.entries(upd.ExpressionAttributeNames)) {
      item[attr] = 2 * upd.ExpressionAttributeValues[n.replace("#a", ":v")]!; // two identical samples
    }
    const slot = toProfileSlot(city, item);
    expect(slot.n).toBe(2);
    expect(slot.index).toBe(1.5);
    expect(slot.routes.lomianki).toEqual({ duration: 1500, freeFlow: 1000 });
  });
});

describe("api", () => {
  const req = (rawPath: string, qs?: Record<string, string>, method = "GET") =>
    handler({ rawPath, queryStringParameters: qs, requestContext: { http: { method } } } as never);

  it("lists cities", async () => {
    const res = await req("/api/cities");
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)[0].id).toBe("warszawa");
  });
  it("validates input", async () => {
    expect((await req("/api/cities/nowhere")).statusCode).toBe(404);
    expect((await req("/api/cities/warszawa/day", { date: "bad" })).statusCode).toBe(400);
    expect((await req("/api/cities/warszawa/profile", { dow: "9" })).statusCode).toBe(400);
    expect((await req("/api/cities", {}, "POST")).statusCode).toBe(405);
    expect(JSON.parse((await req("/api/cities/nowhere")).body).code).toBe("not_found");
  });
});

describe("cookieless stats", async () => {
  const { counterKeys, isBot, referrerHost } = await import("../src/stats");
  it("keeps only the referring host and folds Facebook mirrors", () => {
    expect(referrerHost("https://l.facebook.com/l.php?u=abc")).toBe("facebook.com");
    expect(referrerHost("https://www.google.com/search?q=x")).toBe("google.com");
    expect(referrerHost("https://traffic.isy.sh/faq/")).toBe("");
    expect(referrerHost(undefined)).toBe("direct");
  });
  it("builds counters only for known events and paths", () => {
    expect(counterKeys({ event: "pageview", path: "/", referrer: "", lang: "uk", device: "mobile" }, "PL")).toEqual([
      "ev#pageview",
      "pv#/",
      "ref#direct",
      "lang#uk",
      "dev#mobile",
      "country#PL",
    ]);
    expect(counterKeys({ event: "pageview", path: "/wp-admin", lang: "xx" })).toEqual(["ev#pageview", "pv#other", "ref#direct"]);
    expect(counterKeys({ event: "commute", path: "/", value: "Transit" })).toEqual(["ev#commute:transit"]);
    expect(counterKeys({ event: "drop table", path: "/" })).toEqual([]);
  });
  it("ignores bots and empty user agents", () => {
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot(undefined)).toBe(true);
    expect(isBot("Mozilla/5.0 (Macintosh) Safari/605.1.15")).toBe(false);
  });
});
