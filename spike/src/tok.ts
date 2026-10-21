/** Resolve the active skin's CSS variables to literal values, for libraries that cannot read var(). */
export function tok(el: Element = document.querySelector("[data-skin]") ?? document.documentElement): Record<string, string> {
  const root = el.closest("[data-skin]") ?? document.documentElement;
  const cs = getComputedStyle(root);
  const names = ["ground","surface","ink","muted","line","grid","accent","area-alpha","stroke","tip-bg","tip-ink","font-ui","font-mono","s1","s2","s3","s4","s5","s6","s7","bad"];
  return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(`--${n}`).trim()]));
}
export const usd = (v: number): string => `$${(v / 1e6).toFixed(1)}M`;
export const nav6 = (v: number): string => v.toFixed(4);
