import type { JSX } from "react";
import type { CommuteLeg, CommuteOption, CommuteResponse, LngLat, TravelMode } from "../../../shared/types";
import { minutes } from "../format";
import { type I18n, useI18n } from "../i18n";
import { AddressInput } from "./AddressInput";
import { DepartureBars } from "./DepartureBars";

export type PointKind = "home" | "work";
export type Direction = "toWork" | "toHome";

export interface SavedPoint {
  pos: LngLat;
  label: string;
}

interface Props {
  home: SavedPoint | null;
  work: SavedPoint | null;
  picking: PointKind | null;
  onPick: (kind: PointKind | null) => void;
  onSelect: (kind: PointKind, pos: LngLat, label: string) => void;
  onClear: () => void;
  mode: TravelMode;
  onMode: (mode: TravelMode) => void;
  dow: number;
  onDow: (dow: number) => void;
  direction: Direction;
  onDirection: (d: Direction) => void;
  selectedDepart: string | null;
  onSelectDepart: (depart: string) => void;
  data: CommuteResponse | null;
  loading: boolean;
  error: string | null;
}

export function bestOf(options: CommuteOption[]) {
  return options.reduce<CommuteOption | undefined>((b, o) => (!b || o.duration < b.duration ? o : b), undefined);
}
function worstOf(options: CommuteOption[]) {
  return options.reduce<CommuteOption | undefined>((b, o) => (!b || o.duration > b.duration ? o : b), undefined);
}


