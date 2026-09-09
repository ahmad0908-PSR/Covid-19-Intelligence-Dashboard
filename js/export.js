/**
 * export.js
 * CSV export for the Data Explorer's currently filtered/sorted rows.
 * Generates the file entirely client-side (no backend) using a Blob
 * download, respecting the currently visible columns.
 */
(function (global) {
  "use strict";

  function toCSV(rows, columns) {
    const header = columns.map((c) => `"${c.label}"`).join(",");
    const lines = rows.map((r) => columns.map((c) => {
      const raw = r[c.key];
      const val = raw == null ? "" : String(raw);
      return `"${val.replace(/"/g, '""')}"`;
    }).join(","));
    return [header, ...lines].join("\n");
  }

  function downloadCSV(filename, rows, columns) {
    const csv = toCSV(rows, columns);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  global.ExportModule = { toCSV, downloadCSV };
})(window);
