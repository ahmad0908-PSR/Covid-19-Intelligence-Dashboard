/**
 * data-table.js
 * The Data Explorer: a flat, sortable, filterable, paginated view of
 * every daily record (all countries x all dates), joined with region
 * and vaccination coverage. Built once into a flat row cache at init
 * so repeated filtering/sorting/pagination doesn't re-join on every
 * keystroke.
 */
(function (global) {
  "use strict";

  const PER_PAGE = 25;
  let flatRows = [];
  let state = { search: "", region: "all", country: "all", sortKey: "date", sortDir: "desc", page: 1 };
  const ALL_COLUMNS = [
    { key: "date", label: "Date", format: (v) => Utils.formatDate(v, { year: "numeric", month: "short", day: "numeric" }) },
    { key: "country", label: "Country", format: (v) => v },
    { key: "region", label: "Region", format: (v) => v },
    { key: "new_cases", label: "New Cases", format: (v) => Utils.formatNumber(v) },
    { key: "total_cases", label: "Total Cases", format: (v) => Utils.formatNumber(v) },
    { key: "new_deaths", label: "New Deaths", format: (v) => Utils.formatNumber(v) },
    { key: "total_deaths", label: "Total Deaths", format: (v) => Utils.formatNumber(v) },
    { key: "cases_per_million", label: "Cases / Million", format: (v) => Utils.formatNumber(v, 0) },
    { key: "deaths_per_million", label: "Deaths / Million", format: (v) => Utils.formatNumber(v, 0) },
    { key: "vaccination_pct", label: "Vaccination %", format: (v) => (v == null ? "—" : Utils.formatPercent(v)) }
  ];
  let visibleColumns = new Set(ALL_COLUMNS.map((c) => c.key));

  function buildFlatRows() {
    flatRows = [];
    AppState.data.countries.forEach((c) => {
      const records = AppState.data.covidByIso3[c.iso3] || [];
      records.forEach((r) => {
        const vax = DataTransformer.vaccinationOnOrBefore(c.iso3, r.date);
        flatRows.push({
          date: r.date, iso3: c.iso3, country: c.name, region: c.region,
          new_cases: r.new_cases, total_cases: r.total_cases, new_deaths: r.new_deaths, total_deaths: r.total_deaths,
          cases_per_million: r.cases_per_million, deaths_per_million: r.deaths_per_million,
          vaccination_pct: vax ? vax.vaccination_pct : null
        });
      });
    });
  }

  function populateFilters() {
    const regionSel = Utils.$("#explorer-region-filter");
    const countrySel = Utils.$("#explorer-country-filter");
    regionSel.innerHTML = `<option value="all">All Regions</option>` + AppState.data.regions.map((r) => `<option value="${r.name}">${r.name}</option>`).join("");
    const countries = [...AppState.data.countries].sort((a, b) => a.name.localeCompare(b.name));
    countrySel.innerHTML = `<option value="all">All Countries</option>` + countries.map((c) => `<option value="${c.iso3}">${Utils.escapeHtml(c.name)}</option>`).join("");

    const colList = Utils.$("#explorer-columns-list");
    colList.innerHTML = ALL_COLUMNS.map((c) => `
      <label><input type="checkbox" data-col="${c.key}" ${visibleColumns.has(c.key) ? "checked" : ""} /> ${c.label}</label>
    `).join("");
    colList.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", () => {
        if (cb.checked) visibleColumns.add(cb.dataset.col); else visibleColumns.delete(cb.dataset.col);
        render();
      });
    });
  }

  function filteredSorted() {
    let rows = flatRows;
    if (state.region !== "all") rows = rows.filter((r) => r.region === state.region);
    if (state.country !== "all") rows = rows.filter((r) => r.iso3 === state.country);
    if (state.search) {
      const term = state.search.toLowerCase();
      rows = rows.filter((r) => r.country.toLowerCase().includes(term) || r.iso3.toLowerCase().includes(term));
    }
    return Filters.sortBy(rows, (r) => r[state.sortKey], state.sortDir);
  }

  function render() {
    const rows = filteredSorted();
    const paged = Filters.paginate(rows, state.page, PER_PAGE);
    state.page = paged.page;
    const cols = ALL_COLUMNS.filter((c) => visibleColumns.has(c.key));

    const table = Utils.$("#explorer-table");
    table.innerHTML = `
      <thead><tr>${cols.map((c) => `<th data-sort="${c.key}">${c.label}${state.sortKey === c.key ? (state.sortDir === "asc" ? " \u25B2" : " \u25BC") : ""}</th>`).join("")}</tr></thead>
      <tbody>
        ${paged.pageItems.map((r) => `<tr>${cols.map((c) => `<td>${c.format(r[c.key])}</td>`).join("")}</tr>`).join("") ||
          `<tr><td colspan="${cols.length}" class="text-faint" style="text-align:center; padding:30px;">No records match this filter.</td></tr>`}
      </tbody>
    `;
    table.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      else { state.sortKey = key; state.sortDir = "desc"; }
      render();
    }));

    renderPagination(paged.totalPages, paged.page, paged.total);
  }

  function renderPagination(totalPages, page, total) {
    const wrap = Utils.$("#explorer-pagination");
    wrap.innerHTML = "";
    const info = Utils.el("span", { class: "text-faint" }, [`${Utils.formatNumber(total)} records`]);
    wrap.appendChild(info);
    const maxButtons = 7;
    let startPage = Math.max(1, page - 3);
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    startPage = Math.max(1, endPage - maxButtons + 1);
    for (let i = startPage; i <= endPage; i++) {
      wrap.appendChild(Utils.el("button", { class: `btn btn-sm ${i === page ? "btn-primary" : ""}`, onclick: () => { state.page = i; render(); } }, [String(i)]));
    }
  }

  function setSearch(v) { state.search = v; state.page = 1; render(); }
  function setRegion(v) { state.region = v; state.page = 1; render(); }
  function setCountry(v) { state.country = v; state.page = 1; render(); }
  function resetFilters() {
    state = { search: "", region: "all", country: "all", sortKey: "date", sortDir: "desc", page: 1 };
    visibleColumns = new Set(ALL_COLUMNS.map((c) => c.key));
    Utils.$("#explorer-search").value = "";
    Utils.$("#explorer-region-filter").value = "all";
    Utils.$("#explorer-country-filter").value = "all";
    populateFilters();
    render();
  }
  function getFilteredRows() { return filteredSorted(); }
  function getVisibleColumns() { return ALL_COLUMNS.filter((c) => visibleColumns.has(c.key)); }

  global.DataTable = { buildFlatRows, populateFilters, render, setSearch, setRegion, setCountry, resetFilters, getFilteredRows, getVisibleColumns, ALL_COLUMNS };
})(window);
