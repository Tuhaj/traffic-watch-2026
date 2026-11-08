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
  TravelMode,
} from "../../shared/types";
import { api } from "./api";
import { bestOf, CommutePanel, type Direction, type PointKind, type SavedPoint } from "./components/CommutePanel";
import { MapView } from "./components/MapView";
import { type SeriesPoint, Timeline } from "./components/Timeline";
import { fmtPercent, minutes, recentDays, slotToMinutes } from "./format";
import { errorText, useI18n } from "./i18n";
import { LangSwitch } from "./i18n/LangSwitch";
import { track } from "./track";

const CITY = "warszawa";
const TZ = "Europe/Warsaw";
const REFRESH_MS = 60_000;
const STORAGE_KEY = "tw.commute.v1";
const MODE_KEY = "tw.mode";
/** Bumped when the commute response format changes, so CloudFront never serves an old shape. */
const API_VERSION = 4;

function loadMode(): TravelMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === "car" || v === "transit" || v === "bike") return v;
  } catch {
    /* storage unavailable */
  }
  return "car";
}

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

type Points = { home: SavedPoint | null; work: SavedPoint | null };
/** Points picked on the map have no address; the UI shows a translated "point on the map" instead. */
const MAP_POINT_LABEL = "";
const LEGACY_MAP_POINT_LABEL = "Punkt na mapie";

/** Accepts the current {pos,label} shape and the earlier bare [lng,lat] one. */
function toSaved(v: unknown): SavedPoint | null {
  if (Array.isArray(v) && v.length === 2) return { pos: v as LngLat, label: MAP_POINT_LABEL };
  if (v && typeof v === "object" && Array.isArray((v as SavedPoint).pos)) {
    const s = v as SavedPoint;
    const label = typeof s.label === "string" && s.label !== LEGACY_MAP_POINT_LABEL ? s.label : MAP_POINT_LABEL;
    return { pos: s.pos, label };
  }
  return null;
}

function loadPoints(): Points {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as { home?: unknown; work?: unknown };
      return { home: toSaved(v.home), work: toSaved(v.work) };
    }
  } catch {
    /* storage unavailable */
  }
  return { home: null, work: null };
}

