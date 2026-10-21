import { useSyncExternalStore } from "react";

/**
 * Shared hover position for the time charts on one page. Hovering one chart sets the x (a date string); the others
 * draw a vertical guide at the same date if they have it.
 */
let current: string | null = null;
const listeners = new Set<() => void>();

export function setCrosshair(x: string | null): void {
  if (x === current) return;
  current = x;
  for (const l of listeners) l();
}

export function useCrosshair(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}
