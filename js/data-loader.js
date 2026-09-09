/**
 * data-loader.js
 * Loads every dataset exactly once (countries, COVID daily records,
 * vaccination, regions, population, sources, and the GeoJSON country
 * boundaries) and hands the raw results to data-transformer.js. No
 * other module should call fetch() on these files directly.
 */
(function (global) {
  "use strict";

  async function fetchJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status} loading ${path}`);
    return res.json();
  }

  /**
   * @param {(stepKey: string) => void} onStep called after each dataset
   *   finishes loading, so the loading screen can tick off its steps.
   */
  async function loadAll(onStep) {
    const tick = (key) => { if (onStep) onStep(key); };

    const countries = await fetchJSON("data/countries.json");
    tick("countries");

    const [covidDaily, vaccination, regions, population, sources] = await Promise.all([
      fetchJSON("data/covid_daily.json"),
      fetchJSON("data/vaccination.json"),
      fetchJSON("data/regions.json"),
      fetchJSON("data/population.json"),
      fetchJSON("data/sources.json")
    ]);
    tick("covid");
    tick("vaccination");

    let geojson = null;
    try {
      geojson = await fetchJSON("geo/countries.geojson");
    } catch (e) {
      console.warn("data-loader.js: could not load geo/countries.geojson", e);
    }
    tick("geo");

    return { countries, covidDaily, vaccination, regions, population, sources, geojson };
  }

  global.DataLoader = { loadAll };
})(window);
