import type { ApexOptions } from "apexcharts";
import ReactApexChart from "react-apexcharts";
import type { CapitalData, NavData } from "./data";
import { nav6, tok, usd } from "./tok";

function base(t: Record<string, string>): ApexOptions {
  return {
    chart: {
      toolbar: { show: false },
      animations: { enabled: false },
      background: "transparent",
      fontFamily: t["font-mono"],
      foreColor: t["muted"],
      zoom: { enabled: false },
    },
    grid: { borderColor: t["grid"], strokeDashArray: 0, xaxis: { lines: { show: false } }, padding: { left: 4, right: 12 } },
    xaxis: {
      type: "datetime",
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { fontSize: "11px", colors: t["muted"] }, datetimeUTC: true },
    },
    tooltip: { theme: "light", style: { fontSize: "12px", fontFamily: t["font-ui"] } },
    dataLabels: { enabled: false },
  };
}

export function ApexNav({ d }: { d: NavData }) {
  const t = tok();
  const s = d.series;
  const last = s[s.length - 1]!;
  const o: ApexOptions = {
    ...base(t),
    stroke: { curve: "smooth", width: Number(t["stroke"]), lineCap: "round" },
    colors: [t["accent"]!],
    fill: { type: "gradient", gradient: { shadeIntensity: 0, opacityFrom: 0.22, opacityTo: 0, stops: [0, 100] } },
    yaxis: {
      min: Math.min(...s.map((p) => p.nav)) * 0.998,
      max: Math.max(...s.map((p) => p.nav)) * 1.002,
      tickAmount: 4,
      labels: { formatter: (v: number) => v.toFixed(2), style: { colors: t["muted"], fontSize: "11px" } },
    },
    annotations: {
      points: [
        ...d.events
          .filter((e) => e.reason === "downtick")
          .map((e) => ({
            x: Date.parse(e.date),
            y: s.find((p) => p.date === e.date)?.nav ?? 0,
            marker: { size: 4, fillColor: t["surface"], strokeColor: t["bad"], strokeWidth: 2 },
          })),
        {
          x: Date.parse(last.date),
          y: last.nav,
          marker: { size: 6, fillColor: t["accent"], strokeColor: t["surface"], strokeWidth: 2 },
          label: {
            text: nav6(last.nav),
            offsetX: -8,
            offsetY: -2,
            borderWidth: 0,
            style: { background: "transparent", color: t["ink"], fontFamily: t["font-mono"], fontSize: "12px", fontWeight: 600 },
          },
        },
      ],
    },
    tooltip: { ...base(t).tooltip, y: { formatter: nav6 }, x: { format: "dd MMM yyyy" } },
  };
  return <ReactApexChart type="area" height="100%" options={o} series={[{ name: "NAV", data: s.map((p) => [Date.parse(p.date), p.nav]) }]} />;
}

export function ApexCapital({ d }: { d: CapitalData }) {
  const t = tok();
  const keys = [...d.keys].reverse();
  const o: ApexOptions = {
    ...base(t),
    chart: { ...base(t).chart, stacked: true },
    colors: keys.map((_, i) => t[`s${keys.length - i}`]!),
    stroke: { curve: "smooth", width: 1, colors: [t["surface"]!] },
    fill: { type: "solid", opacity: 0.92 },
    legend: { show: false },
    yaxis: { labels: { formatter: (v: number) => `${Math.round(v / 1e6)}M`, style: { colors: t["muted"], fontSize: "11px" } } },
    tooltip: { ...base(t).tooltip, shared: true, y: { formatter: usd } },
  };
  return (
    <ReactApexChart
      type="area"
      height="100%"
      options={o}
      series={keys.map((k) => ({ name: k, data: d.rows.map((r) => [Date.parse(r.date), Number(r[k])]) }))}
    />
  );
}
