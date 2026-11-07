import { describe, expect, it } from "vitest";
import { levelFor, summarize } from "../../shared/congestion";
import { dowOfDate, floorToSlot, isIsoDate, localParts } from "../../shared/time";

describe("time", () => {
  it("converts to Warsaw local time across DST", () => {
    expect(localParts(new Date("2026-07-01T05:00:00Z"), "Europe/Warsaw")).toMatchObject({ date: "2026-07-01", hour: 7, dow: 3 });
    expect(localParts(new Date("2026-12-31T23:30:00Z"), "Europe/Warsaw")).toMatchObject({ date: "2027-01-01", hour: 0, minute: 30, dow: 5 });
  });
  it("floors to 15-minute slots", () => {
    expect(floorToSlot(new Date("2026-11-07T07:14:59.900Z")).toISOString()).toBe("2026-11-07T07:00:00.000Z");
    expect(floorToSlot(new Date("2026-11-07T07:15:00.000Z")).toISOString()).toBe("2026-11-07T07:15:00.000Z");
  });
  it("computes ISO weekday and validates dates", () => {
    expect(dowOfDate("2026-11-07")).toBe(6);
    expect(dowOfDate("2026-11-08")).toBe(7);
    expect(dowOfDate("2026-11-09")).toBe(1);
    expect(isIsoDate("2026-11-07")).toBe(true);
    expect(isIsoDate("2026-13-07")).toBe(false);
    expect(isIsoDate("x")).toBe(false);
  });
});

describe("congestion", () => {
  it("summarizes readings with free-flow weighting", () => {
    const s = summarize([
      { duration: 1200, freeFlow: 600, distance: 0 },
      { duration: 600, freeFlow: 600, distance: 0 },
    ]);
    expect(s.index).toBe(1.5);
    expect(s.meanDuration).toBe(900);
  });
  it("handles empty input", () => {
    expect(summarize([])).toEqual({ index: 1, meanDuration: 0 });
  });
  it("maps ratios to levels", () => {
    expect(levelFor(1).key).toBe("free");
    expect(levelFor(1.2).key).toBe("moderate");
    expect(levelFor(1.5).key).toBe("heavy");
    expect(levelFor(2.5).key).toBe("jam");
  });
});
