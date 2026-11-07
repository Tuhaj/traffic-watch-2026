import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { levelFor } from "../../shared/congestion";
import { formatLngLat, roundLngLat } from "../../shared/geo";
import { localParts } from "../../shared/time";
import type {
  CityResponse,
  CommuteResponse,
  DayResponse,
  LngLat,
  ProfileResponse,
  RouteReading,
  Snapshot,
} from "../../shared/types";
import { api } from "./api";
import { CommutePanel, type PointKind } from "./components/CommutePanel";
import { MapView } from "./components/MapView";
import { type SeriesPoint, Timeline } from "./components/Timeline";
import {
  fmtDelay,
  fmtMinutes,
  fmtPercent,
  fmtUpdated,
  minutes,
  recentDays,
  slotToMinutes,
  weekdayLong,
} from "./format";

const CITY = "warszawa";
const TZ = "Europe/Warsaw";
const REFRESH_MS = 60_000;
const STORAGE_KEY = "tw.commute.v1";

type Tab = "city" | "commute";
type CityMode = "live" | "daynight";

function useDarkMode() {
  const q = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return dark;
}

function loadPoints(): { home: LngLat | null; work: LngLat | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as { home?: LngLat; work?: LngLat };
      return { home: v.home ?? null, work: v.work ?? null };
    }
  } catch {
    /* storage unavailable */
  }
  return { home: null, work: null };
}

