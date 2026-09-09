/**
 * data-transformer.js
 * Joins the raw loaded JSON into indexed, calculation-enriched
 * structures on AppState.data. This runs once at boot; every other
 * module reads the already-enriched state instead of re-joining or
 * re-calculating on every render.
 */
(function (global) {
  "use strict";

  function transform(raw) {
    const { countries, covidDaily, vaccination, regions, population, sources, geojson } = raw;

    const countriesByIso3 = {};
    countries.forEach((c) => { countriesByIso3[c.iso3] = c; });

    // ---- COVID daily: group by country, sort by date, enrich ----
    const grouped = {};
    covidDaily.forEach((r) => {
      (grouped[r.iso3] = grouped[r.iso3] || []).push(r);
    });

    const covidByIso3 = {};
    const covidByIso3Date = {};
    const dateSet = new Set();

    Object.entries(grouped).forEach(([iso3, records]) => {
      records.sort((a, b) => a.date.localeCompare(b.date));
      const pop = population[iso3] || (countriesByIso3[iso3] && countriesByIso3[iso3].population) || null;

      const newCaseSeries = records.map((r) => ({ date: r.date, value: r.new_cases }));
      const newDeathSeries = records.map((r) => ({ date: r.date, value: r.new_deaths }));
      const ma7Cases = Calc.movingAverage(newCaseSeries, 7);
      const ma14Cases = Calc.movingAverage(newCaseSeries, 14);
      const ma7Deaths = Calc.movingAverage(newDeathSeries, 7);

      const enriched = records.map((r, i) => {
        const cases_per_million = pop ? Calc.perMillion(r.total_cases, pop) : null;
        const deaths_per_million = pop ? Calc.perMillion(r.total_deaths, pop) : null;
        const cases_per_100k = pop ? Calc.per100k(r.total_cases, pop) : null;
        const deaths_per_100k = pop ? Calc.per100k(r.total_deaths, pop) : null;
        const case_fatality_ratio = Calc.caseFatalityRatio(r.total_deaths, r.total_cases);
        return Object.assign({}, r, {
          cases_per_million, deaths_per_million, cases_per_100k, deaths_per_100k, case_fatality_ratio,
          new_cases_ma7: ma7Cases[i].value, new_cases_ma14: ma14Cases[i].value, new_deaths_ma7: ma7Deaths[i].value,
          weekly_change_pct: Calc.weeklyChange(newCaseSeries, i)
        });
      });

      covidByIso3[iso3] = enriched;
      covidByIso3Date[iso3] = {};
      enriched.forEach((r) => {
        covidByIso3Date[iso3][r.date] = r;
        dateSet.add(r.date);
      });
    });

    // ---- Vaccination: group by country, sort, enrich with coverage % ----
    const vaxGrouped = {};
    vaccination.forEach((r) => { (vaxGrouped[r.iso3] = vaxGrouped[r.iso3] || []).push(r); });
    const vaccinationByIso3 = {};
    Object.entries(vaxGrouped).forEach(([iso3, records]) => {
      records.sort((a, b) => a.date.localeCompare(b.date));
      const pop = population[iso3] || (countriesByIso3[iso3] && countriesByIso3[iso3].population) || null;
      vaccinationByIso3[iso3] = records.map((r) => Object.assign({}, r, {
        vaccination_pct: pop ? Calc.vaccinationCoverage(r.people_vaccinated, pop) : null,
        full_vaccination_pct: pop ? Calc.vaccinationCoverage(r.people_fully_vaccinated, pop) : null
      }));
    });

    const dates = Array.from(dateSet).sort();

    AppState.data = {
      countries, countriesByIso3, covidByIso3, covidByIso3Date, vaccinationByIso3,
      regions, population, geojson, sources, dates, quality: null
    };

    return AppState.data;
  }

  /** Finds the record for a country on-or-before the given date (handles gaps). */
  function recordOnOrBefore(iso3, isoDate) {
    const records = AppState.data.covidByIso3[iso3];
    if (!records || !records.length) return null;
    if (AppState.data.covidByIso3Date[iso3][isoDate]) return AppState.data.covidByIso3Date[iso3][isoDate];
    let lo = 0, hi = records.length - 1, best = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (records[mid].date <= isoDate) { best = records[mid]; lo = mid + 1; }
      else hi = mid - 1;
    }
    return best;
  }

  function vaccinationOnOrBefore(iso3, isoDate) {
    const records = AppState.data.vaccinationByIso3[iso3];
    if (!records || !records.length) return null;
    let best = null;
    for (const r of records) {
      if (r.date <= isoDate) best = r; else break;
    }
    return best;
  }

  /** Aggregates a metric across all countries (or a region) for a given date. Used for World/global KPIs. */
  function globalRecordForDate(isoDate, regionFilter) {
    const countries = AppState.data.countries.filter((c) => !regionFilter || regionFilter === "All" || c.region === regionFilter);
    let total_cases = 0, total_deaths = 0, new_cases = 0, new_deaths = 0, pop = 0, countedCountries = 0;
    countries.forEach((c) => {
      const r = recordOnOrBefore(c.iso3, isoDate);
      if (!r) return;
      total_cases += r.total_cases || 0;
      total_deaths += r.total_deaths || 0;
      if (r.date === isoDate) { new_cases += r.new_cases || 0; new_deaths += r.new_deaths || 0; }
      pop += c.population || 0;
      countedCountries++;
    });
    return {
      date: isoDate, total_cases, total_deaths, new_cases, new_deaths,
      cases_per_million: Calc.perMillion(total_cases, pop), deaths_per_million: Calc.perMillion(total_deaths, pop),
      case_fatality_ratio: Calc.caseFatalityRatio(total_deaths, total_cases),
      population: pop, countryCount: countedCountries
    };
  }

  function globalVaccinationForDate(isoDate, regionFilter) {
    const countries = AppState.data.countries.filter((c) => !regionFilter || regionFilter === "All" || c.region === regionFilter);
    let vaccinated = 0, pop = 0;
    countries.forEach((c) => {
      const r = vaccinationOnOrBefore(c.iso3, isoDate);
      if (r) vaccinated += r.people_vaccinated || 0;
      pop += c.population || 0;
    });
    return { people_vaccinated: vaccinated, population: pop, vaccination_pct: Calc.vaccinationCoverage(vaccinated, pop) };
  }

  global.DataTransformer = { transform, recordOnOrBefore, vaccinationOnOrBefore, globalRecordForDate, globalVaccinationForDate };
})(window);
