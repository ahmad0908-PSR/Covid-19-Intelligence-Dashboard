/**
 * map.js
 * The GIS centerpiece: a MapLibre GL choropleth built entirely from
 * the local GeoJSON country boundaries (geo/countries.geojson) with
 * no external tile server, basemap, or API key -- the "style" is a
 * plain background layer plus our own GeoJSON source, so the map
 * works fully offline once deployed.
 *
 * Choropleth values are pushed into MapLibre via setFeatureState
 * (keyed by the ISO3 "A3" property, promoted to the feature id) so
 * changing the metric or timeline date never re-parses the 1MB+
 * GeoJSON payload -- only the per-feature state updates.
 */
(function (global) {
  "use strict";

  const METRIC_LABELS = {
    total_cases: "Total Cases", new_cases: "New Cases", cases_per_million: "Cases / Million",
    total_deaths: "Total Deaths", new_deaths: "New Deaths", deaths_per_million: "Deaths / Million",
    vaccination_pct: "Vaccination %", case_fatality_ratio: "Case Fatality %"
  };

  const instances = {}; // containerId -> { map, onReady }

  function buildStyle() {
    return {
      version: 8,
      sources: {},
      layers: [
        { id: "bg", type: "background", paint: { "background-color": "#0B1116" } }
      ]
    };
  }

  function createMap(containerId, opts) {
    opts = opts || {};
    const map = new maplibregl.Map({
      container: containerId,
      style: buildStyle(),
      center: opts.center || [30, 15],
      zoom: opts.zoom != null ? opts.zoom : 1.1,
      attributionControl: false,
      dragRotate: true,
      pitchWithRotate: false
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "Boundaries: OpenStreetMap / Natural Earth" }), "bottom-right");

    const record = { map, ready: false, onSelectCountry: opts.onSelectCountry, popup: null };
    instances[containerId] = record;

    map.on("load", () => {
      addCountryLayers(map);
      if (opts.projection === "globe") setProjection(containerId, "globe");
      record.ready = true;
      wireInteractions(containerId);
      if (opts.onReady) opts.onReady(map);
    });

    return record;
  }

  function addCountryLayers(map) {
    map.addSource("countries", {
      type: "geojson",
      data: AppState.data.geojson,
      promoteId: "A3"
    });

    map.addLayer({
      id: "countries-fill", type: "fill", source: "countries",
      paint: {
        "fill-color": [
          "case",
          ["==", ["feature-state", "hasData"], true],
          [
            "interpolate", ["linear"], ["coalesce", ["feature-state", "value"], 0],
            0, "#1B3A4B", 0.33, "#3E7CA6", 0.66, "#E9C46A", 1, "#E63946"
          ],
          "#2A2F38"
        ],
        "fill-opacity": 0.88
      }
    });
    map.addLayer({
      id: "countries-line", type: "line", source: "countries",
      paint: { "line-color": "#0B1116", "line-width": 0.5 }
    });
    map.addLayer({
      id: "countries-hover-outline", type: "line", source: "countries",
      paint: {
        "line-color": "#ECEEF1",
        "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2, 0]
      }
    });
    map.addLayer({
      id: "countries-selected-outline", type: "line", source: "countries",
      paint: {
        "line-color": "#4CC9F0",
        "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.5, 0]
      }
    });
  }

  let hoveredId = null;
  let selectedId = null;

  function wireInteractions(containerId) {
    const { map, onSelectCountry } = instances[containerId];
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "map-country-popup-wrap" });
    instances[containerId].popup = popup;

    map.on("mousemove", "countries-fill", (e) => {
      if (!e.features.length) return;
      map.getCanvas().style.cursor = "pointer";
      const f = e.features[0];
      if (hoveredId !== null) map.setFeatureState({ source: "countries", id: hoveredId }, { hover: false });
      hoveredId = f.id;
      map.setFeatureState({ source: "countries", id: hoveredId }, { hover: true });
      popup.setLngLat(e.lngLat).setHTML(buildPopupHTML(f.properties.A3)).addTo(map);
    });
    map.on("mouseleave", "countries-fill", () => {
      map.getCanvas().style.cursor = "";
      if (hoveredId !== null) map.setFeatureState({ source: "countries", id: hoveredId }, { hover: false });
      hoveredId = null;
      popup.remove();
    });
    map.on("click", "countries-fill", (e) => {
      if (!e.features.length) return;
      const iso3 = e.features[0].properties.A3;
      selectCountryOnMap(containerId, iso3);
      if (onSelectCountry) onSelectCountry(iso3);
    });
  }

  function buildPopupHTML(iso3) {
    const country = AppState.data.countriesByIso3[iso3];
    if (!country) return `<div class="map-country-popup"><h4>${Utils.escapeHtml(iso3)}</h4><p class="text-faint">No data available</p></div>`;
    const date = AppState.map.date || AppState.filters.date;
    const rec = DataTransformer.recordOnOrBefore(iso3, date) || {};
    const vax = DataTransformer.vaccinationOnOrBefore(iso3, date) || {};
    return `
      <div class="map-country-popup">
        <h4>${Utils.escapeHtml(country.name)}</h4>
        <div class="popup-row"><span>Cases</span><span>${Utils.formatNumber(rec.total_cases)}</span></div>
        <div class="popup-row"><span>Deaths</span><span>${Utils.formatNumber(rec.total_deaths)}</span></div>
        <div class="popup-row"><span>Cases / Million</span><span>${Utils.formatNumber(rec.cases_per_million, 0)}</span></div>
        <div class="popup-row"><span>Deaths / Million</span><span>${Utils.formatNumber(rec.deaths_per_million, 0)}</span></div>
        <div class="popup-row"><span>Vaccination</span><span>${vax.vaccination_pct != null ? Utils.formatPercent(vax.vaccination_pct) : "—"}</span></div>
        <div class="popup-row"><span>Date</span><span>${Utils.formatDate(date)}</span></div>
      </div>
    `;
  }

  function selectCountryOnMap(containerId, iso3) {
    const { map } = instances[containerId];
    if (selectedId !== null) map.setFeatureState({ source: "countries", id: selectedId }, { selected: false });
    selectedId = iso3;
    map.setFeatureState({ source: "countries", id: iso3 }, { selected: true });
    const country = AppState.data.countriesByIso3[iso3];
    if (country) map.flyTo({ center: [country.longitude, country.latitude], zoom: Math.max(map.getZoom(), 3.2), speed: 0.9 });
  }

  function updateChoropleth(containerId, metric, isoDate) {
    const rec = instances[containerId];
    if (!rec || !rec.ready) return;
    const { map } = rec;
    const values = [];

    AppState.data.countries.forEach((c) => {
      let value = null;
      if (metric === "vaccination_pct") {
        const v = DataTransformer.vaccinationOnOrBefore(c.iso3, isoDate);
        value = v ? v.vaccination_pct : null;
      } else {
        const r = DataTransformer.recordOnOrBefore(c.iso3, isoDate);
        value = r ? r[metric] : null;
      }
      if (value != null && Number.isFinite(value)) values.push({ iso3: c.iso3, value });
    });

    const max = values.length ? Math.max(...values.map((v) => v.value)) : 1;
    const min = 0;

    values.forEach(({ iso3, value }) => {
      const normalized = max > min ? Utils.clamp((value - min) / (max - min), 0, 1) : 0;
      map.setFeatureState({ source: "countries", id: iso3 }, { hasData: true, value: normalized, rawValue: value });
    });

    // Countries with no data for this metric/date: explicitly clear hasData
    const covered = new Set(values.map((v) => v.iso3));
    AppState.data.countries.forEach((c) => {
      if (!covered.has(c.iso3)) map.setFeatureState({ source: "countries", id: c.iso3 }, { hasData: false });
    });

    return { min, max };
  }

  function setProjection(containerId, projection) {
    const rec = instances[containerId];
    if (!rec || !rec.map.setProjection) return;
    try { rec.map.setProjection({ type: projection === "globe" ? "globe" : "mercator" }); } catch (e) { /* older builds without globe support */ }
  }

  function resetView(containerId) {
    const { map } = instances[containerId];
    map.flyTo({ center: [30, 15], zoom: 1.1, bearing: 0, pitch: 0 });
    if (selectedId !== null) { map.setFeatureState({ source: "countries", id: selectedId }, { selected: false }); selectedId = null; }
  }

  function resize(containerId) {
    instances[containerId]?.map.resize();
  }

  function flyToCountry(containerId, iso3) {
    selectCountryOnMap(containerId, iso3);
  }

  function getInstance(containerId) {
    return instances[containerId];
  }

  global.MapModule = { createMap, updateChoropleth, setProjection, resetView, resize, flyToCountry, getInstance, METRIC_LABELS };
})(window);
