import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";

export interface SeriesPoint {
  /** minutes since local midnight */
  x: number;
  /** seconds */
  y: number;
  /** snapshot timestamp, for actual points */
  t?: string;
  color?: string;
}

interface Props {
  actual: SeriesPoint[];
  typical: SeriesPoint[];
  freeFlow?: number;
  cursorT: string | null;
  onScrub: (t: string) => void;
  typicalLabel: string;
}

const H = 168;
const M = { top: 12, right: 12, bottom: 24, left: 34 };

function path(points: SeriesPoint[], sx: (x: number) => number, sy: (y: number) => number) {
  let d = "";
  let prev: SeriesPoint | null = null;
  for (const p of points) {
    // Break the line on gaps longer than 70 minutes (e.g. missing night samples).
    const cmd = !prev || p.x - prev.x > 70 ? "M" : "L";
    d += `${cmd}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`;
    prev = p;
  }
  return d;
}

export function Timeline({ actual, typical, freeFlow, cursorT, onScrub, typicalLabel }: Props) {
  const { t } = useI18n();
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(360);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(240, e.contentRect.width)));
    ro.observe(wrap.current!);
    return () => ro.disconnect();
  }, []);

  const { sx, sy, yTicks } = useMemo(() => {
    const ys = [...actual, ...typical].map((p) => p.y / 60);
    if (freeFlow) ys.push(freeFlow / 60);
    const max = Math.max(10, ...ys) * 1.12;
    const min = Math.max(0, Math.min(...(ys.length ? ys : [0])) * 0.8);
    const step = max - min > 40 ? 10 : 5;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    for (let v = lo; v <= hi; v += step) ticks.push(v);
    return {
      sx: (x: number) => M.left + (x / 1440) * (w - M.left - M.right),
      sy: (secs: number) => M.top + (1 - (secs / 60 - lo) / (hi - lo || 1)) * (H - M.top - M.bottom),
      yTicks: ticks,
    };
  }, [actual, typical, freeFlow, w]);

  const cursor = cursorT ? actual.find((p) => p.t === cursorT) : actual[actual.length - 1];

  const scrub = (clientX: number) => {
    if (!actual.length) return;
    const rect = wrap.current!.getBoundingClientRect();
    const x = ((clientX - rect.left - M.left) / (w - M.left - M.right)) * 1440;
    let best = actual[0]!;
    for (const p of actual) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    if (best.t && best.t !== cursorT) onScrub(best.t);
  };

  const onKey = (e: KeyboardEvent) => {
    if (!actual.length) return;
    const i = Math.max(0, actual.findIndex((p) => p === cursor));
    const next = e.key === "ArrowLeft" ? i - 1 : e.key === "ArrowRight" ? i + 1 : -1;
    if (next >= 0 && next < actual.length) {
      e.preventDefault();
      onScrub(actual[next]!.t!);
    }
  };

  const actualPath = path(actual, sx, sy);
  const area =
    actual.length > 1
      ? `${actualPath}L${sx(actual[actual.length - 1]!.x)},${H - M.bottom}L${sx(actual[0]!.x)},${H - M.bottom}Z`
      : "";

  return (
    <div className="timeline" ref={wrap}>
      <svg
        width={w}
        height={H}
        role="slider"
        tabIndex={0}
        aria-label={t("timeline.label")}
        aria-valuemin={0}
        aria-valuemax={1440}
        aria-valuenow={cursor?.x ?? 0}
        aria-valuetext={cursor ? `${Math.floor(cursor.x / 60)}:${String(cursor.x % 60).padStart(2, "0")}` : undefined}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          scrub(e.clientX);
        }}
        onPointerMove={(e) => (e.buttons || e.pointerType === "mouse") && scrub(e.clientX)}
      >
        <defs>
          <linearGradient id="tl-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((v) => (
          <g key={v}>
            <line className="grid" x1={M.left} x2={w - M.right} y1={sy(v * 60)} y2={sy(v * 60)} />
            <text className="tick" x={M.left - 6} y={sy(v * 60) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {[0, 6, 12, 18, 24].map((h) => (
          <text key={h} className="tick" x={sx(h * 60)} y={H - 6} textAnchor={h === 0 ? "start" : h === 24 ? "end" : "middle"}>
            {String(h).padStart(2, "0")}:00
          </text>
        ))}
        {freeFlow ? (
          <line className="freeflow" x1={M.left} x2={w - M.right} y1={sy(freeFlow)} y2={sy(freeFlow)} />
        ) : null}
        <path className="typical" d={path(typical, sx, sy)} />
        {area && <path d={area} fill="url(#tl-fill)" />}
        <path className="actual" d={actualPath} />
        {cursor && (
          <g>
            <line className="cursor" x1={sx(cursor.x)} x2={sx(cursor.x)} y1={M.top} y2={H - M.bottom} />
            <circle cx={sx(cursor.x)} cy={sy(cursor.y)} r={5} fill={cursor.color ?? "var(--accent)"} className="cursor-dot" />
          </g>
        )}
      </svg>
      <div className="legend">
        <span>
          <i className="sw actual" /> {t("timeline.selectedDay")}
        </span>
        <span>
          <i className="sw typical" /> {typicalLabel}
        </span>
        {freeFlow ? (
          <span>
            <i className="sw freeflow" /> {t("timeline.freeFlow")}
          </span>
        ) : null}
        <span className="unit">{t("common.minUnit")}</span>
      </div>
    </div>
  );
}
