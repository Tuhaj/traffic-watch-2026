import maplibregl, { type GeoJSONSource, type Map as MlMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { levelFor } from "../../../shared/congestion";
import type { LngLat, RouteReading, RouteState } from "../../../shared/types";
import { minutes } from "../format";

interface Props {
  center: LngLat;
  centerName: string;
  zoom: number;
  routes: RouteState[];
  readings: Record<string, RouteReading> | undefined;
  focused: string | null;
  dark: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  mode: "city" | "commute";
  home: LngLat | null;
  work: LngLat | null;
  picking: "home" | "work" | null;
  onPoint: (kind: "home" | "work", p: LngLat) => void;
  commute: { toWork: LngLat[]; toHome: LngLat[] } | null;
}

const CITY_LAYERS = ["routes-casing", "routes-line", "origins", "origin-labels"];
const COMMUTE_COLORS = { toWork: "#2f6fed", toHome: "#8b5cf6" };

function line(coords: LngLat[] | undefined) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: coords && coords.length > 1 ? coords : [] },
  };
}

function pinElement(kind: "home" | "work") {
  const el = document.createElement("div");
  el.className = `map-pin ${kind}`;
  const label = document.createElement("span");
  label.textContent = kind === "home" ? "D" : "P";
  el.appendChild(label);
  el.setAttribute("aria-label", kind === "home" ? "Dom" : "Praca");
  return el;
}

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const NO_DATA = "#8a94a6";

function routesGeoJson(routes: RouteState[], readings: Props["readings"], focused: string | null) {
  return {
    type: "FeatureCollection" as const,
    features: routes
      .filter((r) => r.geometry && r.geometry.length > 1)
      .map((r) => {
        const reading = readings?.[r.id];
        const color = reading ? levelFor(reading.duration / reading.freeFlow).color : NO_DATA;
        return {
          type: "Feature" as const,
          id: r.id,
          properties: { id: r.id, color, focused: focused === r.id ? 1 : 0, dim: focused && focused !== r.id ? 1 : 0 },
          geometry: { type: "LineString" as const, coordinates: r.geometry! },
        };
      }),
  };
}

function originsGeoJson(routes: RouteState[], readings: Props["readings"]) {
  return {
    type: "FeatureCollection" as const,
    features: routes.map((r) => {
      const reading = readings?.[r.id];
      return {
        type: "Feature" as const,
        properties: {
          id: r.id,
          label: reading ? `${r.from} · ${minutes(reading.duration)} min` : r.from,
          color: reading ? levelFor(reading.duration / reading.freeFlow).color : NO_DATA,
        },
        geometry: { type: "Point" as const, coordinates: r.origin },
      };
    }),
  };
}

/** Pads the camera so the routes are not hidden behind the side panel / bottom sheet. */
function padding() {
  const wide = window.innerWidth >= 900;
  return wide
    ? { top: 40, bottom: 40, left: 460, right: 40 }
    : { top: 30, bottom: Math.round(window.innerHeight * 0.5), left: 20, right: 20 };
}

