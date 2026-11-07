import type { JSX } from "react";
import type { CommuteLeg, CommuteOption, CommuteResponse, LngLat, TravelMode } from "../../../shared/types";
import { minutes, weekdayLong, weekdayShort } from "../format";
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

const km = (m: number) => `${(m / 1000).toFixed(1).replace(".", ",")} km`;

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
const MODE_LABEL: Record<TravelMode, string> = { car: "Samochód", transit: "Komunikacja", bike: "Rower" };

function Legs({ legs }: { legs: CommuteLeg[] }) {
  const shown = legs.filter((l) => !(l.kind === "walk" && l.duration < 60));
  return (
    <ol className="legs">
      {shown.map((l, i) =>
        l.kind === "transit" ? (
          <li key={i} className="leg transit">
            <span className="line-badge" style={{ background: l.color ?? "var(--accent)", color: l.textColor ?? "#fff" }}>
              {l.line ?? l.vehicle}
            </span>
            <div>
              <b>
                {l.vehicle} {l.line}
                {l.headsign ? ` → ${l.headsign}` : ""}
              </b>
              <small>
                {l.departs} {l.from} · {l.arrives} {l.to} · {minutes(l.duration)} min
              </small>
            </div>
          </li>
        ) : (
          <li key={i} className={`leg ${l.kind}`}>
            <span className="leg-dot" />
            <div>
              <b>{l.kind === "walk" ? "Pieszo" : l.kind === "bike" ? "Rowerem" : "Samochodem"}</b>
              <small>
                {minutes(l.duration)} min · {km(l.distance)}
              </small>
            </div>
          </li>
        ),
      )}
    </ol>
  );
}

function Timed({ data, p }: { data: CommuteResponse; p: Props }) {
  const options = data[p.direction];
  const night = data.night[p.direction];
  const best = bestOf(options);
  const worst = worstOf(options);
  if (!best || !worst) return null;
  const selected = options.find((o) => o.depart === p.selectedDepart) ?? best;
  const saved = worst.duration - best.duration;
  const verb = data.mode === "transit" ? "wyjść" : "wyjechać";
  return (
    <section className={`card direction ${p.direction}`}>
      <div className="best-time">
        <span className="best-label">Najlepiej {verb} o</span>
        <strong>{best.depart}</strong>
        <span className="best-dur">{minutes(best.duration)} min</span>
      </div>
      <p className="muted small">
        {saved >= 120
          ? `Najgorzej o ${worst.depart} (${minutes(worst.duration)} min). Oszczędzasz ${minutes(saved)} min.`
          : "Pora wyjazdu nie robi tu dużej różnicy."}
      </p>
      <DepartureBars
        options={options}
        baseline={Math.min(night.duration, best.duration)}
        label="Czas podróży wg godziny wyjazdu"
        selected={selected.depart}
        best={best.depart}
        onSelect={p.onSelectDepart}
      />
      <p className="hint">Kliknij słupek, żeby zobaczyć szczegóły i trasę na mapie.</p>
      <div className="selected-trip" aria-live="polite">
        <div className="trip-head">
          <div>
            <small>{data.mode === "transit" ? "Wyjście" : "Wyjazd"}</small>
            <b>{selected.depart}</b>
          </div>
          <span className="trip-arrow" aria-hidden>
            →
          </span>
          <div>
            <small>Na miejscu</small>
            <b>{selected.arrive}</b>
          </div>
          <div className="trip-total">
            <b>{minutes(selected.duration)} min</b>
            <small>{km(selected.distance)}</small>
          </div>
        </div>
        {data.mode === "transit" && <Legs legs={selected.legs} />}
      </div>
      <div className="daynight">
        <div>
          <small>Dzień (szczyt {worst.depart})</small>
          <b>{minutes(worst.duration)} min</b>
        </div>
        <div>
          <small>Noc ({night.depart})</small>
          <b>{minutes(night.duration)} min</b>
        </div>
        <div>
          <small>Różnica</small>
          <b>
            {worst.duration >= night.duration
              ? `+${minutes(worst.duration - night.duration)} min`
              : `w nocy +${minutes(night.duration - worst.duration)} min`}
          </b>
        </div>
      </div>
    </section>
  );
}

