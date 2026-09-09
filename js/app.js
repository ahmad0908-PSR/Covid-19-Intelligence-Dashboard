/**
 * app.js
 * The boot sequence and the wiring for every view that doesn't have
 * its own dedicated module (Global Map controls, Trends/ECharts,
 * Comparisons, Vaccination, Data Quality, About). Runs last in the
 * script load order since it depends on every other module.
 */
(function (global) {
  "use strict";

  let compareList = [];
  let trendsChart = null;
  let playTimer = null;

  async function boot() {
    try {
      const config = await ConfigLoader.loadConfig();
      UI.markLoadingStep("config");
      applyConfigToChrome(config);

      const raw = await DataLoader.loadAll((step) => UI.markLoadingStep(step));
      const quality = DataValidator.validate(raw);
      DataTransformer.transform(raw);
      AppState.data.quality = quality;

      const defaultIso3 = config.defaultCountryIso3 || guessIso3ByName(config.defaultCountry) || "AFG";
      const defaultDate = config.defaultDate || AppState.data.dates[Math.floor(AppState.data.dates.length / 2)];
      AppState.filters.date = defaultDate;
      AppState.map.date = defaultDate;
      AppState.selectedCountry = defaultIso3;

      initChrome(config);
      initOverview(defaultIso3, defaultDate);
      populateAllSelectors(defaultIso3);

      UI.hideLoadingScreen();
    } catch (err) {
      console.error("Fatal boot error:", err);
      UI.showLoadingError("Something went wrong while loading the dashboard. Please refresh to try again.");
    }
  }

  function guessIso3ByName(name) {
    if (!name) return null;
    const found = AppState.data.countries && AppState.data.countries.find((c) => c.name.toLowerCase() === String(name).toLowerCase());
    return found ? found.iso3 : null;
  }

  function applyConfigToChrome(config) {
    document.title = config.appName;
    Utils.$("#loading-title").textContent = (config.shortName || config.appName).toUpperCase();
    const brandNames = Utils.$all("[data-bind='shortName']");
    brandNames.forEach((el) => { el.textContent = config.shortName; });
    const portfolioLink = Utils.$("#portfolio-back-link");
    if (portfolioLink) portfolioLink.href = config.portfolioUrl;
    UI.initTheme(config.defaultTheme);
  }

  function initChrome() {
    UI.initNavigation(onViewChange);
    UI.initMobileSidebar();
    UI.initFullscreen();
    UI.initGlobalSearch((iso3) => selectCountryGlobally(iso3, true));
  }

  // ---------------------------------------------------------------------
  // Overview
  // ---------------------------------------------------------------------

  function initOverview(defaultIso3, defaultDate) {
    renderOverviewKpis(defaultDate);
    renderOverviewList(defaultDate);
    renderOverviewCharts();

    const country = AppState.data.countriesByIso3[defaultIso3];
    MapModule.createMap("map-container-overview", {
      center: country ? [country.longitude, country.latitude] : [30, 15],
      zoom: country ? 3.5 : 1.1,
      projection: "mercator",
      onSelectCountry: (iso3) => selectCountryGlobally(iso3, true),
      onReady: () => {
        Utils.$("#overview-map-loading").style.display = "none";
        MapModule.updateChoropleth("map-container-overview", AppState.filters.metric, defaultDate);
        if (country) MapModule.flyToCountry("map-container-overview", defaultIso3);
      }
    });

    Utils.$("#overview-map-date").textContent = Utils.formatDate(defaultDate);
    const notice = Utils.$("#disclaimer-strip-overview");
    if (notice) notice.textContent = AppConfig.isDemoDataset ? "Demonstration dataset \u2014 not real-time public health data." : "";
  }

  function renderOverviewKpis(isoDate) {
    const g = DataTransformer.globalRecordForDate(isoDate, "All");
    const prev = DataTransformer.globalRecordForDate(Utils.addDays(isoDate, -1), "All");
    const vax = DataTransformer.globalVaccinationForDate(isoDate, "All");

    Utils.$("#kpi-global-cases").textContent = Utils.formatCompact(g.total_cases);
    Utils.$("#kpi-global-cases-date").textContent = Utils.formatDate(isoDate);
    const change = Calc.percentChange(g.new_cases, prev.new_cases);
    const changeEl = Utils.$("#kpi-global-cases-change");
    if (change != null) {
      changeEl.className = `kpi-change ${change >= 0 ? "up" : "down"}`;
      changeEl.innerHTML = `<svg viewBox="0 0 24 24"><path d="${change >= 0 ? "M12 19V5M5 12l7-7 7 7" : "M12 5v14M5 12l7 7 7-7"}"/></svg> ${Math.abs(change).toFixed(1)}%`;
    }
    Utils.$("#kpi-global-deaths").textContent = Utils.formatCompact(g.total_deaths);
    Utils.$("#kpi-new-cases").textContent = Utils.formatCompact(g.new_cases);
    Utils.$("#kpi-vax-coverage").textContent = vax.vaccination_pct != null ? Utils.formatPercent(vax.vaccination_pct) : "\u2014";
  }

  function renderOverviewList(isoDate) {
    const ranked = AppState.data.countries
      .map((c) => ({ c, rec: DataTransformer.recordOnOrBefore(c.iso3, isoDate) }))
      .filter((x) => x.rec)
      .sort((a, b) => b.rec.total_cases - a.rec.total_cases)
      .slice(0, 10);
    Utils.$("#overview-recent-list").innerHTML = ranked.map((x) => `
      <div class="list-item">
        <div class="list-item-dot" style="background:${x.c.iso3 === AppState.selectedCountry ? "var(--color-accent)" : "var(--color-blue)"};"></div>
        <div><div class="list-item-title">${Utils.escapeHtml(x.c.name)}</div><div class="list-item-sub">${Utils.escapeHtml(x.c.region)}</div></div>
        <div class="list-item-value">${Utils.formatCompact(x.rec.total_cases)}</div>
      </div>
    `).join("");
  }

  function renderOverviewCharts() {
    const dates = AppState.data.dates;
    const sampleEvery = Math.max(1, Math.floor(dates.length / 180));
    const sampledDates = dates.filter((_, i) => i % sampleEvery === 0);
    const globalSeries = sampledDates.map((d) => DataTransformer.globalRecordForDate(d, "All").new_cases);
    Charts.lineChart("chart-daily-new-cases", sampledDates, [{ label: "New Cases", data: globalSeries, borderColor: Charts.THEME_COLORS().blue, fill: true, backgroundColor: "rgba(76,201,240,0.12)" }]);

    const regionLabels = AppState.data.regions.map((r) => r.name);
    const regionValues = regionLabels.map((r) => DataTransformer.globalRecordForDate(AppState.filters.date, r).total_cases);
    Charts.barChart("chart-regional-comparison", regionLabels, { label: "Total Cases", data: regionValues, backgroundColor: Charts.THEME_COLORS().accent });

    const vaxDates = sampledDates.filter((d) => d >= "2021-01-01");
    const vaxSeries = vaxDates.map((d) => DataTransformer.globalVaccinationForDate(d, "All").vaccination_pct);
    Charts.lineChart("chart-vaccination-progress", vaxDates, [{ label: "Global Vaccination %", data: vaxSeries, borderColor: Charts.THEME_COLORS().green, fill: true, backgroundColor: "rgba(74,222,128,0.1)" }]);
  }

  // ---------------------------------------------------------------------
  // Country selection (shared across views)
  // ---------------------------------------------------------------------

  function selectCountryGlobally(iso3, switchToCountriesView) {
    StateBus.setSelectedCountry(iso3);
    const sel = Utils.$("#country-profile-select");
    if (sel) sel.value = iso3;
    CountryPanel.render(iso3);
    if (switchToCountriesView) UI.switchView("countries", onViewChange);
    const overviewMap = MapModule.getInstance("map-container-overview");
    if (overviewMap) MapModule.flyToCountry("map-container-overview", iso3);
  }

  // ---------------------------------------------------------------------
  // View lifecycle: lazy-init heavy views on first visit
  // ---------------------------------------------------------------------

  const initializedViews = new Set();

  function onViewChange(view) {
    if (view === "global-map") { initGlobalMapView(); resizeMaps(); }
    if (view === "overview") resizeMaps();
    if (view === "countries") CountryPanel.render(AppState.selectedCountry);
    if (view === "trends") initTrendsView();
    if (view === "comparisons" && !initializedViews.has("comparisons")) { initComparisonsView(); initializedViews.add("comparisons"); }
    if (view === "vaccination" && !initializedViews.has("vaccination")) { initVaccinationView(); initializedViews.add("vaccination"); }
    if (view === "rankings" && !initializedViews.has("rankings")) { initRankingsView(); initializedViews.add("rankings"); }
    if (view === "data-explorer" && !initializedViews.has("data-explorer")) { initDataExplorerView(); initializedViews.add("data-explorer"); }
    if (view === "data-quality" && !initializedViews.has("data-quality")) { initDataQualityView(); initializedViews.add("data-quality"); }
    if (view === "about" && !initializedViews.has("about")) { initAboutView(); initializedViews.add("about"); }
  }

  function resizeMaps() {
    setTimeout(() => { MapModule.resize("map-container-overview"); MapModule.resize("map-container-global"); }, 60);
  }

  // ---------------------------------------------------------------------
  // Global Map view
  // ---------------------------------------------------------------------

  function initGlobalMapView() {
    if (initializedViews.has("global-map")) return;
    initializedViews.add("global-map");

    const panel = Utils.$("#global-map-panel");
    buildGlobalMapChrome(panel);

    MapModule.createMap("map-container-global", {
      center: [30, 15], zoom: 1.1, projection: AppConfig.defaultProjection,
      onSelectCountry: (iso3) => selectCountryGlobally(iso3, true),
      onReady: (map) => {
        Utils.$("#global-map-loading").style.display = "none";
        MapModule.updateChoropleth("map-container-global", AppState.map.metric, AppState.map.date);
        MapLayers.attach(map);
        MapLayers.update(AppState.map.metric, AppState.map.date);
        updateMapLegend(AppState.map.metric);
      }
    });
  }

  function buildGlobalMapChrome(panel) {
    const toolbar = Utils.el("div", { class: "map-toolbar" }, []);
    const metricSelect = Utils.el("select", { class: "control", id: "map-metric-select" });
    Object.entries(MapModule.METRIC_LABELS).forEach(([value, label]) => {
      metricSelect.appendChild(Utils.el("option", { value }, [label]));
    });
    metricSelect.value = AppState.map.metric;
    metricSelect.addEventListener("change", () => {
      AppState.map.metric = metricSelect.value;
      MapModule.updateChoropleth("map-container-global", metricSelect.value, AppState.map.date);
      MapLayers.update(metricSelect.value, AppState.map.date);
      updateMapLegend(metricSelect.value);
    });
    toolbar.appendChild(metricSelect);

    const projGroup = Utils.el("div", { class: "pill-group" }, []);
    ["globe", "mercator"].forEach((p) => {
      const btn = Utils.el("button", { class: `pill ${AppState.map.projection === p ? "active" : ""}` }, [p === "globe" ? "Globe" : "Flat"]);
      btn.addEventListener("click", () => {
        AppState.map.projection = p;
        projGroup.querySelectorAll(".pill").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        MapModule.setProjection("map-container-global", p);
      });
      projGroup.appendChild(btn);
    });
    toolbar.appendChild(projGroup);

    const layerGroup = Utils.el("div", { class: "pill-group" }, []);
    [["points", "Points"], ["heatmap", "Heatmap"], ["labels", "Labels"]].forEach(([key, label]) => {
      const active = MapLayers.getLayerState()[key];
      const btn = Utils.el("button", { class: `pill ${active ? "active" : ""}` }, [label]);
      btn.addEventListener("click", () => {
        const nowOn = !btn.classList.contains("active");
        btn.classList.toggle("active", nowOn);
        MapLayers.setLayerVisible(key, nowOn);
      });
      layerGroup.appendChild(btn);
    });
    toolbar.appendChild(layerGroup);
    panel.appendChild(toolbar);

    const navControls = Utils.el("div", { class: "map-nav-controls" }, []);
    const zoomIn = Utils.el("button", { class: "icon-btn", "aria-label": "Zoom in", html: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>' });
    const zoomOut = Utils.el("button", { class: "icon-btn", "aria-label": "Zoom out", html: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>' });
    const reset = Utils.el("button", { class: "icon-btn", "aria-label": "Reset view", html: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 1 3 6.7"/><path d="M3 12V6M3 12h6"/></svg>' });
    zoomIn.addEventListener("click", () => MapModule.getInstance("map-container-global").map.zoomIn());
    zoomOut.addEventListener("click", () => MapModule.getInstance("map-container-global").map.zoomOut());
    reset.addEventListener("click", () => MapModule.resetView("map-container-global"));
    [zoomIn, zoomOut, reset].forEach((b) => navControls.appendChild(b));
    panel.appendChild(navControls);

    const legend = Utils.el("div", { class: "map-legend", id: "global-map-legend" }, []);
    panel.appendChild(legend);
    updateMapLegend(AppState.map.metric);

    buildTimeline(panel);
  }

  function updateMapLegend(metric) {
    const legend = Utils.$("#global-map-legend");
    if (!legend) return;
    legend.innerHTML = `
      <div class="map-legend-title">${MapModule.METRIC_LABELS[metric]}</div>
      <div class="map-legend-bar"></div>
      <div class="map-legend-labels"><span>Low</span><span>High</span></div>
      <div class="map-legend-nodata"><i></i> No data</div>
    `;
  }

  function buildTimeline(panel) {
    const dates = AppState.data.dates;
    const timeline = Utils.el("div", { class: "map-timeline" }, []);
    const prevBtn = Utils.el("button", { class: "icon-btn", "aria-label": "Previous date", html: '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>' });
    const playBtn = Utils.el("button", { class: "icon-btn map-timeline-play", id: "timeline-play-btn", "aria-label": "Play", html: '<svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8V4Z"/></svg>' });
    const nextBtn = Utils.el("button", { class: "icon-btn", "aria-label": "Next date", html: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>' });
    const dateLabel = Utils.el("div", { class: "map-timeline-date", id: "timeline-date-label" }, [Utils.formatDate(AppState.map.date)]);
    const sliderWrap = Utils.el("div", { class: "map-timeline-slider" }, []);
    const slider = Utils.el("input", { type: "range", min: "0", max: String(dates.length - 1), value: String(dates.indexOf(AppState.map.date)), id: "timeline-slider" });
    sliderWrap.appendChild(slider);

    function goToIndex(idx) {
      idx = Utils.clamp(idx, 0, dates.length - 1);
      const date = dates[idx];
      AppState.map.date = date;
      AppState.filters.date = date;
      slider.value = String(idx);
      dateLabel.textContent = Utils.formatDate(date);
      MapModule.updateChoropleth("map-container-global", AppState.map.metric, date);
      MapLayers.update(AppState.map.metric, date);
      MapModule.updateChoropleth("map-container-overview", AppState.filters.metric, date);
      renderOverviewKpis(date);
      renderOverviewList(date);
      const dateEl = Utils.$("#overview-map-date");
      if (dateEl) dateEl.textContent = Utils.formatDate(date);
      const rankingsView = Utils.$("#view-rankings");
      if (rankingsView && rankingsView.classList.contains("active")) Rankings.render();
    }

    prevBtn.addEventListener("click", () => goToIndex(dates.indexOf(AppState.map.date) - 1));
    nextBtn.addEventListener("click", () => goToIndex(dates.indexOf(AppState.map.date) + 1));
    slider.addEventListener("input", () => goToIndex(parseInt(slider.value, 10)));
    playBtn.addEventListener("click", () => togglePlay(playBtn, dates, goToIndex));

    [prevBtn, playBtn, dateLabel, sliderWrap, nextBtn].forEach((n) => timeline.appendChild(n));
    panel.appendChild(timeline);
  }

  function togglePlay(playBtn, dates, goToIndex) {
    if (playTimer) {
      clearInterval(playTimer); playTimer = null;
      playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8V4Z"/></svg>';
      return;
    }
    playBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>';
    playTimer = setInterval(() => {
      let idx = dates.indexOf(AppState.map.date) + 7;
      if (idx >= dates.length) idx = 0;
      goToIndex(idx);
    }, 500);
  }

  // ---------------------------------------------------------------------
  // Trends (ECharts)
  // ---------------------------------------------------------------------

  function initTrendsView() {
    const countrySel = Utils.$("#trends-country-select");
    const metricSel = Utils.$("#trends-metric-select");
    const fromInput = Utils.$("#trends-date-from");
    const toInput = Utils.$("#trends-date-to");
    let aggregation = "daily";

    if (!countrySel.dataset.wired) {
      const countries = [{ iso3: "World", name: "World (All Countries)" }].concat([...AppState.data.countries].sort((a, b) => a.name.localeCompare(b.name)));
      countrySel.innerHTML = countries.map((c) => `<option value="${c.iso3}">${Utils.escapeHtml(c.name)}</option>`).join("");
      countrySel.value = AppState.selectedCountry;
      fromInput.value = AppState.data.dates[0];
      toInput.value = AppState.data.dates[AppState.data.dates.length - 1];
      fromInput.min = toInput.min = AppState.data.dates[0];
      fromInput.max = toInput.max = AppState.data.dates[AppState.data.dates.length - 1];

      countrySel.addEventListener("change", renderTrendsChart);
      metricSel.addEventListener("change", renderTrendsChart);
      fromInput.addEventListener("change", renderTrendsChart);
      toInput.addEventListener("change", renderTrendsChart);
      Utils.$all("#trends-aggregation .pill").forEach((btn) => btn.addEventListener("click", () => {
        Utils.$all("#trends-aggregation .pill").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        aggregation = btn.dataset.agg;
        renderTrendsChart();
      }));
      Utils.$("#trends-reset-zoom").addEventListener("click", () => trendsChart && trendsChart.dispatchAction({ type: "dataZoom", start: 0, end: 100 }));
      countrySel.dataset.wired = "1";
    }

    function renderTrendsChart() {
      const iso3 = countrySel.value;
      const metric = metricSel.value;
      const dates = Filters.dateRange(AppState.data.dates, fromInput.value, toInput.value);
      let records;
      if (iso3 === "World") {
        records = dates.map((d) => Object.assign({ date: d }, DataTransformer.globalRecordForDate(d, "All")));
      } else {
        records = dates.map((d) => DataTransformer.recordOnOrBefore(iso3, d)).filter(Boolean);
      }
      const series = Filters.aggregateSeries(records, metric, aggregation);

      const el = document.getElementById("chart-trends-explorer");
      if (!trendsChart) trendsChart = echarts.init(el, null, { renderer: "canvas" });
      const dark = document.body.getAttribute("data-theme") !== "light";
      trendsChart.setOption({
        backgroundColor: "transparent",
        textStyle: { color: dark ? "#A6ADBB" : "#565E6C" },
        grid: { left: 50, right: 20, top: 20, bottom: 60 },
        tooltip: { trigger: "axis" },
        xAxis: { type: "category", data: series.map((s) => s.label || s.date), axisLine: { lineStyle: { color: "#2E333D" } } },
        yAxis: { type: "value", splitLine: { lineStyle: { color: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" } } },
        dataZoom: [{ type: "inside" }, { type: "slider", height: 20, bottom: 10 }],
        series: [{ type: "line", data: series.map((s) => s.value), smooth: true, symbol: "none", areaStyle: { opacity: 0.12 }, lineStyle: { color: "#4CC9F0", width: 2 }, itemStyle: { color: "#4CC9F0" } }]
      }, true);
    }

    renderTrendsChart();
    window.addEventListener("resize", () => trendsChart && trendsChart.resize());
  }

  // ---------------------------------------------------------------------
  // Comparisons
  // ---------------------------------------------------------------------

  function initComparisonsView() {
    compareList = [AppState.selectedCountry].filter(Boolean);
    const addSelect = Utils.$("#compare-add-select");
    const countries = [...AppState.data.countries].sort((a, b) => a.name.localeCompare(b.name));
    addSelect.innerHTML = `<option value="">+ Add country to compare&hellip;</option>` + countries.map((c) => `<option value="${c.iso3}">${Utils.escapeHtml(c.name)}</option>`).join("");
    addSelect.addEventListener("change", () => {
      if (addSelect.value && compareList.length < 5 && compareList.indexOf(addSelect.value) === -1) {
        compareList.push(addSelect.value);
        renderComparisons();
      }
      addSelect.value = "";
    });
    renderComparisons();
  }

  function renderComparisons() {
    const chips = Utils.$("#compare-chips");
    chips.innerHTML = compareList.map((iso3) => {
      const c = AppState.data.countriesByIso3[iso3];
      return `<div class="compare-chip">${Utils.escapeHtml(c.name)}<button data-remove="${iso3}">&times;</button></div>`;
    }).join("");
    chips.querySelectorAll("[data-remove]").forEach((btn) => btn.addEventListener("click", () => {
      compareList = compareList.filter((i) => i !== btn.dataset.remove);
      renderComparisons();
    }));

    if (!compareList.length) {
      Charts.destroy("chart-compare-bar"); Charts.destroy("chart-compare-line");
      Utils.$("#compare-table").innerHTML = "";
      return;
    }

    const isoDate = AppState.filters.date;
    const names = compareList.map((iso3) => AppState.data.countriesByIso3[iso3].name);
    const casesData = compareList.map((iso3) => (DataTransformer.recordOnOrBefore(iso3, isoDate) || {}).total_cases || 0);
    const deathsData = compareList.map((iso3) => (DataTransformer.recordOnOrBefore(iso3, isoDate) || {}).total_deaths || 0);
    Charts.multiBarChart("chart-compare-bar", names, [
      { label: "Total Cases", data: casesData, backgroundColor: Charts.THEME_COLORS().blue },
      { label: "Total Deaths", data: deathsData, backgroundColor: Charts.THEME_COLORS().accent }
    ]);

    const dates = AppState.data.dates.filter((_, i) => i % 10 === 0);
    const colors = [Charts.THEME_COLORS().blue, Charts.THEME_COLORS().accent, Charts.THEME_COLORS().teal, Charts.THEME_COLORS().amber, Charts.THEME_COLORS().purple];
    const lineDatasets = compareList.map((iso3, idx) => ({
      label: AppState.data.countriesByIso3[iso3].name,
      data: dates.map((d) => { const r = DataTransformer.recordOnOrBefore(iso3, d); return r ? r.cases_per_million : null; }),
      borderColor: colors[idx % colors.length]
    }));
    Charts.lineChart("chart-compare-line", dates, lineDatasets);

    const table = Utils.$("#compare-table");
    table.innerHTML = `
      <thead><tr><th>Country</th><th>Cases</th><th>Deaths</th><th>Cases/M</th><th>Deaths/M</th><th>Vaccination %</th><th>CFR %</th></tr></thead>
      <tbody>${compareList.map((iso3) => {
        const r = DataTransformer.recordOnOrBefore(iso3, isoDate) || {};
        const v = DataTransformer.vaccinationOnOrBefore(iso3, isoDate) || {};
        return `<tr><td class="country-cell">${Utils.escapeHtml(AppState.data.countriesByIso3[iso3].name)}</td><td>${Utils.formatNumber(r.total_cases)}</td><td>${Utils.formatNumber(r.total_deaths)}</td><td>${Utils.formatNumber(r.cases_per_million, 0)}</td><td>${Utils.formatNumber(r.deaths_per_million, 0)}</td><td>${v.vaccination_pct != null ? Utils.formatPercent(v.vaccination_pct) : "\u2014"}</td><td>${r.case_fatality_ratio != null ? Utils.formatPercent(r.case_fatality_ratio, 2) : "\u2014"}</td></tr>`;
      }).join("")}</tbody>
    `;

    let insightsHost = Utils.$("#comparisons-insights");
    const items = Insights.comparisonInsights(compareList, isoDate);
    if (!insightsHost && items.length) {
      const host = Utils.el("div", { class: "panel", id: "comparisons-insights" }, []);
      host.innerHTML = `<div class="panel-header"><h3>Automated Observations</h3></div><div class="panel-body">${items.map((t) => `<div class="list-item"><div class="list-item-dot" style="background:var(--color-blue);"></div><div class="list-item-title" style="font-weight:400;">${Utils.escapeHtml(t)}</div></div>`).join("")}</div>`;
      Utils.$("#view-comparisons").appendChild(host);
    } else if (insightsHost) {
      insightsHost.querySelector(".panel-body").innerHTML = items.map((t) => `<div class="list-item"><div class="list-item-dot" style="background:var(--color-blue);"></div><div class="list-item-title" style="font-weight:400;">${Utils.escapeHtml(t)}</div></div>`).join("");
    }
  }

  // ---------------------------------------------------------------------
  // Vaccination view
  // ---------------------------------------------------------------------

  function initVaccinationView() {
    const dates = AppState.data.dates.filter((d) => d >= "2021-01-01").filter((_, i) => i % 7 === 0);
    const globalSeries = dates.map((d) => DataTransformer.globalVaccinationForDate(d, "All").vaccination_pct);
    Charts.lineChart("chart-vax-global", dates, [{ label: "Global Vaccination %", data: globalSeries, borderColor: Charts.THEME_COLORS().green, fill: true, backgroundColor: "rgba(74,222,128,0.1)" }]);

    const isoDate = AppState.filters.date;
    const regionLabels = AppState.data.regions.map((r) => r.name);
    const regionVax = regionLabels.map((r) => DataTransformer.globalVaccinationForDate(isoDate, r).vaccination_pct);
    Charts.barChart("chart-vax-region", regionLabels, { label: "Vaccination %", data: regionVax, backgroundColor: Charts.THEME_COLORS().teal });

    const ranked = AppState.data.countries.map((c) => ({ c, v: DataTransformer.vaccinationOnOrBefore(c.iso3, isoDate) })).filter((x) => x.v).sort((a, b) => b.v.vaccination_pct - a.v.vaccination_pct);
    Utils.$("#vax-table").innerHTML = `
      <thead><tr><th>Country</th><th>Region</th><th>At Least One Dose</th><th>Fully Vaccinated</th></tr></thead>
      <tbody>${ranked.map((x) => `<tr><td class="country-cell">${Utils.escapeHtml(x.c.name)}</td><td class="text-faint">${x.c.region}</td><td>${Utils.formatPercent(x.v.vaccination_pct)}</td><td>${Utils.formatPercent(x.v.full_vaccination_pct)}</td></tr>`).join("")}</tbody>
    `;
  }

  // ---------------------------------------------------------------------
  // Rankings / Data Explorer / Data Quality / About
  // ---------------------------------------------------------------------

  function initRankingsView() {
    Rankings.populateRegionFilter(Utils.$("#ranking-region-filter"));
    Utils.$("#ranking-metric-select").addEventListener("change", (e) => Rankings.setMetric(e.target.value));
    Utils.$("#ranking-region-filter").addEventListener("change", (e) => Rankings.setRegion(e.target.value));
    Utils.$("#ranking-search").addEventListener("input", Utils.debounce((e) => Rankings.setSearch(e.target.value), 200));
    Rankings.render();
  }

  function initDataExplorerView() {
    DataTable.buildFlatRows();
    DataTable.populateFilters();
    Utils.$("#explorer-search").addEventListener("input", Utils.debounce((e) => DataTable.setSearch(e.target.value), 200));
    Utils.$("#explorer-region-filter").addEventListener("change", (e) => DataTable.setRegion(e.target.value));
    Utils.$("#explorer-country-filter").addEventListener("change", (e) => DataTable.setCountry(e.target.value));
    Utils.$("#explorer-reset-btn").addEventListener("click", () => DataTable.resetFilters());
    Utils.$("#explorer-columns-btn").addEventListener("click", () => Utils.$("#explorer-columns-list").classList.toggle("open"));
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".column-toggle-menu")) { const list = Utils.$("#explorer-columns-list"); if (list) list.classList.remove("open"); }
    });
    Utils.$("#explorer-export-btn").addEventListener("click", () => {
      ExportModule.downloadCSV(`covid_data_explorer_${Date.now()}.csv`, DataTable.getFilteredRows(), DataTable.getVisibleColumns());
      Utils.toast("CSV exported.");
    });
    DataTable.render();
  }

  function initDataQualityView() {
    const q = AppState.data.quality;
    if (!q) return;
    Utils.$("#quality-summary-grid").innerHTML = `
      <div class="panel quality-score-card"><div class="kpi-label">Overall Quality Score</div><div class="data-quality-score">${q.overallScore}%</div></div>
      <div class="panel quality-score-card"><div class="kpi-label">Completeness</div><div class="data-quality-score" style="font-size:26px;">${q.completeness}%</div></div>
      <div class="panel quality-score-card"><div class="kpi-label">Validity</div><div class="data-quality-score" style="font-size:26px;">${q.validity}%</div><div class="text-faint" style="font-size:11px;">${q.counts.invalidRecords} invalid record${q.counts.invalidRecords === 1 ? "" : "s"}</div></div>
      <div class="panel quality-score-card"><div class="kpi-label">Uniqueness</div><div class="data-quality-score" style="font-size:26px;">${q.uniqueness}%</div><div class="text-faint" style="font-size:11px;">${q.counts.duplicates} duplicate${q.counts.duplicates === 1 ? "" : "s"}</div></div>
      <div class="panel quality-score-card"><div class="kpi-label">Consistency</div><div class="data-quality-score" style="font-size:26px;">${q.consistency}%</div><div class="text-faint" style="font-size:11px;">${q.counts.inconsistentRecords} inconsistent record${q.counts.inconsistentRecords === 1 ? "" : "s"}</div></div>
    `;
    Utils.$("#quality-validity-list").innerHTML = q.validityIssues.length
      ? q.validityIssues.map((i) => `<div class="quality-issue-row"><span>${i.iso3} &middot; ${i.date}</span><span class="text-faint">${i.problems.join(", ")}</span></div>`).join("")
      : `<p class="text-faint">No validity issues detected.</p>`;
    Utils.$("#quality-consistency-list").innerHTML = q.consistencyIssues.length
      ? q.consistencyIssues.map((i) => `<div class="quality-issue-row"><span>${i.iso3} &middot; ${i.date}</span><span class="text-faint">${i.problems.join(", ")}</span></div>`).join("")
      : `<p class="text-faint">No consistency issues detected.</p>`;
  }

  function initAboutView() {
    Utils.$("#about-app-name").textContent = AppConfig.appName;
    Utils.$("#about-disclaimer").textContent = AppConfig.disclaimer;
    Utils.$("#about-demo-notice").textContent = AppConfig.demoDatasetNotice;
    Utils.$("#about-sources-list").innerHTML = AppState.data.sources.map((s) => `
      <div class="source-card">
        <div><strong>${Utils.escapeHtml(s.name)}</strong><div class="text-faint">${Utils.escapeHtml(s.dataset)}</div></div>
        <div style="text-align:right;"><a href="${s.url}" target="_blank" rel="noopener" style="color:var(--color-blue);">${s.url}</a><div class="text-faint">Retrieved ${s.retrievalDate}</div></div>
      </div>
    `).join("");
  }

  // ---------------------------------------------------------------------
  // Cross-view selectors that need country lists
  // ---------------------------------------------------------------------

  function populateAllSelectors(defaultIso3) {
    CountryPanel.populateSelect(Utils.$("#country-profile-select"), defaultIso3);
    Utils.$("#country-profile-select").addEventListener("change", (e) => selectCountryGlobally(e.target.value, false));
  }

  document.addEventListener("DOMContentLoaded", boot);
})(window);
