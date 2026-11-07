import { describe, expect, it } from "vitest";
import { CITIES } from "../../shared/cities";
import { formatLngLat, parseLngLat } from "../../shared/geo";
import { nextDateForDow, slotRange, zonedToUtc } from "../../shared/time";
import { viewerIp } from "../src/api";
import { pickBest, validate, WINDOWS } from "../src/commute";
import { ApiError } from "../src/quota";

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
    expect(() => validate(city, [19.94, 50.06], [21.0, 52.23])).toThrow(ApiError);
    expect(() => validate(city, [21.0, 52.23], [21.001, 52.2301])).toThrow(/blisko/);
    expect(() => validate(city, [21.023, 52.08], [20.985, 52.235])).not.toThrow();
  });
  it("picks the fastest departure", () => {
    const o = (depart: string, duration: number) => ({ depart, arrive: "", duration, distance: 1, legs: [] });
    expect(pickBest([o("07:00", 2000), o("06:00", 1500)])?.depart).toBe("06:00");
    expect(pickBest([])).toBeUndefined();
  });
  it("reads the viewer IP from CloudFront", () => {
    const ev = (h: Record<string, string>) => ({ headers: h, requestContext: { http: { sourceIp: "9.9.9.9" } } }) as never;
    expect(viewerIp(ev({ "cloudfront-viewer-address": "1.2.3.4:5678" }))).toBe("1.2.3.4");
    expect(viewerIp(ev({ "cloudfront-viewer-address": "2001:db8::1:443" }))).toBe("2001:db8::1");
    expect(viewerIp(ev({}))).toBe("9.9.9.9");
  });
});

describe("places", async () => {
  const { shortLabel, toSuggestion, suggestPlaces } = await import("../src/places");
  it("shortens Polish address labels", () => {
    expect(shortLabel("ulica Puławska 30, 02-512 Warszawa, Polska")).toBe("ul. Puławska 30, 02-512 Warszawa");
    expect(shortLabel("Galeria Mokotów, ulica Wołoska 12, 02-675 Warszawa, Polska")).toBe("Galeria Mokotów, ul. Wołoska 12, 02-675 Warszawa");
    expect(shortLabel("aleja Jana Pawła II 1, 00-001 Warszawa, Polska")).toBe("al. Jana Pawła II 1, 00-001 Warszawa");
  });
  it("maps suggest items for addresses and POIs, skipping query refinements", () => {
    expect(
      toSuggestion({
        SuggestResultItemType: "Place",
        Title: "ulica Puławska (ulica Pulawska) 30, 02-512 Warszawa, Polska",
        Place: { PlaceId: "abc", PlaceType: "PointAddress", Address: { Label: "ulica Puławska 30, 02-512 Warszawa, Polska" } },
      } as never),
    ).toEqual({ id: "abc", title: "ul. Puławska 30, 02-512 Warszawa", subtitle: "" });
    expect(
      toSuggestion({
        SuggestResultItemType: "Place",
        Title: "Galeria Mokotów",
        Place: { PlaceId: "p1", PlaceType: "PointOfInterest", Address: { Label: "Galeria Mokotów, ulica Wołoska 12, 02-675 Warszawa, Polska" } },
      } as never),
    ).toEqual({ id: "p1", title: "Galeria Mokotów", subtitle: "ul. Wołoska 12, 02-675 Warszawa" });
    expect(toSuggestion({ SuggestResultItemType: "Query", Title: "x" } as never)).toBeNull();
  });
  it("does not call the provider for short queries", async () => {
    expect(await suggestPlaces(city, "ab", "1.1.1.1")).toEqual([]);
  });
});

describe("modes", async () => {
  const { decodePolyline6, mergeWalks, transitLeg, vehicleLabel } = await import("../src/modes");
  it("merges consecutive walking legs", () => {
    const walk = (d: number) => ({ kind: "walk" as const, duration: d, distance: d, geometry: [[21, 52]] as [number, number][] });
    const tram = { kind: "transit" as const, duration: 600, distance: 3000, geometry: [] };
    const out = mergeWalks([walk(60), tram, walk(60), walk(660)]);
    expect(out.map((l) => [l.kind, l.duration])).toEqual([["walk", 60], ["transit", 600], ["walk", 720]]);
  });
  it("decodes Valhalla polyline6", () => {
    // Encoded with precision 6: (52.2053, 21.0225) -> (52.1799, 21.004)
    const enc = "gnjqbBgqbbg@nrp@fcc@";
    const pts = decodePolyline6(enc);
    expect(pts).toHaveLength(2);
    expect(pts[0]![0]).toBeCloseTo(21.0225, 4);
    expect(pts[0]![1]).toBeCloseTo(52.2053, 4);
    expect(pts[1]![1]).toBeLessThan(pts[0]![1]);
  });
  it("maps a transit leg with line, stops and local times", () => {
    const leg = transitLeg(
      {
        Type: "Transit",
        TravelMode: "LightRail",
        Geometry: { LineString: [[21.0229, 52.2052], [20.9829, 52.23]] },
        TransitLegDetails: {
          Departure: { Place: { Name: "Dworkowa", Position: [21.0229, 52.2052] }, Time: "2026-11-09T07:31:00+01:00" },
          Arrival: { Place: { Name: "Rondo Daszyńskiego", Position: [20.9829, 52.23] }, Time: "2026-11-09T07:51:00+01:00" },
          Transport: { Mode: "LightRail", ShortRouteName: "10", Headsign: "Os. Górczewska", Color: "#B60000" },
          Summary: { Overview: { Duration: 1200, Distance: 5171 } },
        },
      } as never,
      "Europe/Warsaw",
    );
    expect(leg).toMatchObject({ kind: "transit", vehicle: "Tramwaj", line: "10", from: "Dworkowa", departs: "07:31", arrives: "07:51", duration: 1200 });
    expect(vehicleLabel("Subway")).toBe("Metro");
    expect(vehicleLabel(undefined)).toBe("Transport");
  });
});