function Bike({ data, p }: { data: CommuteResponse; p: Props }) {
  const o = data[p.direction][0];
  if (!o) return null;
  return (
    <section className={`card direction ${p.direction}`}>
      <div className="best-time">
        <span className="best-label">Rowerem</span>
        <strong>{minutes(o.duration)} min</strong>
        <span className="best-dur">{km(o.distance)}</span>
      </div>
      <p className="muted small">
        Czas nie zależy od pory dnia ani od korków. Liczony dla spokojnej jazdy miejskiej (ok. 18 km/h) z preferencją dróg
        rowerowych.
      </p>
    </section>
  );
}

export function CommutePanel(p: Props) {
  const ready = p.home && p.work;
  const data = p.data && p.data.mode === p.mode ? p.data : null;
  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Twoje punkty</h2>
          {(p.home || p.work) && (
            <button className="link" onClick={p.onClear}>
              Wyczyść
            </button>
          )}
        </div>
        <div className="addresses">
          {(["home", "work"] as const).map((kind) => (
            <AddressInput
              key={kind}
              kind={kind}
              label={kind === "home" ? "Dom" : "Praca"}
              value={p[kind]?.label ?? null}
              picking={p.picking === kind}
              onPickOnMap={() => p.onPick(p.picking === kind ? null : kind)}
              onSelect={(pos, label) => p.onSelect(kind, pos, label)}
            />
          ))}
        </div>
        <p className="muted small">
          Wpisz adres albo wskaż punkt na mapie (pinezki można przeciągać). Do obliczeń zaokrąglamy je do ok. 100 m i nie
          zapisujemy ich jawnie. Zostają tylko w Twojej przeglądarce.
        </p>
      </section>

      <div className="modes" role="radiogroup" aria-label="Środek transportu">
        {(["car", "transit", "bike"] as const).map((m) => (
          <button key={m} role="radio" aria-checked={p.mode === m} className={p.mode === m ? "active" : ""} onClick={() => p.onMode(m)}>
            {ICONS[m]}
            <span>{MODE_LABEL[m]}</span>
          </button>
        ))}
      </div>

      <div className="tabs direction-tabs" role="tablist" aria-label="Kierunek">
        {(
          [
            ["toWork", "Do pracy", "rano"],
            ["toHome", "Powrót", "po południu"],
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
                {best ? `najlepiej ${best.depart}` : p.mode === "bike" ? (d === "toWork" ? "dom → praca" : "praca → dom") : sub}
              </small>
            </button>
          );
        })}
      </div>

      {p.mode !== "bike" && (
        <nav className="days dows" aria-label="Dzień tygodnia">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <button key={d} className={d === p.dow ? "active" : ""} onClick={() => p.onDow(d)} title={weekdayLong(d)}>
              <b>{weekdayShort(d)}</b>
            </button>
          ))}
        </nav>
      )}

      {!ready && (
        <div className="empty">
          <b>Wpisz dom i pracę</b>
          <p>Policzymy podróż dla każdej godziny wyjazdu i wskażemy, kiedy jechać do pracy i kiedy wracać.</p>
        </div>
      )}
      {ready && p.loading && (
        <div className="empty">{p.mode === "bike" ? "Wyznaczam trasę rowerową…" : "Liczę podróż dla 26 godzin wyjazdu…"}</div>
      )}
      {ready && p.error && !p.loading && <div className="notice error">{p.error}</div>}
      {ready && data && !p.loading && (
        <>
          {!data.timeIndependent && (
            <p className="muted small forecast-note">
              {data.mode === "transit"
                ? `Rozkład jazdy na ${weekdayLong(data.dow)}, ${data.date.slice(8, 10)}.${data.date.slice(5, 7)}, z dojściem i czekaniem na przystanku.`
                : `Prognoza na ${weekdayLong(data.dow)}, ${data.date.slice(8, 10)}.${data.date.slice(5, 7)} na podstawie historycznych wzorców ruchu.`}
            </p>
          )}
          {data.timeIndependent ? <Bike data={data} p={p} /> : <Timed data={data} p={p} />}
        </>
      )}
    </>
  );
}
