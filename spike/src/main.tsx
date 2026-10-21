import "@fontsource/figtree/400.css";
import "@fontsource/figtree/600.css";
import "@fontsource/figtree/700.css";
import "@fontsource/outfit/300.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/600.css";
import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "../tokens/calm.css";
import "../tokens/platinum.css";
import "./spike.css";
import { ApexCapital, ApexNav } from "./apex";
import { loadCapital, loadNav, type CapitalData, type NavData } from "./data";
import { EchartsCapital, EchartsNav } from "./ech";
import { ShadcnCapital, ShadcnNav } from "./shadcn";
import { TremorCapital, TremorNav } from "./tremor";

function Cell({ lib, kind, children }: { lib: string; kind: string; children: ReactNode }) {
  return (
    <section className="cell">
      <header>
        <b>{lib}</b>
        <span>{kind}</span>
      </header>
      <div className="plot">{children}</div>
    </section>
  );
}

function App() {
  const skin = new URLSearchParams(location.search).get("skin") === "platinum" ? "platinum" : "calm";
  const [nav, setNav] = useState<NavData | null>(null);
  const [cap, setCap] = useState<CapitalData | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    document.body.dataset["skin"] = skin;
    Promise.all([loadNav(), loadCapital()]).then(([n, c]) => { setNav(n); setCap(c); }, (e: unknown) => setErr(String(e)));
  }, [skin]);
  if (err) return <p>{err}</p>;
  if (!nav || !cap) return <p>Loading</p>;
  return (
    <div data-skin={skin} className="page">
      <h1>Chart spike · {skin} skin</h1>
      <p className="src">NAV: {nav.source} · {nav.fetchedAt} · Capital: {cap.source} · {cap.fetchedAt}</p>
      <div className="grid">
        <Cell lib="shadcn/ui charts (Recharts 3)" kind="NAV"><ShadcnNav d={nav} /></Cell>
        <Cell lib="Tremor 3 (Recharts 2)" kind="NAV"><TremorNav d={nav} /></Cell>
        <Cell lib="ApexCharts 5" kind="NAV"><ApexNav d={nav} /></Cell>
        <Cell lib="ECharts 6" kind="NAV"><EchartsNav d={nav} /></Cell>
        <Cell lib="shadcn/ui charts (Recharts 3)" kind="Capital stacked area"><ShadcnCapital d={cap} /></Cell>
        <Cell lib="Tremor 3 (Recharts 2)" kind="Capital stacked area"><TremorCapital d={cap} /></Cell>
        <Cell lib="ApexCharts 5" kind="Capital stacked area"><ApexCapital d={cap} /></Cell>
        <Cell lib="ECharts 6" kind="Capital stacked area"><EchartsCapital d={cap} /></Cell>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
