/**
 * charts.js
 * Chart.js chart builders. Every chart instance is tracked in a
 * registry keyed by canvas id and destroyed before being recreated,
 * so switching views or filters never leaks chart instances or
 * silently stacks duplicate charts on the same canvas.
 */
(function (global) {
  "use strict";

  const registry = {};
  const THEME_COLORS = () => {
    const dark = document.body.getAttribute("data-theme") !== "light";
    return {
      grid: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
      text: dark ? "#A6ADBB" : "#565E6C",
      accent: "#E63946", blue: "#4CC9F0", teal: "#2EC4B6", amber: "#F4A62A", purple: "#9B7EDE", green: "#4ADE80"
    };
  };

  function destroy(canvasId) {
    if (registry[canvasId]) { registry[canvasId].destroy(); delete registry[canvasId]; }
  }

  function baseOptions(extra) {
    const c = THEME_COLORS();
    return Object.assign({
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: "#1E2229", titleColor: "#ECEEF1", bodyColor: "#A6ADBB", borderColor: "#2E333D", borderWidth: 1, padding: 10 }
      },
      scales: {
        x: { grid: { color: c.grid }, ticks: { color: c.text, maxRotation: 0, autoSkip: true, font: { size: 10 } } },
        y: { grid: { color: c.grid }, ticks: { color: c.text, font: { size: 10 }, callback: (v) => Utils.formatCompact(v) }, beginAtZero: true }
      }
    }, extra || {});
  }

  function lineChart(canvasId, labels, datasets, opts) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    if (!labels.length) { showEmpty(ctx); return null; }
    hideEmpty(ctx);
    registry[canvasId] = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: datasets.map((d) => Object.assign({ tension: 0.3, pointRadius: 0, borderWidth: 2, fill: d.fill != null ? d.fill : false }, d)) },
      options: baseOptions(opts)
    });
    return registry[canvasId];
  }

  function barChart(canvasId, labels, dataset, opts) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    if (!labels.length) { showEmpty(ctx); return null; }
    hideEmpty(ctx);
    const c = THEME_COLORS();
    registry[canvasId] = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [Object.assign({ backgroundColor: c.blue, borderRadius: 4, maxBarThickness: 36 }, dataset)] },
      options: baseOptions(opts)
    });
    return registry[canvasId];
  }

  function multiBarChart(canvasId, labels, datasets, opts) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    if (!labels.length) { showEmpty(ctx); return null; }
    hideEmpty(ctx);
    const legendOpts = { legend: { display: true, labels: { color: THEME_COLORS().text, font: { size: 10.5 }, boxWidth: 10 } } };
    registry[canvasId] = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: datasets.map((d) => Object.assign({ borderRadius: 3, maxBarThickness: 26 }, d)) },
      options: baseOptions({ plugins: Object.assign({}, baseOptions().plugins, legendOpts) })
    });
    return registry[canvasId];
  }

  function showEmpty(canvas) {
    canvas.style.display = "none";
    let empty = canvas.parentElement.querySelector(".chart-empty-state");
    if (!empty) {
      empty = Utils.el("div", { class: "state-block chart-empty-state" }, ["No data available for this selection."]);
      canvas.parentElement.appendChild(empty);
    }
    empty.style.display = "flex";
  }
  function hideEmpty(canvas) {
    canvas.style.display = "block";
    const empty = canvas.parentElement.querySelector(".chart-empty-state");
    if (empty) empty.style.display = "none";
  }

  global.Charts = { lineChart, barChart, multiBarChart, destroy, THEME_COLORS };
})(window);
