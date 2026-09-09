/**
 * map-layers.js
 * Adds a deck.gl WebGL overlay on top of the MapLibre map via
 * deck.gl's MapboxOverlay (which is compatible with any MapLibre/
 * Mapbox-GL-style map instance, despite the name). This is where
 * deck.gl earns its place in the architecture: point-level rendering
 * and density aggregation that would be awkward to express as plain
 * MapLibre paint expressions.
 *
 * Layers:
 *  - ScatterplotLayer: one point per country, radius/color scaled by
 *    the active metric value at country centroids.
 *  - TextLayer: labels for the top N countries by the active metric.
 *  - HeatmapLayer: metric-weighted density surface across all
 *    country centroids.
 *
 * All three are independently toggleable from the map's layer
 * controls and are rebuilt whenever the metric or timeline date
 * changes.
 */
(function (global) {
  "use strict";

  let overlay = null;
  let currentLayers = { points: true, labels: false, heatmap: false };
  let lastMetric = null, lastDate = null;

  function metricValueFor(iso3, metric, isoDate) {
    if (metric === "vaccination_pct") {
      const v = DataTransformer.vaccinationOnOrBefore(iso3, isoDate);
      return v ? v.vaccination_pct : null;
    }
    const r = DataTransformer.recordOnOrBefore(iso3, isoDate);
    return r ? r[metric] : null;
  }

  function buildPointData(metric, isoDate) {
    const points = [];
    AppState.data.countries.forEach((c) => {
      const value = metricValueFor(c.iso3, metric, isoDate);
      if (value == null || !Number.isFinite(value) || value <= 0) return;
      points.push({ iso3: c.iso3, name: c.name, position: [c.longitude, c.latitude], value });
    });
    return points;
  }

  function attach(map) {
    if (!global.deck || !global.deck.MapboxOverlay) {
      console.warn("map-layers.js: deck.gl MapboxOverlay not available; skipping WebGL overlay layers.");
      return null;
    }
    overlay = new deck.MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay);
    return overlay;
  }

  function buildLayers(metric, isoDate) {
    const points = buildPointData(metric, isoDate);
    const maxVal = points.length ? Math.max(...points.map((p) => p.value)) : 1;
    const layers = [];

    if (currentLayers.heatmap && points.length) {
      layers.push(new deck.HeatmapLayer({
        id: "covid-heatmap",
        data: points,
        getPosition: (d) => d.position,
        getWeight: (d) => d.value,
        radiusPixels: 45,
        intensity: 1,
        threshold: 0.03,
        colorRange: [
          [27, 58, 75, 60], [62, 124, 166, 110], [233, 196, 106, 170], [230, 57, 70, 220], [168, 22, 26, 255]
        ]
      }));
    }

    if (currentLayers.points && points.length) {
      layers.push(new deck.ScatterplotLayer({
        id: "covid-points",
        data: points,
        getPosition: (d) => d.position,
        getRadius: (d) => 18000 + Math.sqrt(d.value / maxVal) * 220000,
        radiusUnits: "meters",
        getFillColor: (d) => {
          const t = Utils.clamp(d.value / maxVal, 0, 1);
          return t > 0.66 ? [230, 57, 70, 170] : t > 0.33 ? [233, 196, 106, 160] : [76, 201, 240, 140];
        },
        stroked: true,
        getLineColor: [15, 17, 20, 200],
        lineWidthMinPixels: 1,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 120]
      }));
    }

    if (currentLayers.labels && points.length) {
      const top = [...points].sort((a, b) => b.value - a.value).slice(0, 12);
      layers.push(new deck.TextLayer({
        id: "covid-labels",
        data: top,
        getPosition: (d) => d.position,
        getText: (d) => d.name,
        getSize: 12,
        getColor: [236, 238, 241, 230],
        getPixelOffset: [0, -16],
        fontFamily: "Inter, sans-serif",
        outlineWidth: 2,
        outlineColor: [11, 17, 22, 220]
      }));
    }

    return layers;
  }

  function update(metric, isoDate) {
    if (!overlay) return;
    lastMetric = metric; lastDate = isoDate;
    overlay.setProps({ layers: buildLayers(metric, isoDate) });
  }

  function setLayerVisible(layerKey, visible) {
    currentLayers[layerKey] = visible;
    if (lastMetric && lastDate) update(lastMetric, lastDate);
  }

  function getLayerState() {
    return Object.assign({}, currentLayers);
  }

  function detach() {
    overlay = null;
  }

  global.MapLayers = { attach, update, setLayerVisible, getLayerState, detach };
})(window);
