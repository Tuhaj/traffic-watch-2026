/** [longitude, latitude] */
export type LngLat = [number, number];

export interface RouteDef {
  id: string;
  /** Short label shown in the UI, e.g. "Puławska". */
  name: string;
  /** Where the trip starts, e.g. "Piaseczno". */
  from: string;
  /** Road numbers / corridor, e.g. "DK79". */
  road: string;
  origin: LngLat;
}

export interface CityDef {
  id: string;
  name: string;
  timezone: string;
  center: LngLat;
  centerName: string;
  zoom: number;
  routes: RouteDef[];
}

/** One measurement of a single route. Durations and distance in seconds / metres. */
export interface RouteReading {
  duration: number;
  freeFlow: number;
  distance: number;
}

/** All routes of a city measured in one collector run. */
export interface Snapshot {
  /** ISO timestamp (UTC) of the 15-minute slot the run belongs to. */
  t: string;
  /** Local slot label, "HH:MM" in the city's timezone. */
  slot: string;
  /** sum(duration) / sum(freeFlow) across routes; 1.0 = no traffic. */
  index: number;
  /** Free-flow-weighted mean travel time to the centre, seconds. */
  meanDuration: number;
  routes: Record<string, RouteReading>;
}

export interface CitySummary {
  id: string;
  name: string;
  center: LngLat;
  zoom: number;
}

export interface RouteState extends RouteDef {
  geometry: LngLat[] | null;
}

export interface CityResponse {
  city: Omit<CityDef, "routes">;
  routes: RouteState[];
  latest: Snapshot | null;
}

export interface DayResponse {
  date: string;
  snapshots: Snapshot[];
}

export interface ProfileSlot {
  slot: string;
  /** Number of samples averaged into this slot. */
  n: number;
  index: number;
  meanDuration: number;
  routes: Record<string, { duration: number; freeFlow: number }>;
}

export interface ProfileResponse {
  /** ISO weekday, 1 = Monday ... 7 = Sunday. */
  dow: number;
  slots: ProfileSlot[];
}

export interface CommuteOption {
  /** Local departure time "HH:MM". */
  depart: string;
  duration: number;
  distance: number;
}

export interface CommuteResponse {
  /** Calendar date (city timezone) the forecast is computed for. */
  date: string;
  dow: number;
  toWork: CommuteOption[];
  toHome: CommuteOption[];
  night: { toWork: CommuteOption; toHome: CommuteOption };
  geometry: { toWork: LngLat[]; toHome: LngLat[] };
}
