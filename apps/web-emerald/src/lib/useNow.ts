import { useEffect, useState } from "react";

/** The current time, refreshed every `everyMs`, so ages ("42 s ago") keep counting on screen. */
export function useNow(everyMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
