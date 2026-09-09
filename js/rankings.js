/**
 * rankings.js
 * Builds the Rankings view: a table of every country ranked by the
 * selected metric, with region filtering, search, and pagination.
 * "Largest recent increase/decrease" uses the precomputed
 * weekly_change_pct from data-transformer.js.
 */
(function (global) {
  "use strict";

  const PER_PAGE = 15;
  let state = { metric: "total_cases", region: "all", search: "", page: 1 };

  const METRIC_META = {
    total_cases: { label: "Total Cases", format: (v) => Utils.formatNumber(v) },
    total_deaths: { label: "Total Deaths", format: (v) => Utils.formatNumber(v) },
    cases_per_million: { label: "Cases / Million", format: (v) => Utils.formatNumber(v, 0) },
    deaths_per_million: { label: "Deaths / Million", format: (v) => Utils.formatNumber(v, 0) },
    vaccination_pct: { label: "Vaccination %", format: (v) => Utils.formatPercent(v) },
    recent_increase: { label: "Weekly Change %", format: (v) => (v == null ? "—" : `+${v.toFixed(1)}%`) },
    recent_decrease: { label: "Weekly Change %", format: (v) => (v == null ? "—" : `${v.toFixed(1)}%`) }
  };

  function valueFor(country, metric, isoDate) {
    if (metric === "vaccination_pct") {
      const v = DataTransformer.vaccinationOnOrBefore(country.iso3, isoDate);
      return v ? v.vaccination_pct : null;
    }
    const r = DataTransformer.recordOnOrBefore(country.iso3, isoDate);
    if (!r) return null;
    if (metric === "recent_increase" || metric === "recent_decrease") return r.weekly_change_pct;
    return r[metric];
  }

  function populateRegionFilter(selectEl) {
    const regions = AppState.data.regions.map((r) => r.name);
    selectEl.innerHTML = `<option value="all">All Regions</option>` + regions.map((r) => `<option value="${r}">${r}</option>`).join("");
  }

  function setMetric(metric) { state.metric = metric; state.page = 1; render(); }
  function setRegion(region) { state.region = region; state.page = 1; render(); }
  function setSearch(search) { state.search = search; state.page = 1; render(); }
  function setPage(page) { state.page = page; render(); }

  function render() {
    const isoDate = AppState.filters.date;
    const meta = METRIC_META[state.metric];
    let list = Filters.filterCountries(AppState.data.countries, { region: state.region, search: state.search });

    let ranked = list.map((c) => ({ country: c, value: valueFor(c, state.metric, isoDate) }));
    ranked = ranked.filter((r) => r.value != null);
    ranked.sort((a, b) => (state.metric === "recent_decrease" ? a.value - b.value : b.value - a.value));

    const paged = Filters.paginate(ranked, state.page, PER_PAGE);
    const pageItems = paged.pageItems, totalPages = paged.totalPages, page = paged.page, total = paged.total;
    state.page = page;

    const table = Utils.$("#rankings-table");
    table.innerHTML = `
      <thead><tr><th>Rank</th><th>Country</th><th>Region</th><th>${meta.label}</th><th>Weekly Change</th></tr></thead>
      <tbody>
        ${pageItems.map((r, i) => {
          const rank = (page - 1) * PER_PAGE + i + 1;
          const rec = DataTransformer.recordOnOrBefore(r.country.iso3, isoDate);
          const change = rec ? rec.weekly_change_pct : null;
          const changeColor = change != null ? (change > 5 ? "color:var(--color-accent);" : change < -5 ? "color:var(--color-green);" : "") : "";
          return `
            <tr>
              <td class="rank-cell">#${rank}</td>
              <td class="country-cell"><span class="country-flag-dot"></span>${Utils.escapeHtml(r.country.name)}</td>
              <td class="text-faint">${Utils.escapeHtml(r.country.region)}</td>
              <td class="tabular">${meta.format(r.value)}</td>
              <td class="tabular" style="${changeColor}">${change != null ? `${change > 0 ? "+" : ""}${change.toFixed(1)}%` : "—"}</td>
            </tr>
          `;
        }).join("") || `<tr><td colspan="5" class="text-faint" style="text-align:center; padding:30px;">No countries match this filter.</td></tr>`}
      </tbody>
    `;

    Utils.$("#ranking-results-count").textContent = `${total} countries`;
    renderPagination(totalPages, page);
  }

  function renderPagination(totalPages, page) {
    const wrap = Utils.$("#rankings-pagination");
    wrap.innerHTML = "";
    if (totalPages <= 1) return;
    for (let i = 1; i <= totalPages; i++) {
      const btn = Utils.el("button", { class: `btn btn-sm ${i === page ? "btn-primary" : ""}`, onclick: () => setPage(i) }, [String(i)]);
      wrap.appendChild(btn);
    }
  }

  global.Rankings = { populateRegionFilter, setMetric, setRegion, setSearch, render, METRIC_META };
})(window);
