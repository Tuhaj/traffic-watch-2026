import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import type { LngLat, PlaceDetails, PlaceSuggestion } from "../../../shared/types";

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
  const listId = useId();
  const [text, setText] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
          const body = await res.json();
          if (!res.ok) throw new Error(body.message ?? `Błąd ${res.status}`);
          setItems(body as PlaceSuggestion[]);
          setActive(-1);
          setError(null);
        })
        .catch((e: Error) => {
          if (!ctrl.signal.aborted) setError(e.message);
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
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? `Błąd ${res.status}`);
      const place = body as PlaceDetails;
      setEditing(false);
      setText(place.title);
      onSelect(place.position, place.title);
      input.current?.blur();
    } catch (e) {
      setError((e as Error).message);
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
        {kind === "home" ? "D" : "P"}
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
          placeholder={picking ? "Kliknij na mapie albo wpisz adres" : "Wpisz adres lub miejsce"}
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
        {busy && <span className="address-spinner" aria-label="Szukam" />}
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
        {error && <p className="address-error">{error}</p>}
      </div>
      <button
        type="button"
        className={`map-pick ${picking ? "active" : ""}`}
        onClick={onPickOnMap}
        aria-pressed={picking}
        title="Wskaż na mapie"
        aria-label={`Wskaż ${kind === "home" ? "dom" : "pracę"} na mapie`}
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
