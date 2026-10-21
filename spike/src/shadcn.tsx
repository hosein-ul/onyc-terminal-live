/** shadcn/ui charts pattern: series colors exposed as CSS variables, drawn by Recharts. */
import { Area, AreaChart, CartesianGrid, Label, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CapitalData, NavData } from "./data";
import { nav6, usd } from "./tok";

const tipStyle = {
  background: "var(--tip-bg)",
  color: "var(--tip-ink)",
  border: "1px solid var(--line)",
  borderRadius: 14,
  padding: "8px 12px",
  font: "500 12px var(--font-ui)",
  boxShadow: "none",
};
const tick = { fill: "var(--muted)", fontSize: 11, fontFamily: "var(--font-mono)" };

export function ShadcnNav({ d }: { d: NavData }) {
  const s = d.series;
  const last = s[s.length - 1];
  const min = Math.min(...s.map((p) => p.nav));
  const max = Math.max(...s.map((p) => p.nav));
  const downs = d.events.filter((e) => e.reason === "downtick");
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={s} margin={{ top: 16, right: 56, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="navfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="date" tick={tick} tickLine={false} axisLine={false} minTickGap={48} tickFormatter={(v: string) => v.slice(0, 7)} />
        <YAxis domain={[min * 0.998, max * 1.002]} tick={tick} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => v.toFixed(2)} />
        <Tooltip contentStyle={tipStyle} formatter={(v: number) => [nav6(v), "NAV"]} cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }} />
        <Area
          dataKey="nav"
          type="monotone"
          stroke="var(--accent)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="url(#navfill)"
          dot={false}
          activeDot={{ r: 5, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
        {downs.map((e) => {
          const p = s.find((x) => x.date === e.date);
          return p ? <ReferenceDot key={e.date} x={e.date} y={p.nav} r={4} fill="var(--surface)" stroke="var(--bad)" strokeWidth={2} /> : null;
        })}
        {last && (
          <ReferenceDot x={last.date} y={last.nav} r={6} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2}>
            <Label value={nav6(last.nav)} position="right" offset={8} style={{ fill: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600 }} />
          </ReferenceDot>
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ShadcnCapital({ d }: { d: CapitalData }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={d.rows} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="date" tick={tick} tickLine={false} axisLine={false} minTickGap={48} tickFormatter={(v: string) => v.slice(5)} />
        <YAxis tick={tick} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => `${Math.round(v / 1e6)}M`} />
        <Tooltip contentStyle={tipStyle} formatter={(v: number, n: string) => [usd(v), n]} cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }} />
        {[...d.keys].reverse().map((k, i, all) => (
          <Area key={k} dataKey={k} stackId="1" type="monotone" stroke="var(--surface)" strokeWidth={1} fill={`var(--s${all.length - i})`} fillOpacity={0.92} isAnimationActive={false} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
