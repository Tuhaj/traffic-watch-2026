import type { CityResponse, DayResponse, ProfileResponse } from "../../shared/types";

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const api = {
  city: (id: string, signal?: AbortSignal) => get<CityResponse>(`/api/cities/${id}`, signal),
  day: (id: string, date: string, signal?: AbortSignal) => get<DayResponse>(`/api/cities/${id}/day?date=${date}`, signal),
  profile: (id: string, dow: number, signal?: AbortSignal) =>
    get<ProfileResponse>(`/api/cities/${id}/profile?dow=${dow}`, signal),
};
