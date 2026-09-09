/**
 * state.js
 * The single source of truth for the application. Every module reads
 * and writes through this object rather than keeping its own copy of
 * filters/selection, so the map, charts, KPIs, and tables never drift
 * out of sync with each other.
 */
(function (global) {
  "use strict";

  const listeners = [];

  const AppState = {
    data: {
      countries: [],
      countriesByIso3: {},
      covidByIso3: {},      // iso3 -> array of daily records, sorted by date
      covidByIso3Date: {},  // iso3 -> { date -> record } for O(1) lookup
      vaccinationByIso3: {},
      regions: [],
      population: {},
      geojson: null,
      sources: [],
      dates: [],             // sorted unique date list across the dataset
      quality: null
    },

    filters: {
      date: null,
      startDate: null,
      endDate: null,
      country: "World",
      region: "All",
      metric: "total_cases"
    },

    selectedCountry: null,   // iso3
    compareCountries: [],    // up to 5 iso3 codes

    map: {
      projection: "globe",
      zoom: 1.2,
      metric: "total_cases",
      date: null
    },

    ui: {
      theme: "dark",
      activeView: "overview",
      sidebarOpen: false
    }
  };

  function subscribe(fn) {
    listeners.push(fn);
    return () => {
      const idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }

  function notify(topic) {
    listeners.forEach((fn) => {
      try { fn(topic, AppState); } catch (e) { console.error("state listener error", e); }
    });
  }

  function setFilters(partial) {
    Object.assign(AppState.filters, partial);
    notify("filters");
  }

  function setSelectedCountry(iso3) {
    AppState.selectedCountry = iso3;
    notify("selectedCountry");
  }

  function setMap(partial) {
    Object.assign(AppState.map, partial);
    notify("map");
  }

  function setTheme(theme) {
    AppState.ui.theme = theme;
    notify("theme");
  }

  function setActiveView(view) {
    AppState.ui.activeView = view;
    notify("view");
  }

  global.AppState = AppState;
  global.StateBus = { subscribe, notify, setFilters, setSelectedCountry, setMap, setTheme, setActiveView };
})(window);
