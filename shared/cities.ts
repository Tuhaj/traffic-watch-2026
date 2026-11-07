import type { CityDef } from "./types";

/**
 * Measured corridors. Each route starts just outside the city border on a main
 * radial road and ends in the centre. Adding a route here is enough: the
 * collector picks it up on the next run and the UI shows it once it has data.
 */
export const CITIES: CityDef[] = [
  {
    id: "warszawa",
    name: "Warszawa",
    timezone: "Europe/Warsaw",
    center: [21.0122, 52.2297],
    centerName: "Rondo Dmowskiego",
    zoom: 10.4,
    routes: [
      { id: "lomianki", name: "Pułkowa", from: "Łomianki", road: "DK7", origin: [20.893, 52.333] },
      { id: "jablonna", name: "Modlińska", from: "Jabłonna", road: "DK61", origin: [20.915, 52.376] },
      { id: "marki", name: "Radzymińska", from: "Marki", road: "DK8 / S8", origin: [21.105, 52.323] },
      { id: "sulejowek", name: "Trakt Brzeski", from: "Sulejówek", road: "DK2", origin: [21.25, 52.243] },
      { id: "zakret", name: "Lubelska", from: "Zakręt", road: "S17 / S2", origin: [21.23, 52.195] },
      { id: "jozefow", name: "Wał Miedzeszyński", from: "Józefów", road: "DW801", origin: [21.23, 52.137] },
      { id: "konstancin", name: "Przyczółkowa", from: "Konstancin", road: "DW724", origin: [21.115, 52.095] },
      { id: "piaseczno", name: "Puławska", from: "Piaseczno", road: "DK79", origin: [21.023, 52.08] },
      { id: "raszyn", name: "Al. Krakowska", from: "Raszyn", road: "DK7 / S8", origin: [20.925, 52.156] },
      { id: "pruszkow", name: "Al. Jerozolimskie", from: "Pruszków", road: "DW719", origin: [20.812, 52.171] },
      { id: "ozarow", name: "Połczyńska", from: "Ożarów Maz.", road: "DK92", origin: [20.795, 52.211] },
      { id: "babice", name: "Górczewska", from: "Stare Babice", road: "DW580", origin: [20.83, 52.255] },
    ],
  },
];

export function findCity(id: string): CityDef | undefined {
  return CITIES.find((c) => c.id === id);
}
