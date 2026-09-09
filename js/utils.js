/**
 * utils.js
 * Small, dependency-free helpers shared across every module: number
 * formatting, date handling, DOM shortcuts, and debouncing. Every
 * formatter here guards against NaN/Infinity/undefined so the UI can
 * never render a broken value.
 */
(function (global) {
  "use strict";

  function safeNumber(value, fallback) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
    return fallback !== undefined ? fallback : 0;
  }

  function formatNumber(value, decimals) {
    const n = safeNumber(value, null);
    if (n === null) return "—";
    return n.toLocaleString("en-US", { maximumFractionDigits: decimals ?? 0, minimumFractionDigits: 0 });
  }

  function formatCompact(value) {
    const n = safeNumber(value, null);
    if (n === null) return "—";
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  }

  function formatPercent(value, decimals) {
    const n = safeNumber(value, null);
    if (n === null) return "—";
    return `${n.toFixed(decimals ?? 1)}%`;
  }

  function formatDate(isoString, opts) {
    if (!isoString) return "—";
    const d = new Date(isoString + "T00:00:00");
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString("en-US", opts || { year: "numeric", month: "short", day: "numeric" });
  }

  function addDays(isoString, days) {
    const d = new Date(isoString + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function dayDiff(isoA, isoB) {
    const a = new Date(isoA + "T00:00:00");
    const b = new Date(isoB + "T00:00:00");
    return Math.round((a - b) / 86400000);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay ?? 250);
    };
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }
  function $all(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    (children || []).forEach((c) => node.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return node;
  }

  function toast(message, type) {
    let container = document.getElementById("toast-container");
    if (!container) return;
    const t = el("div", { class: "toast" }, [message]);
    if (type === "error") t.style.borderColor = "var(--color-accent)";
    container.appendChild(t);
    setTimeout(() => {
      t.style.transition = "opacity 0.2s ease";
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 200);
    }, 3200);
  }

  global.Utils = {
    safeNumber, formatNumber, formatCompact, formatPercent, formatDate,
    addDays, dayDiff, clamp, debounce, escapeHtml, $, $all, el, toast
  };
})(window);
