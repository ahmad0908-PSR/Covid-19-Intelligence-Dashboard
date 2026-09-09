/**
 * config.js
 * Loads data/config.json once and exposes it as window.AppConfig.
 * Nothing in the app should hardcode the app name, portfolio URL,
 * default country/metric/date, or theme -- it all comes from here.
 */
(function (global) {
  "use strict";

  const DEFAULTS = {
    appName: "Global COVID-19 Intelligence Dashboard",
    shortName: "COVID-19 Intelligence",
    version: "1.0.0",
    portfolioUrl: "#",
    defaultCountry: "World",
    defaultCountryIso3: null,
    defaultMetric: "total_cases",
    defaultDate: null,
    minDate: null,
    maxDate: null,
    defaultTheme: "dark",
    defaultProjection: "globe",
    isDemoDataset: true,
    demoDatasetNotice: "",
    disclaimer: ""
  };

  async function loadConfig() {
    try {
      const res = await fetch("data/config.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      global.AppConfig = Object.assign({}, DEFAULTS, json);
    } catch (e) {
      console.warn("config.js: could not load data/config.json, using defaults.", e);
      global.AppConfig = Object.assign({}, DEFAULTS);
    }
    return global.AppConfig;
  }

  global.ConfigLoader = { loadConfig };
})(window);