function savePoints(v: Points) {
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
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const dark = useDarkMode();

  // One pageview per load, after the language has been applied to <html lang>.
  useEffect(() => {
    track("pageview", undefined, i18n.lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  const [travelMode, setTravelMode] = useState<TravelMode>(loadMode);
  const [direction, setDirection] = useState<Direction>("toWork");
  const [selectedDepart, setSelectedDepart] = useState<string | null>(null);
  const changeMode = (m: TravelMode) => {
    setTravelMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* storage unavailable */
    }
  };
  const [commute, setCommute] = useState<CommuteResponse | null>(null);
  const [commuteLoading, setCommuteLoading] = useState(false);
  const [commuteError, setCommuteError] = useState<{ body: unknown; status: number } | null>(null);

  const setPoint = useCallback(
    (kind: PointKind, p: LngLat, label = MAP_POINT_LABEL) => {
      const next = { ...points, [kind]: { pos: roundLngLat(p), label } };
      setPoints(next);
      savePoints(next);
      // After placing one point, go straight to the other if it is still missing.
      setPicking(kind === "home" && !next.work ? "work" : kind === "work" && !next.home ? "home" : null);
    },
    [points],
  );

  const clearPoints = () => {
    const empty: Points = { home: null, work: null };
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
        `/api/commute?v=${API_VERSION}&city=${CITY}&mode=${travelMode}&home=${formatLngLat(points.home!.pos)}&work=${formatLngLat(points.work!.pos)}&dow=${travelMode === "bike" ? 1 : commuteDow}`,
        { signal: ctrl.signal },
      )
        .then(async (res) => {
          const body = await res.json().catch(() => null);
          if (!res.ok) throw { body, status: res.status };
          setCommute(body as CommuteResponse);
          setSelectedDepart(null);
          track("commute", travelMode);
        })
        .catch((e: { body?: unknown; status?: number }) => {
          if (ctrl.signal.aborted) return;
          setCommute(null);
          setCommuteError({ body: e?.body ?? null, status: e?.status ?? 0 });
        })
        .finally(() => !ctrl.signal.aborted && setCommuteLoading(false));
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [points.home?.pos[0], points.home?.pos[1], points.work?.pos[0], points.work?.pos[1], commuteDow, travelMode]);

  // The trip drawn on the map: the selected departure, or the fastest one.
  const commuteLegs = useMemo(() => {
    if (!commute || commute.mode !== travelMode) return null;
    const options = commute[direction];
    const opt = options.find((o) => o.depart === selectedDepart) ?? bestOf(options);
    return opt?.legs ?? null;
  }, [commute, travelMode, direction, selectedDepart]);

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
  const nightLabel = dayNight?.night ? t("city.nightAt", { slot: dayNight.night.slot }) : t("city.emptyRoad");
  const min = (sec: number) => t("common.minutes", { n: minutes(sec) });
  const dayLabel = (d: (typeof days)[number]) =>
    d.offset === 0 ? t("days.today") : d.offset === 1 ? t("days.yesterday") : fmt.weekdayShort(d.dow);

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
          home={points.home?.pos ?? null}
          work={points.work?.pos ?? null}
          picking={tab === "commute" ? picking : null}
          onPoint={setPoint}
          commute={tab === "commute" ? commuteLegs : null}
          commuteColor={direction === "toWork" ? "#2f6fed" : "#8b5cf6"}
        />
      )}

      {tab === "commute" && picking && (
        <div className="pick-hint" role="status">
          {t(picking === "home" ? "pick.home" : "pick.work")}
          <button onClick={() => setPicking(null)} aria-label={t("common.cancel")}>
            ×
          </button>
        </div>
      )}

      <aside className={`panel ${sheetOpen ? "open" : ""}`} aria-label={t("panel.label")}>
        <button className="grabber" onClick={() => setSheetOpen((o) => !o)} aria-label={t(sheetOpen ? "panel.collapse" : "panel.expand")}>
          <span />
        </button>

        <header className="brand">
          <div>
            <h1>{t("app.title")}</h1>
            <p>{t("app.subtitle", { center: city?.city.centerName ?? "Rondo Dmowskiego" })}</p>
          </div>
          <div className="brand-side">
            <LangSwitch />
            {active && tab === "city" && (
              <span className={`live ${isLive ? "on" : ""}`}>
                <i />
                {isLive ? t("live.now", { time: fmt.time(active.t, TZ) }) : fmt.time(active.t, TZ)}
              </span>
            )}
          </div>
        </header>

        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "city"} className={tab === "city" ? "active" : ""} onClick={() => setTab("city")}>
            {t("tabs.city")}
          </button>
          <button
            role="tab"
            aria-selected={tab === "commute"}
            className={tab === "commute" ? "active" : ""}
            onClick={() => {
              setTab("commute");
              track("tab", "commute");
              setSelected(null);
              if (!points.home) setPicking("home");
              else if (!points.work) setPicking("work");
              setSheetOpen(true);
            }}
          >
            {t("tabs.commute")}
          </button>
        </div>

        {tab === "commute" ? (
          <CommutePanel
            home={points.home}
            work={points.work}
            picking={picking}
            onPick={setPicking}
            onSelect={setPoint}
            onClear={clearPoints}
            dow={commuteDow}
            onDow={setCommuteDow}
            mode={travelMode}
            onMode={changeMode}
            direction={direction}
            onDirection={(d) => {
              setDirection(d);
              setSelectedDepart(null);
            }}
            selectedDepart={selectedDepart}
            onSelectDepart={setSelectedDepart}
            data={commute}
            loading={commuteLoading}
            error={commuteError ? errorText(i18n, commuteError.body, commuteError.status) : null}
          />
        ) : (
          <>
            {error && !city && <div className="notice error">{t("city.loadError")}</div>}

            <div className="segmented" role="radiogroup" aria-label={t("city.view")}>
              <button role="radio" aria-checked={mode === "live"} className={mode === "live" ? "active" : ""} onClick={() => setMode("live")}>
                {t(isToday ? "city.now" : "city.selectedTime")}
              </button>
              <button
                role="radio"
                aria-checked={mode === "daynight"}
                className={mode === "daynight" ? "active" : ""}
                onClick={() => setMode("daynight")}
              >
                {t("city.dayVsNight")}
              </button>
            </div>

            <section className="headline" style={{ "--level": headlineLevel.color } as CSSProperties}>
              <div className="headline-label">
                {selectedRoute ? (
                  <>
                    <button className="chip-back" onClick={() => setSelected(null)} aria-label={t("city.back")}>
                      ←
                    </button>
                    {selectedRoute.from} · {selectedRoute.name}
                  </>
                ) : (
                  t(mode === "daynight" ? "city.avgPeak" : "city.avg")
                )}
              </div>
              {headlineSec ? (
                <>
                  <div className="headline-value">
                    <strong>{minutes(headlineSec)}</strong>
                    <span>{t("common.minUnit")}</span>
                    <em className="badge">{t(`levels.${headlineLevel.key}`)}</em>
                  </div>
                  {mode === "daynight" ? (
                    <div className="dn-compare">
                      <div>
                        <small>{t("city.dayPeak", { slot: active?.slot ?? "" })}</small>
                        <i style={{ width: "100%", background: headlineLevel.color }} />
                        <b>{min(headlineSec)}</b>
                      </div>
                      <div>
                        <small>{t("city.nightLabel", { label: nightLabel })}</small>
                        <i style={{ width: `${nightSec ? Math.min(100, (nightSec / headlineSec) * 100) : 0}%`, background: "#1fa463" }} />
                        <b>{nightSec ? min(nightSec) : t("common.na")}</b>
                      </div>
                      {nightSec ? (
                        <p className="muted small">
                          {t("city.peakVsNight", {
                            min: Math.max(0, minutes(headlineSec - nightSec)),
                            pct: fmtPercent(headlineSec / nightSec),
                          })}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="headline-meta">
                      <span>{t("city.vsEmpty", { pct: fmtPercent(headlineRatio) })}</span>
                      {vsTypical !== null && Math.abs(vsTypical) >= 60 ? (
                        <span>
                          {vsTypical > 0
                            ? t("city.longer", { min: minutes(vsTypical) })
                            : t("city.shorter", { min: minutes(-vsTypical) })}
                        </span>
                      ) : vsTypical !== null ? (
                        <span>{t("city.asUsual")}</span>
                      ) : null}
                    </div>
                  )}
                </>
              ) : (
                <div className="headline-empty">{t(day ? "city.noData" : "common.loading")}</div>
              )}
            </section>

            <nav className="days" aria-label={t("days.label")}>
              {days.map((d) => (
                <button key={d.date} className={d.date === date ? "active" : ""} onClick={() => setDate(d.date)}>
                  <b>{dayLabel(d)}</b>
                  <small>{fmt.dayMonth(d.date)}</small>
                </button>
              ))}
            </nav>

            {mode === "live" && (
              <section className="card">
                <div className="card-head">
                  <h2>{selectedRoute ? t("city.timelineRoute", { from: selectedRoute.from }) : t("city.timeline")}</h2>
                  {cursorT && isToday && (
                    <button className="link" onClick={() => setCursorT(null)}>
                      {t("city.live")}
                    </button>
                  )}
                </div>
                <Timeline
                  actual={series.actual}
                  typical={series.typical}
                  freeFlow={series.freeFlow}
                  cursorT={active?.t ?? null}
                  onScrub={setCursorT}
                  typicalLabel={t("city.typical", { weekday: fmt.weekdayLong(dow) })}
                />
                <p className="hint">{t("city.scrubHint")}</p>
              </section>
            )}

            <section className="card routes">
              <div className="card-head">
                <h2>{t("city.entries")}</h2>
                <span className="muted">{mode === "daynight"
                    ? t("city.dayNightHeader", { slot: active?.slot ?? "", night: nightLabel })
                    : t("city.routes", { n: rows.filter((r) => r.reading).length })}</span>
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
                          <b>{reading ? min(reading.duration) : t("common.na")}</b>
                          <small>
                            {!reading
                              ? t("city.noReadings")
                              : mode === "daynight"
                                ? t("city.nightValue", { value: night ? min(night) : t("common.na") })
                                : [
                                    minutes(reading.duration - reading.freeFlow) <= 0
                                      ? t("delay.none")
                                      : t("delay.plus", { min: minutes(reading.duration - reading.freeFlow) }),
                                    typical ? t("city.usually", { min: minutes(typical.duration) }) : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
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
          {t("footer.about")}
          <br />
          <a href={i18n.lang === "pl" ? "/faq/" : `/faq/${i18n.lang}/`}>{t("footer.faq")}</a> ·{" "}
          {t("footer.author")}{" "}
          <a href="https://piotrzientara.pl/" target="_blank" rel="noopener">
            Piotr Zientara
          </a>{" "}
          ·{" "}
          <a href="https://github.com/Tuhaj/traffic-watch-2026" target="_blank" rel="noopener">
            {t("footer.code")}
          </a>
        </footer>
      </aside>
    </div>
  );
}
