/**
 * filters.js
 * Centralized filtering so rankings.js, data-table.js, and trends
 * logic in app.js all share one implementation instead of each
 * re-inventing region/search/date filtering.
 */
(function (global) {
  "use strict";

  function filterCountries(countries, opts) {
    opts = opts || {};
    let list = countries;
    if (opts.region && opts.region !== "all" && opts.region !== "All") list = list.filter((c) => c.region === opts.region);
    if (opts.search) {
      const term = opts.search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(term) || c.iso3.toLowerCase().includes(term) || c.iso2.toLowerCase().includes(term));
    }
    return list;
  }

  function sortBy(list, keyFn, direction) {
    const dir = direction === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = keyFn(a), vb = keyFn(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string") return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });
  }

  function paginate(list, page, perPage) {
    const totalPages = Math.max(Math.ceil(list.length / perPage), 1);
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const start = (safePage - 1) * perPage;
    return { pageItems: list.slice(start, start + perPage), totalPages, page: safePage, total: list.length };
  }

  function dateRange(dates, startDate, endDate) {
    return dates.filter((d) => (!startDate || d >= startDate) && (!endDate || d <= endDate));
  }

  function aggregateSeries(records, field, aggregation) {
    if (aggregation === "daily" || !aggregation) return records.map((r) => ({ date: r.date, value: r[field] }));
    const buckets = {};
    records.forEach((r) => {
      const key = aggregation === "weekly" ? isoWeekKey(r.date) : r.date.slice(0, 7);
      if (!buckets[key]) buckets[key] = { sum: 0, count: 0, lastDate: r.date };
      const v = Utils.safeNumber(r[field], 0);
      buckets[key].sum += v;
      buckets[key].count++;
      buckets[key].lastDate = r.date;
    });
    return Object.entries(buckets).map(([key, b]) => ({ date: b.lastDate, label: key, value: b.sum }));
  }

  function isoWeekKey(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
  }

  global.Filters = { filterCountries, sortBy, paginate, dateRange, aggregateSeries };
})(window);
