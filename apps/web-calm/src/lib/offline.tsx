import { formatRelativeAge } from "@onyc/format";
import { useQueryClient } from "@tanstack/react-query";
import { CloudOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useNow } from "./useNow";

/** The time of the newest saved answer among queries whose latest refresh failed, or null while everything is live. */
function useFallbackSince(): number | null {
  const client = useQueryClient();
  const [since, setSince] = useState<number | null>(null);
  useEffect(() => {
    const cache = client.getQueryCache();
    const scan = (): void => {
      const failed = cache
        .getAll()
        .filter((q) => q.state.status === "error" && q.state.data !== undefined);
      setSince(failed.length === 0 ? null : Math.max(...failed.map((q) => q.state.dataUpdatedAt)));
    };
    scan();
    return cache.subscribe(scan);
  }, [client]);
  return since;
}

/** Shown when the API cannot be reached but earlier answers are still on screen: the data is kept, not blanked. */
export function FallbackBanner() {
  const since = useFallbackSince();
  const now = useNow(30_000);
  if (since === null) return null;
  return (
    <div className="fallback" role="status">
      <CloudOff size={16} strokeWidth={1.75} aria-hidden="true" />
      Live updates are paused. Showing the last saved data from{" "}
      {formatRelativeAge(new Date(since).toISOString(), now)}.
    </div>
  );
}
