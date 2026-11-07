import { describe, expect, it } from "vitest";
import { CITIES } from "../../shared/cities";
import { formatLngLat, parseLngLat } from "../../shared/geo";
import { nextDateForDow, slotRange, zonedToUtc } from "../../shared/time";
import { viewerIp } from "../src/api";
import { CommuteError, pickBest, validate, WINDOWS } from "../src/commute";

const city = CITIES[0]!;

describe("time helpers", () => {
  it("converts Warsaw wall-clock to UTC in winter and summer", () => {
    expect(zonedToUtc("2026-11-09", 8, 0, "Europe/Warsaw").toISOString()).toBe("2026-11-09T07:00:00.000Z");
    expect(zonedToUtc("2026-07-06", 8, 0, "Europe/Warsaw").toISOString()).toBe("2026-07-06T06:00:00.000Z");
  });
  it("finds the next date for a weekday, never today", () => {
    const sat = new Date("2026-11-07T10:00:00Z");
    expect(nextDateForDow(1, "Europe/Warsaw", sat)).toBe("2026-11-09");
    expect(nextDateForDow(6, "Europe/Warsaw", sat)).toBe("2026-11-14");
  });
  it("builds slot ranges", () => {
    expect(slotRange("05:30", "07:00", 30)).toEqual(["05:30", "06:00", "06:30", "07:00"]);
    expect(WINDOWS.toWork.length + WINDOWS.toHome.length + 2).toBe(26);
  });
});

describe("geo", () => {
  it("parses and rounds coordinates", () => {
    expect(parseLngLat("21.01234,52.22987")).toEqual([21.012, 52.23]);
    expect(parseLngLat("abc")).toBeNull();
    expect(parseLngLat("1,2,3")).toBeNull();
    expect(formatLngLat([21.0129, 52.2])).toBe("21.013,52.200");
  });
});

describe("commute", () => {
  it("rejects points outside the metro area or too close together", () => {
    expect(() => validate(city, [19.94, 50.06], [21.0, 52.23])).toThrow(CommuteError);
    expect(() => validate(city, [21.0, 52.23], [21.001, 52.2301])).toThrow(/blisko/);
    expect(() => validate(city, [21.023, 52.08], [20.985, 52.235])).not.toThrow();
  });
  it("picks the fastest departure", () => {
    expect(pickBest([{ depart: "07:00", duration: 2000, distance: 1 }, { depart: "06:00", duration: 1500, distance: 1 }])?.depart).toBe("06:00");
    expect(pickBest([])).toBeUndefined();
  });
  it("reads the viewer IP from CloudFront", () => {
    const ev = (h: Record<string, string>) => ({ headers: h, requestContext: { http: { sourceIp: "9.9.9.9" } } }) as never;
    expect(viewerIp(ev({ "cloudfront-viewer-address": "1.2.3.4:5678" }))).toBe("1.2.3.4");
    expect(viewerIp(ev({ "cloudfront-viewer-address": "2001:db8::1:443" }))).toBe("2001:db8::1");
    expect(viewerIp(ev({}))).toBe("9.9.9.9");
  });
});
