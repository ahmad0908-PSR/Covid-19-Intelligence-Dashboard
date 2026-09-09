/**
 * ui.js
 * Chrome-level UI behavior shared by every view: sidebar navigation
 * switching, theme (light/dark/system) with persistence, the global
 * country search in the topbar, the mobile sidebar drawer, fullscreen
 * toggle, and the loading-screen step indicator.
 */
(function (global) {
  "use strict";

  const VIEW_TITLES = {
    overview: ["Overview", "Global situation summary"],
    "global-map": ["Global Map", "Interactive GIS choropleth"],
    countries: ["Countries", "Country intelligence profile"],
    trends: ["Trends", "Analytical trend explorer"],
    comparisons: ["Comparisons", "Compare up to five countries"],
    vaccination: ["Vaccination", "Global vaccination analysis"],
    rankings: ["Rankings", "Country rankings by metric"],
    "data-explorer": ["Data Explorer", "Browse the underlying dataset"],
    "data-quality": ["Data Quality", "Completeness, validity, and consistency"],
    about: ["About", "Data sources and disclaimer"]
  };

  function initNavigation(onViewChange) {
    Utils.$all(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.view, onViewChange));
    });
  }

  function switchView(view, onViewChange) {
    Utils.$all(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    Utils.$all(".view-panel").forEach((p) => p.classList.toggle("active", p.dataset.viewPanel === view));
    const [title, subtitle] = VIEW_TITLES[view] || [view, ""];
    Utils.$("#view-title").textContent = title;
    Utils.$("#view-subtitle").textContent = subtitle;
    StateBus.setActiveView(view);
    closeMobileSidebar();
    if (onViewChange) onViewChange(view);
  }

  function initMobileSidebar() {
    const toggle = Utils.$("#mobile-nav-toggle");
    const scrim = Utils.$("#sidebar-scrim");
    toggle?.addEventListener("click", () => {
      Utils.$("#app-shell").classList.add("sidebar-open");
      scrim.style.display = "block";
    });
    scrim?.addEventListener("click", closeMobileSidebar);
  }
  function closeMobileSidebar() {
    Utils.$("#app-shell")?.classList.remove("sidebar-open");
    const scrim = Utils.$("#sidebar-scrim");
    if (scrim) scrim.style.display = "none";
  }

  function initTheme(defaultTheme) {
    const saved = Storage2.read(Storage2.KEYS.theme, defaultTheme || "dark");
    applyTheme(saved);
    Utils.$all("[data-theme-option]").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyTheme(btn.dataset.themeOption);
        Storage2.write(Storage2.KEYS.theme, btn.dataset.themeOption);
      });
    });
  }

  function applyTheme(theme) {
    let resolved = theme;
    if (theme === "system") {
      resolved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.body.setAttribute("data-theme", resolved);
    Utils.$all("[data-theme-option]").forEach((b) => b.classList.toggle("active", b.dataset.themeOption === theme));
    StateBus.setTheme(resolved);
  }

  function initFullscreen() {
    Utils.$("#fullscreen-toggle")?.addEventListener("click", () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    });
  }

  function initGlobalSearch(onSelectCountry) {
    const input = Utils.$("#global-search-input");
    const results = Utils.$("#global-search-results");
    if (!input || !results) return;

    const render = Utils.debounce(() => {
      const term = input.value.trim();
      if (term.length < 1) { results.classList.remove("open"); results.innerHTML = ""; return; }
      const matches = Filters.filterCountries(AppState.data.countries, { search: term }).slice(0, 8);
      if (!matches.length) {
        results.innerHTML = `<div class="topbar-search-result"><span>No countries found</span></div>`;
      } else {
        results.innerHTML = matches.map((c) => `
          <div class="topbar-search-result" data-iso3="${c.iso3}"><span>${Utils.escapeHtml(c.name)}</span><span class="text-faint">${c.region}</span></div>
        `).join("");
      }
      results.classList.add("open");
    }, 150);

    input.addEventListener("input", render);
    input.addEventListener("focus", render);
    results.addEventListener("click", (e) => {
      const row = e.target.closest("[data-iso3]");
      if (!row) return;
      input.value = "";
      results.classList.remove("open");
      if (onSelectCountry) onSelectCountry(row.dataset.iso3);
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".topbar-search")) results.classList.remove("open");
    });
  }

  function markLoadingStep(stepKey) {
    const el = Utils.$(`.loading-step[data-step="${stepKey}"]`);
    if (!el) return;
    el.classList.add("done");
    el.querySelector(".step-check").innerHTML = '<svg viewBox="0 0 24 24"><path d="m4 12.5 5 5L20 6.5"/></svg>';
    const total = Utils.$all(".loading-step").length;
    const done = Utils.$all(".loading-step.done").length;
    const fill = Utils.$("#loading-bar-fill");
    if (fill) fill.style.width = `${(done / total) * 100}%`;
  }

  function hideLoadingScreen() {
    const screen = Utils.$("#loading-screen");
    if (screen) setTimeout(() => screen.classList.add("hidden"), 250);
  }

  function showLoadingError(message) {
    const screen = Utils.$("#loading-screen");
    if (!screen) return;
    const p = screen.querySelector(".loading-brand p");
    if (p) { p.textContent = message; p.style.color = "var(--color-accent)"; }
  }

  global.UI = {
    initNavigation, switchView, initMobileSidebar, initTheme, applyTheme,
    initFullscreen, initGlobalSearch, markLoadingStep, hideLoadingScreen, showLoadingError, VIEW_TITLES
  };
})(window);
