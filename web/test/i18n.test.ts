import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en";
import { interpolate, translate } from "../src/i18n/index";
import { pl } from "../src/i18n/pl";
import { uk } from "../src/i18n/uk";

describe("i18n", () => {
  it("has a non-empty translation for every key in every language", () => {
    for (const dict of [en, uk]) {
      expect(Object.keys(dict).sort()).toEqual(Object.keys(pl).sort());
      for (const [k, v] of Object.entries(dict)) {
        const values = typeof v === "string" ? [v] : Object.values(v);
        for (const s of values) expect(s.trim(), k).not.toBe("");
      }
    }
  });

  it("keeps the same placeholders as Polish", () => {
    const ph = (v: unknown) => [...JSON.stringify(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const dict of [en, uk] as Record<string, unknown>[]) {
      for (const [k, v] of Object.entries(pl)) expect([...new Set(ph(dict[k]))], k).toEqual([...new Set(ph(v))]);
    }
  });

  it("never uses long dashes in copy", () => {
    for (const dict of [pl, en, uk]) expect(JSON.stringify(dict)).not.toMatch(/[–—]/);
  });

  it("interpolates params and leaves unknown ones", () => {
    expect(interpolate("{a} i {b}", { a: 1 })).toBe("1 i {b}");
  });

  it("uses Polish and Ukrainian plural forms", () => {
    expect(translate("pl", "city.routes", { n: 1 })).toBe("1 trasa");
    expect(translate("pl", "city.routes", { n: 3 })).toBe("3 trasy");
    expect(translate("pl", "city.routes", { n: 12 })).toBe("12 tras");
    expect(translate("pl", "city.routes", { n: 22 })).toBe("22 trasy");
    expect(translate("uk", "city.routes", { n: 1 })).toBe("1 маршрут");
    expect(translate("uk", "city.routes", { n: 3 })).toBe("3 маршрути");
    expect(translate("uk", "city.routes", { n: 12 })).toBe("12 маршрутів");
    expect(translate("en", "city.routes", { n: 1 })).toBe("1 route");
    expect(translate("en", "city.routes", { n: 12 })).toBe("12 routes");
  });

  it("translates API error codes with params", () => {
    expect(translate("en", "errors.outside_radius", { km: 60 })).toBe("Both points must be within 60 km of the city centre.");
    expect(translate("uk", "errors.outside_radius", { km: 60 })).toContain("60 км");
  });
});
