import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";

export interface Column<R> {
  key: string;
  header: string;
  align?: "left" | "right";
  cell: (row: R) => ReactNode;
  /** Value to sort by; omit to make the column unsortable. */
  sort?: (row: R) => number | string | null;
  /** Hidden on narrow screens. */
  wide?: boolean;
}

interface Props<R> {
  caption: string;
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R) => string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  /** Adds a search box; the function says whether a row matches the typed text. */
  search?: { placeholder: string; match: (row: R, q: string) => boolean };
  /** Show this many rows, then a "Show more" button. */
  pageSize?: number;
  empty?: string;
  /** Rows can expand to show more detail. */
  expanded?: (row: R) => ReactNode;
  footer?: ReactNode;
}

const compare = (a: number | string, b: number | string): number =>
  typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a).localeCompare(String(b), "en", { numeric: true });

/** A sortable, searchable table. Numbers right-aligned in tabular figures; sortable headers are real buttons. */
export function DataTable<R>({
  caption,
  columns,
  rows,
  rowKey,
  initialSort,
  search,
  pageSize,
  empty = "No rows.",
  expanded,
  footer,
}: Props<R>) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(pageSize ?? Infinity);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const view = useMemo(() => {
    let out = rows;
    if (search !== undefined && q.trim() !== "") {
      out = out.filter((r) => search.match(r, q.trim().toLowerCase()));
    }
    const col = columns.find((c) => c.key === sort?.key);
    if (col?.sort !== undefined && sort !== null) {
      const get = col.sort;
      const dir = sort.dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        const x = get(a);
        const y = get(b);
        // Missing values stay last in both directions.
        if (x === null && y === null) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        return dir * compare(x, y);
      });
    }
    return out;
  }, [rows, q, sort, columns, search]);

  const toggleSort = (key: string): void =>
    setSort((s) =>
      s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" },
    );

  const toggleOpen = (id: string): void =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="dt">
      {search !== undefined && (
        <label className="dt-search">
          <Search size={16} strokeWidth={1.75} aria-hidden="true" />
          <input
            type="search"
            value={q}
            placeholder={search.placeholder}
            aria-label={search.placeholder}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="dt-count">
            {view.length} of {rows.length}
          </span>
        </label>
      )}
      <div className="dt-wrap" tabIndex={0} role="region" aria-label={caption}>
        <table>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {expanded !== undefined && <th className="dt-x" />}
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`${c.align === "right" ? "num" : ""} ${c.wide === true ? "dt-wide" : ""}`}
                  aria-sort={
                    sort?.key === c.key
                      ? sort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {c.sort !== undefined ? (
                    <button type="button" onClick={() => toggleSort(c.key)}>
                      {c.header}
                      {sort?.key === c.key &&
                        (sort.dir === "asc" ? (
                          <ChevronUp size={14} aria-hidden="true" />
                        ) : (
                          <ChevronDown size={14} aria-hidden="true" />
                        ))}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.slice(0, shown).map((row) => {
              const id = rowKey(row);
              const isOpen = open.has(id);
              return (
                <Fragment key={id}>
                  <tr>
                    {expanded !== undefined && (
                      <td className="dt-x">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-label={isOpen ? "Hide details" : "Show details"}
                          onClick={() => toggleOpen(id)}
                        >
                          {isOpen ? (
                            <ChevronUp size={16} aria-hidden="true" />
                          ) : (
                            <ChevronDown size={16} aria-hidden="true" />
                          )}
                        </button>
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`${c.align === "right" ? "num" : ""} ${c.wide === true ? "dt-wide" : ""}`}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                  {isOpen && expanded !== undefined && (
                    <tr className="dt-detail">
                      <td colSpan={columns.length + 1}>{expanded(row)}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {view.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (expanded !== undefined ? 1 : 0)}
                  className="dt-empty"
                >
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {view.length > shown && (
        <button
          type="button"
          className="btn btn-quiet dt-more"
          onClick={() => setShown((n) => n + (pageSize ?? 25))}
        >
          Show more ({view.length - shown} left)
        </button>
      )}
      {footer}
    </div>
  );
}
