import type { CommuteOption, CommuteResponse, LngLat } from "../../../shared/types";
import { minutes, weekdayLong, weekdayShort } from "../format";
import { DepartureBars } from "./DepartureBars";

export type PointKind = "home" | "work";

interface Props {
  home: LngLat | null;
  work: LngLat | null;
  picking: PointKind | null;
  onPick: (kind: PointKind | null) => void;
  onClear: () => void;
  dow: number;
  onDow: (dow: number) => void;
  data: CommuteResponse | null;
  loading: boolean;
  error: string | null;
}

function best(options: CommuteOption[]) {
  return options.reduce<CommuteOption | undefined>((b, o) => (!b || o.duration < b.duration ? o : b), undefined);
}
function worst(options: CommuteOption[]) {
  return options.reduce<CommuteOption | undefined>((b, o) => (!b || o.duration > b.duration ? o : b), undefined);
}

function Direction({ title, options, night, kind }: { title: string; options: CommuteOption[]; night: CommuteOption; kind: PointKind }) {
  const b = best(options);
  const w = worst(options);
  if (!b || !w) return null;
  const saved = w.duration - b.duration;
  return (
    <section className={`card direction ${kind}`}>
      <div className="card-head">
        <h2>{title}</h2>
        <span className="muted">{(b.distance / 1000).toFixed(1)} km</span>
      </div>
      <div className="best-time">
        <span className="best-label">Najlepiej wyjechać o</span>
        <strong>{b.depart}</strong>
        <span className="best-dur">{minutes(b.duration)} min</span>
      </div>
      <p className="muted small">
        {saved >= 120
          ? `Najgorzej o ${w.depart} (${minutes(w.duration)} min). Oszczędzasz ${minutes(saved)} min.`
          : "Pora wyjazdu nie robi tu dużej różnicy."}
      </p>
      <DepartureBars options={options} baseline={night.duration} label={`${title}: czas przejazdu wg godziny wyjazdu`} />
      <div className="daynight">
        <div>
          <small>Dzień (szczyt {w.depart})</small>
          <b>{minutes(w.duration)} min</b>
        </div>
        <div>
          <small>Noc ({night.depart})</small>
          <b>{minutes(night.duration)} min</b>
        </div>
        <div>
          <small>Różnica</small>
          <b>{w.duration > night.duration ? `+${minutes(w.duration - night.duration)} min` : "brak"}</b>
        </div>
      </div>
    </section>
  );
}

export function CommutePanel(p: Props) {
  const ready = p.home && p.work;
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
        <div className="points">
          {(["home", "work"] as const).map((kind) => {
            const set = kind === "home" ? p.home : p.work;
            const active = p.picking === kind;
            return (
              <button
                key={kind}
                className={`point-btn ${kind} ${active ? "active" : ""} ${set ? "set" : ""}`}
                onClick={() => p.onPick(active ? null : kind)}
                aria-pressed={active}
              >
                <span className="pin">{kind === "home" ? "D" : "P"}</span>
                <span>
                  <b>{kind === "home" ? "Dom" : "Praca"}</b>
                  <small>{active ? "Kliknij na mapie…" : set ? "Ustawiono · zmień" : "Zaznacz na mapie"}</small>
                </span>
              </button>
            );
          })}
        </div>
        <p className="muted small">
          Punkty możesz też przeciągać. Zaokrąglamy je do ok. 100 m i nie zapisujemy ich jawnie. Zostają tylko w Twojej
          przeglądarce.
        </p>
      </section>

      <nav className="days dows" aria-label="Dzień tygodnia">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <button key={d} className={d === p.dow ? "active" : ""} onClick={() => p.onDow(d)} title={weekdayLong(d)}>
            <b>{weekdayShort(d)}</b>
          </button>
        ))}
      </nav>

      {!ready && (
        <div className="empty">
          <b>Zaznacz dom i pracę</b>
          <p>Policzymy prognozę dojazdu dla każdej godziny wyjazdu i wskażemy, kiedy jechać do pracy i kiedy wracać.</p>
        </div>
      )}
      {ready && p.loading && <div className="empty">Liczę prognozę dla 26 godzin wyjazdu…</div>}
      {ready && p.error && <div className="notice error">{p.error}</div>}
      {ready && p.data && !p.loading && (
        <>
          <p className="muted small forecast-note">
            Prognoza na {weekdayLong(p.data.dow)}, {p.data.date.slice(8, 10)}.{p.data.date.slice(5, 7)} na podstawie
            historycznych wzorców ruchu.
          </p>
          <Direction title="Do pracy (rano)" options={p.data.toWork} night={p.data.night.toWork} kind="work" />
          <Direction title="Powrót do domu" options={p.data.toHome} night={p.data.night.toHome} kind="home" />
        </>
      )}
    </>
  );
}
