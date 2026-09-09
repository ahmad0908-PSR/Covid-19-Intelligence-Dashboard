/**
 * country-panel.js
 * Renders the Countries view: profile summary card, and four charts
 * (cases over time, deaths over time, 7-day average new cases,
 * vaccination coverage) for the selected country.
 */
(function (global) {
  "use strict";

  function populateSelect(selectEl, selectedIso3) {
    const countries = [...AppState.data.countries].sort((a, b) => a.name.localeCompare(b.name));
    selectEl.innerHTML = countries.map((c) => `<option value="${c.iso3}" ${c.iso3 === selectedIso3 ? "selected" : ""}>${Utils.escapeHtml(c.name)}</option>`).join("");
  }

  function render(iso3) {
    const country = AppState.data.countriesByIso3[iso3];
    const summaryEl = Utils.$("#country-profile-summary");
    if (!country) {
      summaryEl.innerHTML = `<div class="state-block"><p>Select a country to view its profile.</p></div>`;
      return;
    }

    const records = AppState.data.covidByIso3[iso3] || [];
    const latest = records[records.length - 1];
    const vaxRecords = AppState.data.vaccinationByIso3[iso3] || [];
    const latestVax = vaxRecords[vaxRecords.length - 1];

    summaryEl.innerHTML = `
      <div class="country-header">
        <div class="flag-badge">${Utils.escapeHtml(country.iso2)}</div>
        <div>
          <h2>${Utils.escapeHtml(country.name)}</h2>
          <div class="text-faint">${Utils.escapeHtml(country.region)} &middot; ${Utils.escapeHtml(country.subregion)}</div>
        </div>
      </div>
      <div class="mt-16">
        <div class="country-stat-row"><span>Population</span><strong>${Utils.formatCompact(country.population)}</strong></div>
        <div class="country-stat-row"><span>Total Cases</span><strong>${Utils.formatNumber(latest && latest.total_cases)}</strong></div>
        <div class="country-stat-row"><span>Total Deaths</span><strong>${Utils.formatNumber(latest && latest.total_deaths)}</strong></div>
        <div class="country-stat-row"><span>Cases / Million</span><strong>${Utils.formatNumber(latest && latest.cases_per_million, 0)}</strong></div>
        <div class="country-stat-row"><span>Deaths / Million</span><strong>${Utils.formatNumber(latest && latest.deaths_per_million, 0)}</strong></div>
        <div class="country-stat-row"><span>Case Fatality Ratio</span><strong>${latest && latest.case_fatality_ratio != null ? Utils.formatPercent(latest.case_fatality_ratio, 2) : "—"}</strong></div>
        <div class="country-stat-row"><span>Vaccination Coverage</span><strong>${latestVax && latestVax.vaccination_pct != null ? Utils.formatPercent(latestVax.vaccination_pct) : "—"}</strong></div>
        <div class="country-stat-row"><span>Data as of</span><strong>${Utils.formatDate(latest && latest.date)}</strong></div>
      </div>
      <div id="country-insights" class="mt-16"></div>
    `;

    const insightsEl = Utils.$("#country-insights");
    if (insightsEl && global.Insights) {
      const items = Insights.countryInsights(iso3);
      insightsEl.innerHTML = items.length ? `
        <div class="panel-header" style="padding:0; border:none; margin-bottom:8px;"><h3>Automated Observations</h3></div>
        ${items.map((t) => `<div class="list-item"><div class="list-item-dot" style="background:var(--color-blue);"></div><div class="list-item-title" style="font-weight:400;">${Utils.escapeHtml(t)}</div></div>`).join("")}
      ` : "";
    }

    renderCharts(iso3, records, vaxRecords);
  }

  function renderCharts(iso3, records, vaxRecords) {
    const labels = records.map((r) => r.date);
    Charts.lineChart("chart-country-cases", labels, [{ label: "Total Cases", data: records.map((r) => r.total_cases), borderColor: Charts.THEME_COLORS().accent, fill: true, backgroundColor: "rgba(230,57,70,0.08)" }]);
    Charts.lineChart("chart-country-deaths", labels, [{ label: "Total Deaths", data: records.map((r) => r.total_deaths), borderColor: Charts.THEME_COLORS().purple }]);
    Charts.lineChart("chart-country-new-cases", labels, [{ label: "New Cases (7d avg)", data: records.map((r) => r.new_cases_ma7), borderColor: Charts.THEME_COLORS().blue, fill: true, backgroundColor: "rgba(76,201,240,0.1)" }]);

    const vaxLabels = vaxRecords.map((r) => r.date);
    Charts.lineChart("chart-country-vaccination", vaxLabels, [
      { label: "At least one dose", data: vaxRecords.map((r) => r.vaccination_pct), borderColor: Charts.THEME_COLORS().green },
      { label: "Fully vaccinated", data: vaxRecords.map((r) => r.full_vaccination_pct), borderColor: Charts.THEME_COLORS().teal }
    ]);
  }

  global.CountryPanel = { populateSelect, render };
})(window);
