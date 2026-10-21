import { useSearchParams } from "react-router-dom";
import { RANGES, type RangeKey } from "../charts";

/** The chart range, kept in the URL (`?range=1y`) so a link shows the same view. */
export function useRange(fallback: RangeKey): [RangeKey, (r: RangeKey) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("range");
  const range: RangeKey = (RANGES as readonly string[]).includes(raw ?? "")
    ? (raw as RangeKey)
    : fallback;
  const set = (r: RangeKey): void => {
    const next = new URLSearchParams(params);
    next.set("range", r);
    setParams(next, { replace: true });
  };
  return [range, set];
}
