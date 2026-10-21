import { footerText, specToCsv, specToTable, formatValue, type ChartSpec } from "@onyc/chart-specs";
import { saveText, svgToPng, saveBlob } from "@onyc/chart-specs/dom";
import { Download, Table2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export const RANGES = ["1w", "1m", "3m", "1y", "all"] as const;
export type RangeKey = (typeof RANGES)[number];

export type FrameStatus = "loading" | "ready" | "error";

interface Props {
  spec: ChartSpec | null;
  status?: FrameStatus;
  /** What failed, shown when status is "error"; the last good chart stays visible beneath it. */
  error?: string | undefined;
  /** Title to show while loading, before a spec exists. */
  loadingTitle?: string;
  range?: RangeKey;
  onRange?: (r: RangeKey) => void;
  /** Heights of the skeleton, to match the final chart. */
  height?: number;
  /** Draw without the card, for a chart that sits inside a card of its own (the hero). */
  plain?: boolean;
  /** Hide the title when the surrounding card already names the chart. */
  hideTitle?: boolean;
  children: ReactNode;
}

function useNow(everyMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

function DataTable({ spec }: { spec: ChartSpec }) {
  const table = specToTable(spec);
  return (
    <div
      className="ch-table-wrap"
      tabIndex={0}
      role="region"
      aria-label={`${spec.title}, data table`}
    >
      <table className="ch-table">
        <caption className="sr-only">{spec.title}</caption>
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={c.label + i} scope="col" className={i === 0 ? undefined : "num"}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) => (
                <td
                  key={i}
                  className={i === 0 ? undefined : typeof cell === "number" ? "num" : undefined}
                >
                  {typeof cell === "number"
                    ? formatValue(cell, table.columns[i]?.unit ?? "ratio")
                    : (cell ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The card every chart sits in: title, range control, table toggle, export menu, the source and age footer and the
 * loading, empty, stale and error states.
 */
export function ChartFrame({
  spec,
  status = "ready",
  error,
  loadingTitle,
  range,
  onRange,
  height = 300,
  plain = false,
  hideTitle = false,
  children,
}: Props) {
  const [asTable, setAsTable] = useState(false);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const now = useNow(30_000);

  const exportPng = async (): Promise<void> => {
    if (spec === null) return;
    const svgs = Array.from(body.current?.querySelectorAll("svg") ?? []);
    const svg = svgs.find((s) => s.getBoundingClientRect().width > 120);
    if (svg === undefined) {
      setBusy("PNG export is not available for this chart; use CSV.");
      return;
    }
    const surface = getComputedStyle(document.documentElement)
      .getPropertyValue("--chart-surface")
      .trim();
    const blob = await svgToPng(svg, { background: surface, fontFamilies: ["Figtree"] });
    saveBlob(`${spec.id}.png`, blob);
    setBusy(null);
  };

  const title = spec?.title ?? loadingTitle ?? "";
  const showEmpty = spec?.empty !== undefined;

  return (
    <section
      className={`ch-frame ${plain ? "ch-plain" : ""}`}
      aria-busy={status === "loading"}
      aria-label={title}
    >
      <header className="ch-head">
        <div>
          <h3 className={hideTitle ? "sr-only" : "ch-title"}>{title}</h3>
          {!hideTitle && spec?.subtitle !== undefined && <p className="ch-sub">{spec.subtitle}</p>}
        </div>
        <div className="ch-actions">
          {range !== undefined && onRange !== undefined && (
            <div className="ch-range" role="group" aria-label="Range">
              {RANGES.map((r) => (
                <button key={r} type="button" aria-pressed={range === r} onClick={() => onRange(r)}>
                  {r === "all" ? "ALL" : r.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          {spec !== null && !showEmpty && (
            <>
              <button
                type="button"
                className="ch-icon"
                aria-pressed={asTable}
                onClick={() => setAsTable((v) => !v)}
                title="Show as table"
              >
                <Table2 size={18} strokeWidth={1.75} aria-hidden="true" />
                <span className="sr-only">Show as table</span>
              </button>
              <div className="ch-menu-wrap">
                <button
                  type="button"
                  className="ch-icon"
                  aria-expanded={menu}
                  aria-controls={menuId}
                  onClick={() => setMenu((v) => !v)}
                  title="Export"
                >
                  <Download size={18} strokeWidth={1.75} aria-hidden="true" />
                  <span className="sr-only">Export</span>
                </button>
                {menu && (
                  <div className="ch-menu" id={menuId} role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenu(false);
                        void exportPng();
                      }}
                    >
                      Download PNG
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenu(false);
                        saveText(`${spec.id}.csv`, specToCsv(spec));
                      }}
                    >
                      Download CSV
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {status === "error" && (
        <p className="ch-banner ch-banner-bad" role="alert">
          {error ?? "This data could not be loaded."}
          {spec !== null ? " Showing the last good values." : ""}
        </p>
      )}
      {busy !== null && (
        <p className="ch-banner" role="status">
          {busy}
        </p>
      )}

      <div ref={body} className="ch-body" style={{ minHeight: asTable ? undefined : height }}>
        {status === "loading" && spec === null ? (
          <div className="ch-skeleton" style={{ height }} aria-hidden="true">
            {Array.from({ length: 24 }, (_, i) => (
              <span key={i} style={{ height: `${28 + ((i * 37) % 55)}%` }} />
            ))}
          </div>
        ) : spec === null ? (
          <p className="ch-empty">Nothing to show yet.</p>
        ) : showEmpty ? (
          <p className="ch-empty">{spec.empty}</p>
        ) : asTable ? (
          <DataTable spec={spec} />
        ) : (
          children
        )}
      </div>

      {spec !== null && (
        <footer className="ch-foot">
          <span className={spec.provenance.stale ? "ch-stale" : undefined}>
            {footerText(spec.provenance, now)}
            {spec.provenance.stale ? " · stale" : ""}
          </span>
          {spec.note !== undefined && <span className="ch-note">{spec.note}</span>}
        </footer>
      )}
    </section>
  );
}
