/**
 * storage.js
 * localStorage is used only for UI preferences (theme, selected
 * countries, saved filters) -- never for the COVID dataset itself,
 * which always comes from the JSON files in /data.
 */
(function (global) {
  "use strict";

  const PREFIX = "covidIntel.";
  const KEYS = {
    theme: PREFIX + "theme",
    compareCountries: PREFIX + "compareCountries",
    savedFilters: PREFIX + "savedFilters",
    explorerColumns: PREFIX + "explorerColumns"
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn("storage.js: write failed", e);
      return false;
    }
  }

  global.Storage2 = { KEYS, read, write };
})(window);
