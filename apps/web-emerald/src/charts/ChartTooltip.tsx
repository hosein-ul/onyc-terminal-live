import { formatValue, tooltipHeading, type Unit } from "@onyc/chart-specs";

interface Entry {
  name?: string | number;
  value?: unknown;
  color?: string;
  dataKey?: string | number;
}

interface Props {
  active?: boolean;
  payload?: Entry[];
  label?: string | number;
  unit: Unit;
  /** Entries to hide, such as the helper series that draw a band. */
  hide?: string[];
  /** Label is a date (true) or free text. */
  dates?: boolean;
}

const asNumber = (v: unknown): number | null => (typeof v === "number" ? v : null);

/** White tooltip card, the tooltip of this app: label, then one row per series with a colour dot and the formatted value. */
export function ChartTooltip({ active, payload, label, unit, hide = [], dates = true }: Props) {
  if (active !== true || payload === undefined || payload.length === 0) return null;
  const rows = payload.filter(
    (p) => !hide.includes(String(p.dataKey ?? p.name)) && asNumber(p.value) !== null,
  );
  if (rows.length === 0) return null;
  const heading = dates && typeof label === "string" ? tooltipHeading(label) : String(label ?? "");
  return (
    <div className="ch-tip" role="status">
      <div className="ch-tip-label">{heading}</div>
      {rows.map((r) => (
        <div className="ch-tip-row" key={String(r.dataKey ?? r.name)}>
          <span className="ch-dot" style={{ background: r.color }} aria-hidden="true" />
          <span className="ch-tip-name">{String(r.name ?? r.dataKey)}</span>
          <span className="ch-tip-value">{formatValue(asNumber(r.value), unit)}</span>
        </div>
      ))}
    </div>
  );
}
