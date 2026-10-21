import { useEffect, useRef, useState, type RefObject } from "react";

/** Width in px of the element the ref is attached to; used so SVG charts draw at 1:1 and their text stays readable. */
export function useWidth(fallback = 640): [RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    const update = (): void =>
      setWidth(Math.max(260, Math.round(el.getBoundingClientRect().width)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
