/**
 * calculations.js
 * Every derived metric in the dashboard is computed here so the logic
 * exists in exactly one place. Every function is defensive: missing
 * population, zero denominators, and non-finite inputs all resolve to
 * `null` (never NaN/Infinity/undefined) so the UI can render "—".
 */
(function (global) {
  "use strict";

  function safeDiv(numerator, denominator) {
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
    const result = numerator / denominator;
    return Number.isFinite(result) ? result : null;
  }

  function perMillion(count, population) {
    const r = safeDiv(count, population);
    return r === null ? null : r * 1000000;
  }

  function per100k(count, population) {
    const r = safeDiv(count, population);
    return r === null ? null : r * 100000;
  }

  function caseFatalityRatio(totalDeaths, totalCases) {
    const r = safeDiv(totalDeaths, totalCases);
    return r === null ? null : r * 100;
  }

  function vaccinationCoverage(peopleVaccinated, population) {
    const r = safeDiv(peopleVaccinated, population);
    return r === null ? null : Math.min(r * 100, 100);
  }

  /**
   * @param {Array<{date:string, value:number}>} series sorted ascending by date
   * @param {number} windowSize
   * @returns {Array<{date:string, value:number|null}>}
   */
  function movingAverage(series, windowSize) {
    const out = [];
    for (let i = 0; i < series.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const slice = series.slice(start, i + 1).map((s) => s.value).filter((v) => Number.isFinite(v));
      const avg = slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
      out.push({ date: series[i].date, value: avg });
    }
    return out;
  }

  function percentChange(current, previous) {
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
    const result = ((current - previous) / Math.abs(previous)) * 100;
    return Number.isFinite(result) ? result : null;
  }

  function weeklyChange(series, index) {
    if (index < 7) return null;
    return percentChange(series[index].value, series[index - 7].value);
  }

  function monthlyChange(series, index) {
    if (index < 30) return null;
    return percentChange(series[index].value, series[index - 30].value);
  }

  function growthRate(current, previous) {
    return percentChange(current, previous);
  }

  global.Calc = {
    safeDiv, perMillion, per100k, caseFatalityRatio, vaccinationCoverage,
    movingAverage, percentChange, weeklyChange, monthlyChange, growthRate
  };
})(window);