export function MapView(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(0);
  const latest = useRef(props);
  latest.current = props;
  const fitted = useRef(false);
  const pins = useRef<Partial<Record<"home" | "work", maplibregl.Marker>>>({});

  // Create map once; recreate the style when the theme flips.
  useEffect(() => {
    const m = new maplibregl.Map({
      container: el.current!,
      style: props.dark ? STYLE.dark : STYLE.light,
      center: props.center,
      zoom: props.zoom,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.current = m;

    m.on("style.load", () => {
      const p = latest.current;
      m.addSource("routes", { type: "geojson", data: routesGeoJson(p.routes, p.readings, p.focused) });
      m.addSource("origins", { type: "geojson", data: originsGeoJson(p.routes, p.readings) });
      m.addSource("center", {
        type: "geojson",
        data: { type: "Feature", properties: { label: p.centerName }, geometry: { type: "Point", coordinates: p.center } },
      });
      m.addLayer({
        id: "routes-casing",
        type: "line",
        source: "routes",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": p.dark ? "#0e1116" : "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 5, 14, 12],
          "line-opacity": ["case", ["==", ["get", "dim"], 1], 0.35, 0.95],
        },
      });
      m.addLayer({
        id: "routes-line",
        type: "line",
        source: "routes",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            ["case", ["==", ["get", "focused"], 1], 4.5, 3],
            14,
            ["case", ["==", ["get", "focused"], 1], 10, 7],
          ],
          "line-opacity": ["case", ["==", ["get", "dim"], 1], 0.3, 1],
        },
      });
      m.addLayer({
        id: "origins",
        type: "circle",
        source: "origins",
        paint: {
          "circle-radius": 5.5,
          "circle-color": ["get", "color"],
          "circle-stroke-color": p.dark ? "#0e1116" : "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      m.addLayer({
        id: "origin-labels",
        type: "symbol",
        source: "origins",
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: {
          "text-color": p.dark ? "#e6e8ec" : "#1b2230",
          "text-halo-color": p.dark ? "#0e1116" : "#ffffff",
          "text-halo-width": 1.6,
        },
      });
      m.addLayer({
        id: "center",
        type: "circle",
        source: "center",
        paint: {
          "circle-radius": 7,
          "circle-color": p.dark ? "#e6e8ec" : "#111827",
          "circle-stroke-color": p.dark ? "#0e1116" : "#ffffff",
          "circle-stroke-width": 3,
        },
      });
      for (const dir of ["toHome", "toWork"] as const) {
        m.addSource(`commute-${dir}`, { type: "geojson", data: line(p.commute?.[dir]) });
        m.addLayer({
          id: `commute-${dir}-casing`,
          type: "line",
          source: `commute-${dir}`,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": p.dark ? "#0e1116" : "#ffffff", "line-width": 9 },
        });
        m.addLayer({
          id: `commute-${dir}`,
          type: "line",
          source: `commute-${dir}`,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": COMMUTE_COLORS[dir],
            "line-width": 5,
            ...(dir === "toHome" ? { "line-dasharray": [1.4, 1.2] } : {}),
          },
        });
      }
      setReady((n) => n + 1);
    });

    m.on("click", (e) => {
      const kind = latest.current.picking;
      if (kind) latest.current.onPoint(kind, [e.lngLat.lng, e.lngLat.lat]);
    });

    const hoverLayers = ["routes-line", "origins"];
    for (const layer of hoverLayers) {
      m.on("mousemove", layer, (e) => {
        if (latest.current.mode !== "city") return;
        m.getCanvas().style.cursor = "pointer";
        const id = e.features?.[0]?.properties?.id as string | undefined;
        latest.current.onHover(id ?? null);
      });
      m.on("mouseleave", layer, () => {
        if (latest.current.mode !== "city") return;
        m.getCanvas().style.cursor = "";
        latest.current.onHover(null);
      });
      m.on("click", layer, (e) => {
        if (latest.current.mode !== "city") return;
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) latest.current.onSelect(id);
      });
    }

    return () => {
      m.remove();
      map.current = null;
      fitted.current = false;
      pins.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.dark]);

  // Fit to all origins once the map is ready.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || fitted.current) return;
    const coords = props.routes.flatMap((r) => [r.origin]).concat([props.center]);
    if (coords.length < 2) return;
    const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0]!, coords[0]!));
    m.fitBounds(bounds, { padding: padding(), duration: 0 });
    fitted.current = true;
  }, [ready, props.routes, props.center]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("routes") as GeoJSONSource | undefined)?.setData(routesGeoJson(props.routes, props.readings, props.focused));
    (m.getSource("origins") as GeoJSONSource | undefined)?.setData(originsGeoJson(props.routes, props.readings));
  }, [ready, props.routes, props.readings, props.focused]);

  // Mode: show either the city corridors or the personal commute.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const city = props.mode === "city";
    for (const id of CITY_LAYERS) m.setLayoutProperty(id, "visibility", city ? "visible" : "none");
    for (const dir of ["toHome", "toWork"]) {
      for (const id of [`commute-${dir}`, `commute-${dir}-casing`]) m.setLayoutProperty(id, "visibility", city ? "none" : "visible");
    }
    // Back on the city view: show all corridors again.
    if (city && fitted.current) {
      const coords = [...latest.current.routes.map((r) => r.origin), latest.current.center];
      const b = coords.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(coords[0]!, coords[0]!));
      m.fitBounds(b, { padding: padding(), duration: 600 });
    }
  }, [ready, props.mode]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("commute-toWork") as GeoJSONSource | undefined)?.setData(line(props.commute?.toWork));
    (m.getSource("commute-toHome") as GeoJSONSource | undefined)?.setData(line(props.commute?.toHome));
    const coords = [...(props.commute?.toWork ?? []), ...(props.commute?.toHome ?? [])];
    if (props.mode === "commute" && coords.length > 1) {
      const b = coords.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(coords[0]!, coords[0]!));
      const pad = padding();
      // Leave room above the tallest pin.
      m.fitBounds(b, { padding: { ...pad, top: pad.top + 40 }, maxZoom: 14, duration: 600 });
    }
  }, [ready, props.commute, props.mode]);

  useEffect(() => {
    const m = map.current;
    if (m) m.getCanvas().style.cursor = props.picking ? "crosshair" : "";
  }, [props.picking, ready]);

  // Draggable home / work pins.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const kind of ["home", "work"] as const) {
      const pos = props.mode === "commute" ? props[kind] : null;
      let marker = pins.current[kind];
      if (!pos) {
        marker?.remove();
        delete pins.current[kind];
        continue;
      }
      if (!marker) {
        marker = new maplibregl.Marker({ element: pinElement(kind), draggable: true, anchor: "bottom" });
        marker.on("dragend", () => {
          const ll = marker!.getLngLat();
          latest.current.onPoint(kind, [ll.lng, ll.lat]);
        });
        pins.current[kind] = marker;
      }
      marker.setLngLat(pos).addTo(m);
    }
  }, [props.home, props.work, props.mode, ready]);

  return <div ref={el} className="map" role="region" aria-label="Mapa tras dojazdu do centrum" />;
}