const ICONS: Record<TravelMode, JSX.Element> = {
  car: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11m-14 0h14a1 1 0 0 1 1 1v4h-2.5M5 11a1 1 0 0 0-1 1v4h2.5m11 0a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0m0 0h-5m0 0a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  transit: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <rect x="5" y="3.5" width="14" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 11h14M9 21l1.5-3.5M15 21l-1.5-3.5M8.5 14.5h.01M15.5 14.5h.01" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  bike: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <circle cx="6" cy="16" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="18" cy="16" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6 16l3.5-7h6L18 16M9.5 9L12 16h2.5l1-7M8 6h3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

function Legs({ legs }: { legs: CommuteLeg[] }) {
  const { t, tx, fmt } = useI18n();
  const shown = legs.filter((l) => !(l.kind === "walk" && l.duration < 60));
  return (
    <ol className="legs">
      {shown.map((l, i) =>
        l.kind === "transit" ? (
          <li key={i} className="leg transit">
            <span className="line-badge" style={{ background: l.color ?? "var(--accent)", color: l.textColor ?? "#fff" }}>
              {l.line ?? tx(`vehicle.${l.vehicle}`, "vehicle.other")}
            </span>
            <div>
              <b>
                {tx(`vehicle.${l.vehicle}`, "vehicle.other")} {l.line}
                {l.headsign ? ` → ${l.headsign}` : ""}
              </b>
              <small>
                {l.departs} {l.from} · {l.arrives} {l.to} · {t("common.minutes", { n: minutes(l.duration) })}
              </small>
            </div>
          </li>
        ) : (
          <li key={i} className={`leg ${l.kind}`}>
            <span className="leg-dot" />
            <div>
              <b>{t(`commute.leg.${l.kind}`)}</b>
              <small>
                {t("common.minutes", { n: minutes(l.duration) })} · {fmt.km(l.distance)}
              </small>
            </div>
          </li>
        ),
      )}
    </ol>
  );
}

function Timed({ data, p }: { data: CommuteResponse; p: Props }) {
  const { t, fmt } = useI18n();
  const min = (sec: number) => t("common.minutes", { n: minutes(sec) });
  const options = data[p.direction];
  const night = data.night[p.direction];
  const best = bestOf(options);
  const worst = worstOf(options);
  if (!best || !worst) return null;
  const selected = options.find((o) => o.depart === p.selectedDepart) ?? best;
  const saved = worst.duration - best.duration;
  return (
    <section className={`card direction ${p.direction}`}>
      <div className="best-time">
        <span className="best-label">{t(data.mode === "transit" ? "commute.bestWalkOut" : "commute.bestDrive")}</span>
        <strong>{best.depart}</strong>
        <span className="best-dur">{min(best.duration)}</span>
      </div>
      <p className="muted small">
        {saved >= 120
          ? t("commute.worst", { time: worst.depart, min: minutes(worst.duration), saved: minutes(saved) })
          : t("commute.noDifference")}
      </p>
      <DepartureBars
        options={options}
        baseline={Math.min(night.duration, best.duration)}
        label={t("commute.barsLabel")}
        selected={selected.depart}
        best={best.depart}
        onSelect={p.onSelectDepart}
      />
      <p className="hint">{t("commute.barsHint")}</p>
      <div className="selected-trip" aria-live="polite">
        <div className="trip-head">
          <div>
            <small>{t(data.mode === "transit" ? "commute.walkOut" : "commute.departure")}</small>
            <b>{selected.depart}</b>
          </div>
          <span className="trip-arrow" aria-hidden>
            →
          </span>
          <div>
            <small>{t("commute.arrival")}</small>
            <b>{selected.arrive}</b>
          </div>
          <div className="trip-total">
            <b>{min(selected.duration)}</b>
            <small>{fmt.km(selected.distance)}</small>
          </div>
        </div>
        {data.mode === "transit" && <Legs legs={selected.legs} />}
      </div>
      <div className="daynight">
        <div>
          <small>{t("commute.dayPeak", { time: worst.depart })}</small>
          <b>{min(worst.duration)}</b>
        </div>
        <div>
          <small>{t("commute.night", { time: night.depart })}</small>
          <b>{min(night.duration)}</b>
        </div>
        <div>
          <small>{t("commute.difference")}</small>
          <b>
            {worst.duration >= night.duration
              ? t("delay.plus", { min: minutes(worst.duration - night.duration) })
              : t("commute.nightLonger", { min: minutes(night.duration - worst.duration) })}
          </b>
        </div>
      </div>
    </section>
  );
}

function Bike({ data, p }: { data: CommuteResponse; p: Props }) {
  const { t, fmt } = useI18n();
  const o = data[p.direction][0];
  if (!o) return null;
  return (
    <section className={`card direction ${p.direction}`}>
      <div className="best-time">
        <span className="best-label">{t("commute.bikeTitle")}</span>
        <strong>{t("common.minutes", { n: minutes(o.duration) })}</strong>
        <span className="best-dur">{fmt.km(o.distance)}</span>
      </div>
      <p className="muted small">{t("commute.bikeNote")}</p>
    </section>
  );
}

function note(i18n: I18n, data: CommuteResponse) {
  const params = { weekday: i18n.fmt.weekdayLong(data.dow), date: i18n.fmt.dayMonth(data.date) };
  return i18n.t(data.mode === "transit" ? "commute.noteTransit" : "commute.noteCar", params);
}

export function CommutePanel(p: Props) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const ready = p.home && p.work;
  const data = p.data && p.data.mode === p.mode ? p.data : null;
  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>{t("commute.points")}</h2>
          {(p.home || p.work) && (
            <button className="link" onClick={p.onClear}>
              {t("commute.clear")}
            </button>
          )}
        </div>
        <div className="addresses">
          {(["home", "work"] as const).map((kind) => (
            <AddressInput
              key={kind}
              kind={kind}
              label={t(kind === "home" ? "commute.home" : "commute.work")}
              value={p[kind] ? p[kind]!.label || t("commute.mapPoint") : null}
              picking={p.picking === kind}
              onPickOnMap={() => p.onPick(p.picking === kind ? null : kind)}
              onSelect={(pos, label) => p.onSelect(kind, pos, label)}
            />
          ))}
        </div>
        <p className="muted small">{t("commute.pointsHelp")}</p>
      </section>

      <div className="modes" role="radiogroup" aria-label={t("commute.modes")}>
        {(["car", "transit", "bike"] as const).map((m) => (
          <button key={m} role="radio" aria-checked={p.mode === m} className={p.mode === m ? "active" : ""} onClick={() => p.onMode(m)}>
            {ICONS[m]}
            <span>{t(`commute.mode.${m}`)}</span>
          </button>
        ))}
      </div>

      <div className="tabs direction-tabs" role="tablist" aria-label={t("commute.direction")}>
        {(
          [
            ["toWork", t("commute.toWork"), t("commute.morning")],
            ["toHome", t("commute.toHome"), t("commute.afternoon")],
          ] as const
        ).map(([d, title, sub]) => {
          const best = data && !data.timeIndependent ? bestOf(data[d]) : undefined;
          return (
            <button
              key={d}
              role="tab"
              aria-selected={p.direction === d}
              className={p.direction === d ? "active" : ""}
              onClick={() => p.onDirection(d)}
            >
              <b>{title}</b>
              <small>
                {best
                  ? t("commute.bestAt", { time: best.depart })
                  : p.mode === "bike"
                    ? t(d === "toWork" ? "commute.homeToWork" : "commute.workToHome")
                    : sub}
              </small>
            </button>
          );
        })}
      </div>

      {p.mode !== "bike" && (
        <nav className="days dows" aria-label={t("commute.weekday")}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <button key={d} className={d === p.dow ? "active" : ""} onClick={() => p.onDow(d)} title={fmt.weekdayLong(d)}>
              <b>{fmt.weekdayShort(d)}</b>
            </button>
          ))}
        </nav>
      )}

      {!ready && (
        <div className="empty">
          <b>{t("commute.emptyTitle")}</b>
          <p>{t("commute.emptyText")}</p>
        </div>
      )}
      {ready && p.loading && (
        <div className="empty">{t(p.mode === "bike" ? "commute.loadingBike" : "commute.loadingTimed")}</div>
      )}
      {ready && p.error && !p.loading && <div className="notice error">{p.error}</div>}
      {ready && data && !p.loading && (
        <>
          {!data.timeIndependent && (
            <p className="muted small forecast-note">{note(i18n, data)}</p>
          )}
          {data.timeIndependent ? <Bike data={data} p={p} /> : <Timed data={data} p={p} />}
        </>
      )}
    </>
  );
}
