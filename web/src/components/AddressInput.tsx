import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import type { LngLat, PlaceDetails, PlaceSuggestion } from "../../../shared/types";
import { errorText, useI18n } from "../i18n";

interface Props {
  kind: "home" | "work";
  label: string;
  /** Label of the currently set point, shown when the field is not being edited. */
  value: string | null;
  picking: boolean;
  onPickOnMap: () => void;
  onSelect: (position: LngLat, label: string) => void;
}

const DEBOUNCE_MS = 280;

export function AddressInput({ kind, label, value, picking, onPickOnMap, onSelect }: Props) {
  const i18n = useI18n();
  const { t } = i18n;
  const listId = useId();
  const [text, setText] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ body: unknown; status: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Reflect points set elsewhere (map click, drag, clear) while the user is not typing.
  useEffect(() => {
    if (!editing) setText(value ?? "");
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    const q = text.trim();
    if (q.length < 3 || q === value) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/places/suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then(async (res) => {
          const body = await res.json().catch(() => null);
          if (!res.ok) throw { body, status: res.status };
          setItems(body as PlaceSuggestion[]);
          setActive(-1);
          setError(null);
        })
        .catch((e: { body?: unknown; status?: number }) => {
          if (!ctrl.signal.aborted) setError({ body: e?.body ?? null, status: e?.status ?? 0 });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [text, editing, value]);

  const choose = async (s: PlaceSuggestion) => {
    setItems([]);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/places/detail?id=${encodeURIComponent(s.id)}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw { body, status: res.status };
      const place = body as PlaceDetails;
      setEditing(false);
      setText(place.title);
      onSelect(place.position, place.title);
      input.current?.blur();
    } catch (e) {
      const err = e as { body?: unknown; status?: number };
      setError({ body: err?.body ?? null, status: err?.status ?? 0 });
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === "Enter" && items.length) {
      e.preventDefault();
      void choose(items[Math.max(0, active)]!);
    } else if (e.key === "Escape") {
      setItems([]);
      setEditing(false);
      setText(value ?? "");
    }
  };

  const open = editing && items.length > 0;

  return (
    <div className={`address ${kind} ${picking ? "picking" : ""}`}>
      <span className="pin" aria-hidden>
        {t(kind === "home" ? "commute.homeInitial" : "commute.workInitial")}
      </span>
      <div className="address-field">
        <label htmlFor={`${listId}-input`}>{label}</label>
        <input
          ref={input}
          id={`${listId}-input`}
          type="text"
          inputMode="search"
          autoComplete="off"
          spellCheck={false}
          placeholder={t(picking ? "address.placeholderPicking" : "address.placeholder")}
          value={text}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${listId}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-opt-${active}` : undefined}
          onFocus={(e) => {
            setEditing(true);
            e.target.select();
          }}
          onBlur={() =>
            // Delay so a click on a suggestion lands before the list closes.
            setTimeout(() => {
              setEditing(false);
              setItems([]);
            }, 150)
          }
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        {busy && <span className="address-spinner" aria-label={t("address.searching")} />}
        {open && (
          <ul className="suggestions" id={`${listId}-list`} role="listbox">
            {items.map((s, i) => (
              <li
                key={s.id}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : ""}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void choose(s);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <b>{s.title}</b>
                {s.subtitle && <small>{s.subtitle}</small>}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="address-error">{errorText(i18n, error.body, error.status)}</p>}
      </div>
      <button
        type="button"
        className={`map-pick ${picking ? "active" : ""}`}
        onClick={onPickOnMap}
        aria-pressed={picking}
        title={t("address.pickOnMap")}
        aria-label={t(kind === "home" ? "address.pickHome" : "address.pickWork")}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <circle cx="12" cy="12" r="3.2" fill="currentColor" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
    </div>
  );
}