function savePoints(v: { home: LngLat | null; work: LngLat | null }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

/** Next working day's ISO weekday (Mon if tomorrow is a weekend). */
function defaultDow(): number {
  const tomorrow = localParts(new Date(Date.now() + 86_400_000), TZ).dow;
  return tomorrow <= 5 ? tomorrow : 1;
}

const isDaySlot = (slot: string) => {
  const m = slotToMinutes(slot);
  return m >= 6 * 60 && m <= 20 * 60;
};
const isNightSlot = (slot: string) => {
  const m = slotToMinutes(slot);
  return m >= 23 * 60 || m < 5 * 60;
};

export function App() {
  const dark = useDarkMode();
  const days = useMemo(() => recentDays(TZ), []);
  const [tab, setTab] = useState<Tab>("city");
  const [mode, setMode] = useState<CityMode>("live");
  const [date, setDate] = useState(days[0]!.date);
  const dow = days.find((d) => d.date === date)?.dow ?? days[0]!.dow;
  const isToday = date === days[0]!.date;

  const [city, setCity] = useState<CityResponse | null>(null);
  const [day, setDay] = useState<DayResponse | null>(null);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursorT, setCursorT] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // ---- personal commute ----
  const [points, setPoints] = useState(loadPoints);
  const [picking, setPicking] = useState<PointKind | null>(null);
  const [commuteDow, setCommuteDow] = useState(defaultDow);
  const [commute, setCommute] = useState<CommuteResponse | null>(null);
  const [commuteLoading, setCommuteLoading] = useState(false);
  const [commuteError, setCommuteError] = useState<string | null>(null);

  const setPoint = useCallback(
    (kind: PointKind, p: LngLat) => {
      const next = { ...points, [kind]: roundLngLat(p) };
      setPoints(next);
      savePoints(next);
      // After placing one point, go straight to the other if it is still missing.
      setPicking(kind === "home" && !next.work ? "work" : kind === "work" && !next.home ? "home" : null);
    },
    [points],
  );

  const clearPoints = () => {
    const empty = { home: null, work: null };
    setPoints(empty);
    savePoints(empty);
    setCommute(null);
    setCommuteError(null);
    setPicking("home");
  };

  useEffect(() => {
    if (!points.home || !points.work) return;
    const ctrl = new AbortController();
    setCommuteLoading(true);
    setCommuteError(null);
    const t = setTimeout(() => {
      fetch(
        `/api/commute?city=${CITY}&home=${formatLngLat(points.home!)}&work=${formatLngLat(points.work!)}&dow=${commuteDow}`,
        { signal: ctrl.signal },
      )
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error((body as { message?: string }).message ?? `Błąd ${res.status}`);
          setCommute(body as CommuteResponse);
        })
        .catch((e: Error) => {
          if (ctrl.signal.aborted) return;
          setCommute(null);
          setCommuteError(e.message);
        })
        .finally(() => !ctrl.signal.aborted && setCommuteLoading(false));
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [points.home, points.work, commuteDow]);

  // ---- city data ----
  const loadLive = useCallback(
    (signal?: AbortSignal) =>
      Promise.all([api.city(CITY, signal), api.day(CITY, date, signal)]).then(([c, d]) => {
        setCity(c);
        setDay(d);
        setError(null);
      }),
    [date],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    setDay(null);
    setCursorT(null);
    loadLive(ctrl.signal).catch((e) => !ctrl.signal.aborted && setError(String(e)));
    return () => ctrl.abort();
  }, [loadLive]);

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .profile(CITY, dow, ctrl.signal)
      .then(setProfile)
      .catch(() => !ctrl.signal.aborted && setProfile(null));
    return () => ctrl.abort();
  }, [dow]);

  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") loadLive().catch(() => undefined);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [isToday, loadLive]);

  const snapshots = day?.snapshots ?? [];

  // Day vs night: the worst daytime slot against the calmest night slot of the selected day.
  const dayNight = useMemo(() => {
    if (!snapshots.length) return null;
    const dayS = snapshots.filter((s) => isDaySlot(s.slot));
    const nightS = snapshots.filter((s) => isNightSlot(s.slot));
    const peak = (dayS.length ? dayS : snapshots).reduce((a, b) => (b.index > a.index ? b : a));
    const night = nightS.length ? nightS.reduce((a, b) => (b.index < a.index ? b : a)) : null;
    return { peak, night };
  }, [snapshots]);

  const active: Snapshot | null = useMemo(() => {
    if (mode === "daynight") return dayNight?.peak ?? null;
    if (cursorT) return snapshots.find((s) => s.t === cursorT) ?? null;
    return snapshots[snapshots.length - 1] ?? (isToday ? (city?.latest ?? null) : null);
  }, [mode, dayNight, cursorT, snapshots, isToday, city]);
  const isLive = isToday && !cursorT && mode === "live";

  const typicalSlot = useMemo(
    () => (active ? profile?.slots.find((s) => s.slot === active.slot) : undefined),
    [active, profile],
  );

  const focused = hovered ?? selected;
  const selectedRoute = city?.routes.find((r) => r.id === selected);

  const series = useMemo(() => {
    const pick = (r: Record<string, RouteReading | { duration: number; freeFlow: number }> | undefined, s: { meanDuration: number }) =>
      selected ? r?.[selected]?.duration : s.meanDuration;
    const actual: SeriesPoint[] = [];
    for (const s of snapshots) {
      const y = pick(s.routes, s);
      if (y) {
        const reading = selected ? s.routes[selected] : undefined;
        const ratio = reading ? reading.duration / reading.freeFlow : s.index;
        actual.push({ x: slotToMinutes(s.slot), y, t: s.t, color: levelFor(ratio).color });
      }
    }
    const typical: SeriesPoint[] = [];
    for (const s of profile?.slots ?? []) {
      const y = pick(s.routes, s);
      if (y) typical.push({ x: slotToMinutes(s.slot), y });
    }
    typical.sort((a, b) => a.x - b.x);
    const freeFlow = selected ? active?.routes[selected]?.freeFlow : undefined;
    return { actual, typical, freeFlow };
  }, [snapshots, profile, selected, active]);

  const rows = useMemo(() => {
    if (!city) return [];
    return city.routes
      .map((r) => {
        const reading = active?.routes[r.id];
        const typical = typicalSlot?.routes[r.id];
        const nightReading = dayNight?.night?.routes[r.id];
        // Without a night sample yet, the free-flow time is the best stand-in for an empty road.
        const night = nightReading?.duration ?? reading?.freeFlow;
        return { route: r, reading, typical, night, delay: reading ? reading.duration - reading.freeFlow : -1 };
      })
      .sort((a, b) => b.delay - a.delay);
  }, [city, active, typicalSlot, dayNight]);

  const headlineSec = selected ? active?.routes[selected]?.duration : active?.meanDuration;
  const headlineRatio = selected
    ? active?.routes[selected]
      ? active.routes[selected].duration / active.routes[selected].freeFlow
      : 1
    : (active?.index ?? 1);
  const headlineLevel = levelFor(headlineRatio);
  const typicalSec = selected ? typicalSlot?.routes[selected]?.duration : typicalSlot?.n ? typicalSlot.meanDuration : undefined;
  const vsTypical = headlineSec && typicalSec ? headlineSec - typicalSec : null;

  const nightSec = selected
    ? (dayNight?.night?.routes[selected]?.duration ?? active?.routes[selected]?.freeFlow)
    : (dayNight?.night?.meanDuration ??
      (active ? Math.round(Object.values(active.routes).reduce((a, r) => a + r.freeFlow * r.freeFlow, 0) / Math.max(1, Object.values(active.routes).reduce((a, r) => a + r.freeFlow, 0))) : undefined));
  const nightLabel = dayNight?.night ? `noc ${dayNight.night.slot}` : "pusta droga";

  return (
    <div className="app">
      {city && (
        <MapView
          center={city.city.center}
          centerName={city.city.centerName}
          zoom={city.city.zoom}
          routes={city.routes}
          readings={active?.routes}
          focused={focused}
          dark={dark}
          onHover={setHovered}
          onSelect={(id) => {
            setSelected((cur) => (cur === id ? null : id));
            setSheetOpen(true);
          }}
          mode={tab}
          home={points.home}
          work={points.work}
          picking={tab === "commute" ? picking : null}
          onPoint={setPoint}
          commute={tab === "commute" && commute ? commute.geometry : null}
        />
      )}

      {tab === "commute" && picking && (
        <div className="pick-hint" role="status">
          Kliknij na mapie, gdzie jest {picking === "home" ? "Twój dom" : "Twoja praca"}
          <button onClick={() => setPicking(null)} aria-label="Anuluj">
            ×
          </button>
        </div>
      )}

      <aside className={`panel ${sheetOpen ? "open" : ""}`} aria-label="Statystyki dojazdu">
        <button className="grabber" onClick={() => setSheetOpen((o) => !o)} aria-label={sheetOpen ? "Zwiń panel" : "Rozwiń panel"}>
          <span />
        </button>

        <header className="brand">
          <div>
            <h1>Traffic Watch</h1>
            <p>Dojazd do centrum Warszawy · {city?.city.centerName ?? "Rondo Dmowskiego"}</p>
          </div>
          {active && tab === "city" && (
            <span className={`live ${isLive ? "on" : ""}`}>
              <i />
              {isLive ? `na żywo · ${fmtUpdated(active.t, TZ)}` : fmtUpdated(active.t, TZ)}
            </span>
          )}
        </header>

        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "city"} className={tab === "city" ? "active" : ""} onClick={() => setTab("city")}>
            Miasto
          </button>
          <button
            role="tab"
            aria-selected={tab === "commute"}
            className={tab === "commute" ? "active" : ""}
            onClick={() => {
              setTab("commute");
              setSelected(null);
              if (!points.home) setPicking("home");
              else if (!points.work) setPicking("work");
              setSheetOpen(true);
            }}
          >
            Mój dojazd
          </button>
        </div>

        {tab === "commute" ? (
          <CommutePanel
            home={points.home}
            work={points.work}
            picking={picking}
            onPick={setPicking}
            onClear={clearPoints}
            dow={commuteDow}
            onDow={setCommuteDow}
            data={commute}
            loading={commuteLoading}
            error={commuteError}
          />
        ) : (
          <>
            {error && !city && <div className="notice error">Nie udało się pobrać danych. Spróbuj odświeżyć stronę.</div>}

            <div className="segmented" role="radiogroup" aria-label="Widok">
              <button role="radio" aria-checked={mode === "live"} className={mode === "live" ? "active" : ""} onClick={() => setMode("live")}>
                {isToday ? "Teraz" : "Wybrana godzina"}
              </button>
              <button
                role="radio"
                aria-checked={mode === "daynight"}
                className={mode === "daynight" ? "active" : ""}
                onClick={() => setMode("daynight")}
              >
                Dzień vs noc
              </button>
            </div>

            <section className="headline" style={{ "--level": headlineLevel.color } as CSSProperties}>
              <div className="headline-label">
                {selectedRoute ? (
                  <>
                    <button className="chip-back" onClick={() => setSelected(null)} aria-label="Wróć do całego miasta">
                      ←
                    </button>
                    {selectedRoute.from} · {selectedRoute.name}
                  </>
                ) : mode === "daynight" ? (
                  "Średni dojazd w szczycie dnia"
                ) : (
                  "Średni czas dojazdu"
                )}
              </div>
              {headlineSec ? (
                <>
                  <div className="headline-value">
                    <strong>{minutes(headlineSec)}</strong>
                    <span>min</span>
                    <em className="badge">{headlineLevel.label}</em>
                  </div>
                  {mode === "daynight" ? (
                    <div className="dn-compare">
                      <div>
                        <small>Dzień · szczyt {active?.slot}</small>
                        <i style={{ width: "100%", background: headlineLevel.color }} />
                        <b>{minutes(headlineSec)} min</b>
                      </div>
                      <div>
                        <small>Noc · {nightLabel}</small>
                        <i style={{ width: `${nightSec ? Math.min(100, (nightSec / headlineSec) * 100) : 0}%`, background: "#1fa463" }} />
                        <b>{nightSec ? `${minutes(nightSec)} min` : "b.d."}</b>
                      </div>
                      {nightSec ? (
                        <p className="muted small">
                          W szczycie jedzie się {Math.max(0, minutes(headlineSec - nightSec))} min dłużej niż w nocy (
                          {fmtPercent(headlineSec / nightSec)}).
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="headline-meta">
                      <span>{fmtPercent(headlineRatio)} vs. pusta droga</span>
                      {vsTypical !== null && Math.abs(vsTypical) >= 60 ? (
                        <span>
                          {vsTypical > 0 ? `${minutes(vsTypical)} min dłużej` : `${minutes(-vsTypical)} min krócej`} niż zwykle
                        </span>
                      ) : vsTypical !== null ? (
                        <span>tak jak zwykle</span>
                      ) : null}
                    </div>
                  )}
                </>
              ) : (
                <div className="headline-empty">{day ? "Brak pomiarów dla tego dnia." : "Ładowanie…"}</div>
              )}
            </section>

            <nav className="days" aria-label="Dzień">
              {days.map((d) => (
                <button key={d.date} className={d.date === date ? "active" : ""} onClick={() => setDate(d.date)}>
                  <b>{d.label}</b>
                  <small>{d.sub}</small>
                </button>
              ))}
            </nav>

            {mode === "live" && (
              <section className="card">
                <div className="card-head">
                  <h2>{selectedRoute ? `Przebieg dnia: ${selectedRoute.from}` : "Przebieg dnia"}</h2>
                  {cursorT && isToday && (
                    <button className="link" onClick={() => setCursorT(null)}>
                      Na żywo
                    </button>
                  )}
                </div>
                <Timeline
                  actual={series.actual}
                  typical={series.typical}
                  freeFlow={series.freeFlow}
                  cursorT={active?.t ?? null}
                  onScrub={setCursorT}
                  typicalLabel={`zwykle (${weekdayLong(dow)})`}
                />
                <p className="hint">Przeciągnij po wykresie, aby zobaczyć ruch o danej godzinie.</p>
              </section>
            )}

            <section className="card routes">
              <div className="card-head">
                <h2>Wloty do miasta</h2>
                <span className="muted">{mode === "daynight" ? `dzień ${active?.slot ?? ""} / ${nightLabel}` : `${rows.filter((r) => r.reading).length} tras`}</span>
              </div>
              <ul>
                {rows.map(({ route, reading, typical, night }) => {
                  const ratio = reading ? reading.duration / reading.freeFlow : 1;
                  const lv = levelFor(ratio);
                  const fill = reading ? Math.min(100, ((ratio - 1) / 1.2) * 100) : 0;
                  return (
                    <li key={route.id}>
                      <button
                        className={`route ${selected === route.id ? "selected" : ""} ${focused === route.id ? "focused" : ""}`}
                        onMouseEnter={() => setHovered(route.id)}
                        onMouseLeave={() => setHovered(null)}
                        onFocus={() => setHovered(route.id)}
                        onBlur={() => setHovered(null)}
                        onClick={() => setSelected((cur) => (cur === route.id ? null : route.id))}
                        aria-pressed={selected === route.id}
                      >
                        <span className="dot" style={{ background: reading ? lv.color : "var(--muted)" }} />
                        <span className="route-name">
                          <b>{route.from}</b>
                          <small>
                            {route.name} · {route.road}
                          </small>
                        </span>
                        <span className="route-bar" aria-hidden>
                          <i style={{ width: `${Math.max(4, fill)}%`, background: lv.color }} />
                        </span>
                        <span className="route-time">
                          <b>{reading ? fmtMinutes(reading.duration) : "b.d."}</b>
                          <small>
                            {!reading
                              ? "brak danych"
                              : mode === "daynight"
                                ? `noc ${night ? `${minutes(night)} min` : "b.d."}`
                                : `${fmtDelay(reading.duration - reading.freeFlow)}${typical ? ` · zwykle ${minutes(typical.duration)}` : ""}`}
                          </small>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}

        <footer className="foot">
          Pomiar co 15 min (w nocy co godzinę) z 12 wlotów do Ronda Dmowskiego. Czasy przejazdu i prognozy: Amazon Location
          Service (HERE). Mapa: OpenFreeMap, © OpenStreetMap.
          <br />
          Autor:{" "}
          <a href="https://piotrzientara.pl/" target="_blank" rel="noopener">
            Piotr Zientara
          </a>{" "}
          ·{" "}
          <a href="https://github.com/Tuhaj/traffic-watch-2026" target="_blank" rel="noopener">
            kod na GitHubie
          </a>
        </footer>
      </aside>
    </div>
  );
}
