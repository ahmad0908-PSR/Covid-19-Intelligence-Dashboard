/**
 * insights.js
 * Generates simple, clearly-labeled "automated analytical observation"
 * text from the currently selected data -- never phrased as medical
 * or epidemiological conclusions, just descriptive comparisons of the
 * numbers already on screen.
 */
(function (global) {
  "use strict";

  function countryInsights(iso3) {
    const records = AppState.data.covidByIso3[iso3];
    if (!records || records.length < 14) return [];
    const out = [];
    const latest = records[records.length - 1];

    if (latest.weekly_change_pct != null) {
      if (latest.weekly_change_pct > 15) out.push(`New cases increased by ${latest.weekly_change_pct.toFixed(0)}% over the past 7 days compared to the prior week.`);
      else if (latest.weekly_change_pct < -15) out.push(`New cases decreased by ${Math.abs(latest.weekly_change_pct).toFixed(0)}% over the past 7 days compared to the prior week.`);
    }
    if (latest.case_fatality_ratio != null) {
      out.push(`The case fatality ratio based on cumulative reported figures is ${latest.case_fatality_ratio.toFixed(2)}%.`);
    }
    return out;
  }

  function comparisonInsights(iso3List, isoDate) {
    if (!iso3List || iso3List.length < 2) return [];
    const out = [];
    const rows = iso3List.map((iso3) => ({
      country: AppState.data.countriesByIso3[iso3],
      rec: DataTransformer.recordOnOrBefore(iso3, isoDate)
    })).filter((r) => r.rec);
    if (!rows.length) return out;

    const byCases = [...rows].sort((a, b) => (b.rec.total_cases || 0) - (a.rec.total_cases || 0));
    out.push(`${byCases[0].country.name} has the highest reported total cases among the selected countries.`);

    const byPerMillion = rows.filter((r) => r.rec.cases_per_million != null).sort((a, b) => b.rec.cases_per_million - a.rec.cases_per_million);
    if (byPerMillion.length) out.push(`${byPerMillion[0].country.name} has the highest cases per million among the selected countries.`);

    const byCfr = rows.filter((r) => r.rec.case_fatality_ratio != null).sort((a, b) => b.rec.case_fatality_ratio - a.rec.case_fatality_ratio);
    if (byCfr.length) out.push(`${byCfr[0].country.name} has the highest reported case fatality ratio among the selected countries.`);

    return out;
  }

  function regionInsights(isoDate) {
    const out = [];
    const regionStats = AppState.data.regions.map((r) => Object.assign({ region: r.name }, DataTransformer.globalRecordForDate(isoDate, r.name)));
    const byPerMillion = regionStats.filter((r) => r.cases_per_million != null).sort((a, b) => b.cases_per_million - a.cases_per_million);
    if (byPerMillion.length) out.push(`${byPerMillion[0].region} has the highest cases per million among all regions on the selected date.`);
    return out;
  }

  global.Insights = { countryInsights, comparisonInsights, regionInsights };
})(window);
