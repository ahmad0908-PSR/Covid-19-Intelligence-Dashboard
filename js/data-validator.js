/**
 * data-validator.js
 * Runs real checks against the loaded dataset and produces a data
 * quality score. Nothing here is a fixed/fake number -- every score
 * is computed from the actual records that were loaded.
 */
(function (global) {
  "use strict";

  const ISO3_RE = /^[A-Z]{3}$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function validate(raw) {
    const { countries, covidDaily, vaccination, population } = raw;
    const validIso3 = new Set(countries.map((c) => c.iso3));

    const seen = new Set();
    let duplicates = 0;
    covidDaily.forEach((r) => {
      const key = `${r.iso3}|${r.date}`;
      if (seen.has(key)) duplicates++;
      seen.add(key);
    });
    const uniquenessScore = covidDaily.length ? (1 - duplicates / covidDaily.length) * 100 : 100;

    let invalidRecords = 0;
    const validityIssues = [];
    covidDaily.forEach((r) => {
      const problems = [];
      if (!ISO3_RE.test(r.iso3) || !validIso3.has(r.iso3)) problems.push("invalid ISO3");
      if (!DATE_RE.test(r.date) || isNaN(new Date(r.date).getTime())) problems.push("invalid date");
      if (r.new_cases < 0) problems.push("negative new_cases");
      if (r.new_deaths < 0) problems.push("negative new_deaths");
      if (r.total_cases < 0) problems.push("negative total_cases");
      if (r.total_deaths < 0) problems.push("negative total_deaths");
      if (problems.length) {
        invalidRecords++;
        if (validityIssues.length < 25) validityIssues.push({ iso3: r.iso3, date: r.date, problems });
      }
    });
    const validityScore = covidDaily.length ? (1 - invalidRecords / covidDaily.length) * 100 : 100;

    let inconsistentRecords = 0;
    const consistencyIssues = [];
    covidDaily.forEach((r) => {
      const problems = [];
      if (r.total_deaths > r.total_cases) problems.push("deaths exceed cases");
      if (r.new_deaths > r.new_cases && r.new_cases >= 0) problems.push("new deaths exceed new cases");
      if (problems.length) {
        inconsistentRecords++;
        if (consistencyIssues.length < 25) consistencyIssues.push({ iso3: r.iso3, date: r.date, problems });
      }
    });
    vaccination.forEach((r) => {
      const pop = population[r.iso3];
      if (pop && r.people_vaccinated > pop) {
        inconsistentRecords++;
        if (consistencyIssues.length < 25) consistencyIssues.push({ iso3: r.iso3, date: r.date, problems: ["vaccinated exceeds population"] });
      }
    });
    const totalRecordsForConsistency = covidDaily.length + vaccination.length;
    const consistencyScore = totalRecordsForConsistency ? (1 - inconsistentRecords / totalRecordsForConsistency) * 100 : 100;

    const dates = Array.from(new Set(covidDaily.map((r) => r.date))).sort();
    const expectedCombos = countries.length * dates.length;
    const actualCombos = seen.size;
    const completenessScore = expectedCombos ? (actualCombos / expectedCombos) * 100 : 100;

    const overall = (completenessScore + validityScore + uniquenessScore + consistencyScore) / 4;

    return {
      overallScore: round1(overall),
      completeness: round1(completenessScore),
      validity: round1(validityScore),
      uniqueness: round1(uniquenessScore),
      consistency: round1(consistencyScore),
      counts: {
        totalRecords: covidDaily.length, duplicates, invalidRecords, inconsistentRecords,
        countries: countries.length, dateRange: dates.length ? [dates[0], dates[dates.length - 1]] : [null, null]
      },
      validityIssues, consistencyIssues
    };
  }

  function round1(n) {
    return Math.round(n * 100) / 100;
  }

  global.DataValidator = { validate };
})(window);
