// Shared data layer for the three Matrix directions. Everything shown comes from the live API; nothing is invented.
const API = "https://onyc-api.onrender.com/v1";

async function get(path) {
  const r = await fetch(`${API}/${path}`);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

/** "Source: OnRe core API (/data/nav) · updated 3 min ago" from a meta entry. */
function age(iso) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return `${Math.round(s)} s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
function source(meta, key) {
  const m = meta && (meta[key] || Object.values(meta)[0]);
  return m ? `Source: ${m.source} · updated ${age(m.fetchedAt)}` : "Source: ONyc Terminal API";
}

async function loadAll() {
  const [nav, market, flows, dist] = await Promise.all([
    get("nav?range=all"),
    get("market"),
    get("flows?range=1m"),
    get("capital/distribution"),
  ]);
  const series = nav.data.series.map((r) => ({ d: r.date, nav: r.nav, inc: r.incrementPpm }));
  const fl = flows.data.series;
  const sum = (k) => fl.reduce((a, r) => a + (r[k] || 0), 0);
  return {
    nav: { points: series, last: series[series.length - 1], first: series[0], events: nav.data.events || [], src: source(nav.meta, "series") },
    market: {
      points: market.data.history.map((h) => ({ t: h.t, bps: h.premiumBps, price: h.marketPrice, nav: h.nav })),
      bps: market.data.premiumBps,
      src: source(market.meta, "history"),
    },
    flows: {
      daily: fl.map((r) => ({ d: r.date, delta: r.deltaAum, supply: r.supply, nav: r.nav, aum: r.supply * r.nav })),
      steps: [
        { label: "NAV effect", v: sum("navEffect") },
        { label: "Flow effect", v: sum("flowEffect") },
        { label: "Residual", v: sum("residual") },
      ],
      delta: sum("deltaAum"),
      src: source(flows.meta, "series"),
    },
    dist: {
      rows: dist.data.distribution.map((d) => ({ name: d.protocol, usd: d.capitalUsd, share: d.share })),
      total: dist.data.totalAumUsd,
      src: source(dist.meta, "distribution"),
    },
  };
}

const fmt = {
  nav: (v, dp = 4) => v.toFixed(dp),
  usd: (v) => {
    const a = Math.abs(v), s = v < 0 ? "−" : "";
    return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s}$${(a / 1e3).toFixed(1)}K` : `${s}$${a.toFixed(0)}`;
  },
  bps: (v) => `${v < 0 ? "−" : v > 0 ? "+" : ""}${Math.abs(v).toFixed(1)} bps`,
  pct: (v, dp = 1) => `${(v * 100).toFixed(dp)}%`,
  date: (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
};

/** Shared page furniture: light/dark toggle (mono both ways), footer disclaimer. */
function themeToggle(btn) {
  const root = document.documentElement;
  const saved = (() => { try { return localStorage.getItem("lab-theme"); } catch { return null; } })();
  if (saved) root.dataset.theme = saved;
  const sync = () => { btn.textContent = root.dataset.theme === "dark" ? "LIGHT" : "DARK"; };
  btn.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("lab-theme", root.dataset.theme); } catch {}
    sync();
    document.dispatchEvent(new Event("themechange"));
  });
  sync();
}

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The six pages proposed for this version. */
const PAGES = ["Overview", "NAV & Peg", "Book", "Points & Wallets", "Risk & Health", "Alerts & API"];
