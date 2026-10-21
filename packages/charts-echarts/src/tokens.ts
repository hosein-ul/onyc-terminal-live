/**
 * The skin of one app, as plain values. Every ECharts option is built from these; nothing in this package
 * holds a colour or a font of its own. Apps expose them as CSS custom properties named `--chart-*`.
 */
export interface ChartTokens {
  ground: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  grid: string;
  accent: string;
  good: string;
  bad: string;
  /** Categorical series colours, at least seven, ordered so neighbours differ. */
  series: string[];
  fontUi: string;
  fontMono: string;
  /** Line weight in px for the hero line of the app. */
  stroke: number;
  /** Corner radius in px for bars, tiles and Gantt rows. */
  radius: number;
  tooltipBg: string;
  tooltipInk: string;
  /** Marker shape language of the app. */
  marker: "circle" | "rect";
}

const NAMES = {
  ground: "ground",
  surface: "surface",
  ink: "ink",
  muted: "muted",
  line: "line",
  grid: "grid",
  accent: "accent",
  good: "good",
  bad: "bad",
  fontUi: "font-ui",
  fontMono: "font-mono",
  stroke: "stroke",
  radius: "radius",
  tooltipBg: "tooltip-bg",
  tooltipInk: "tooltip-ink",
  marker: "marker",
} as const;

/** Read the `--chart-*` custom properties that apply to `el`. Throws if one the charts need is missing. */
export function readTokens(el: Element): ChartTokens {
  const cs = getComputedStyle(el);
  const get = (name: string): string => {
    const value = cs.getPropertyValue(`--chart-${name}`).trim();
    if (value === "") throw new Error(`Missing chart token --chart-${name}`);
    return value;
  };
  const series: string[] = [];
  for (let i = 1; i <= 12; i += 1) {
    const value = cs.getPropertyValue(`--chart-s${i}`).trim();
    if (value !== "") series.push(value);
  }
  if (series.length < 7) throw new Error("Chart tokens need --chart-s1 to --chart-s7 at least");
  return {
    ground: get(NAMES.ground),
    surface: get(NAMES.surface),
    ink: get(NAMES.ink),
    muted: get(NAMES.muted),
    line: get(NAMES.line),
    grid: get(NAMES.grid),
    accent: get(NAMES.accent),
    good: get(NAMES.good),
    bad: get(NAMES.bad),
    series,
    fontUi: get(NAMES.fontUi),
    fontMono: get(NAMES.fontMono),
    stroke: Number.parseFloat(get(NAMES.stroke)),
    radius: Number.parseFloat(get(NAMES.radius)),
    tooltipBg: get(NAMES.tooltipBg),
    tooltipInk: get(NAMES.tooltipInk),
    marker: get(NAMES.marker) === "rect" ? "rect" : "circle",
  };
}

const parse = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
};

/** Mix two #rrggbb colours: t=0 gives `a`, t=1 gives `b`. Used for heat ramps, never for text. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const c = (x: number, y: number): string =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}

/** Sequential ramp from the surface to the accent, for heatmaps. */
export function ramp(tokens: ChartTokens, steps = 5): string[] {
  return Array.from({ length: steps }, (_, i) =>
    mix(tokens.surface, tokens.accent, (i + 1) / steps),
  );
}

/** `#rrggbb` with an alpha, as `rgba()`. */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = parse(hex);
  return `rgba(${r},${g},${b},${a})`;
}

const luminance = (hex: string): number => {
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parse(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** WCAG contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Text colour for use on `bg`: whichever of the app's ink and surface colours has the higher contrast. */
export function onColor(bg: string, tokens: ChartTokens): string {
  return contrast(bg, tokens.ink) >= contrast(bg, tokens.surface) ? tokens.ink : tokens.surface;
}
