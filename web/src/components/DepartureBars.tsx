import { levelFor } from "../../../shared/congestion";
import type { CommuteOption } from "../../../shared/types";
import { minutes } from "../format";

interface Props {
  options: CommuteOption[];
  /** Fastest possible time, used as the "1.0" baseline for colouring. */
  baseline: number;
  label: string;
  selected: string;
  best: string;
  onSelect: (depart: string) => void;
}

export function DepartureBars({ options, baseline, label, selected, best, onSelect }: Props) {
  if (!options.length) return null;
  const max = Math.max(...options.map((o) => o.duration));
  return (
    <figure className="bars">
      <div className="bars-plot" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const lv = levelFor(o.duration / Math.max(1, baseline));
          return (
            <button
              key={o.depart}
              type="button"
              role="radio"
              aria-checked={o.depart === selected}
              aria-label={`Wyjazd ${o.depart}, ${minutes(o.duration)} min${o.depart === best ? ", najszybciej" : ""}`}
              className={`bar ${o.depart === selected ? "selected" : ""} ${o.depart === best ? "best" : ""}`}
              onClick={() => onSelect(o.depart)}
            >
              <span className="bar-val">{minutes(o.duration)}</span>
              <i style={{ height: `${Math.max(8, (o.duration / max) * 100)}%`, background: lv.color }} />
            </button>
          );
        })}
      </div>
      <div className="bars-axis" aria-hidden>
        {options.map((o) => (
          <span key={o.depart}>{o.depart.endsWith(":00") ? o.depart.slice(0, 2) : ""}</span>
        ))}
      </div>
    </figure>
  );
}
