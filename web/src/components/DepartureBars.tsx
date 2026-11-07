import { levelFor } from "../../../shared/congestion";
import type { CommuteOption } from "../../../shared/types";
import { minutes } from "../format";

interface Props {
  options: CommuteOption[];
  /** Night duration, used as the "empty road" baseline for colouring. */
  baseline: number;
  label: string;
}

export function DepartureBars({ options, baseline, label }: Props) {
  if (!options.length) return null;
  const max = Math.max(...options.map((o) => o.duration));
  const min = Math.min(...options.map((o) => o.duration));
  const best = options.find((o) => o.duration === min)!;
  return (
    <figure className="bars" aria-label={label}>
      <div className="bars-plot">
        {options.map((o) => {
          const lv = levelFor(o.duration / Math.max(1, baseline));
          const isBest = o === best;
          return (
            <div
              key={o.depart}
              className={`bar ${isBest ? "best" : ""}`}
              title={`Wyjazd ${o.depart}: ${minutes(o.duration)} min`}
            >
              <span className="bar-val">{minutes(o.duration)}</span>
              <i style={{ height: `${Math.max(8, (o.duration / max) * 100)}%`, background: lv.color }} />
            </div>
          );
        })}
      </div>
      <div className="bars-axis" aria-hidden>
        {options.map((o) => (
          <span key={o.depart}>{o.depart.endsWith(":00") ? o.depart.slice(0, 2) : ""}</span>
        ))}
      </div>
      <figcaption className="sr-only">
        {options.map((o) => `${o.depart}: ${minutes(o.duration)} min`).join(", ")}
      </figcaption>
    </figure>
  );
}
