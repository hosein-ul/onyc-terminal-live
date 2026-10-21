import { formatSourceFooter } from "@onyc/format";
import type { Meta } from "@onyc/sdk";
import { useNow } from "../lib/useNow";

/** "Source: OnRe core API · updated 42 s ago", in red when the API marks the data stale. */
export function Provenance({
  meta,
  className = "",
}: {
  meta: Meta | undefined;
  className?: string;
}) {
  const now = useNow(30_000);
  if (meta === undefined) return <p className={`prov ${className}`}>Source unknown</p>;
  return (
    <p className={`prov ${meta.stale ? "prov-stale" : ""} ${className}`}>
      {formatSourceFooter(meta.source, meta.fetchedAt, now)}
      {meta.stale ? " · stale" : ""}
    </p>
  );
}
