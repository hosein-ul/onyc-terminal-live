/**
 * Browser-only export helpers (entry `@onyc/chart-specs/dom`). The chart libraries draw SVG that refers to CSS
 * variables and web fonts; an SVG rendered on its own loses both, so the style is copied onto each node and the
 * fonts are embedded before the picture is drawn to a canvas.
 */

const STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
  "shape-rendering",
] as const;

function inlineStyles(source: Element, target: Element): void {
  const computed = getComputedStyle(source);
  const style = (target as SVGElement).style;
  for (const prop of STYLE_PROPS) style.setProperty(prop, computed.getPropertyValue(prop));
  const from = source.children;
  const to = target.children;
  for (let i = 0; i < from.length; i += 1) {
    const a = from[i];
    const b = to[i];
    if (a !== undefined && b !== undefined) inlineStyles(a, b);
  }
}

async function fontFaceCss(families: string[]): Promise<string> {
  const wanted = new Set(
    families.map((f) => f.replaceAll('"', "").replaceAll("'", "").trim().toLowerCase()),
  );
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style
        .getPropertyValue("font-family")
        .replaceAll('"', "")
        .replaceAll("'", "")
        .trim()
        .toLowerCase();
      const range = rule.style.getPropertyValue("unicode-range");
      if (!wanted.has(family) || (range !== "" && !/U\+0(?:000)?-(?:00)?FF/i.test(range))) continue;
      const url = /url\(["']?([^"')]+)["']?\)/.exec(rule.style.getPropertyValue("src"))?.[1];
      if (url === undefined) continue;
      const res = await fetch(new URL(url, sheet.href ?? location.href));
      const bytes = new Uint8Array(await res.arrayBuffer());
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      out.push(
        `@font-face{font-family:${family};font-weight:${rule.style.getPropertyValue("font-weight")};src:url(data:font/woff2;base64,${btoa(binary)}) format("woff2");}`,
      );
    }
  }
  return out.join("\n");
}

export interface PngOptions {
  /** Solid background, usually the app's surface colour; PNG has no page behind it. */
  background: string;
  /** Pixel ratio, default 2. */
  scale?: number;
  /** Font families used in the chart, embedded so the picture matches the screen. */
  fontFamilies?: string[];
}

/** Draw a live `<svg>` (any chart library) into a PNG that looks like the screen. */
export async function svgToPng(svg: SVGSVGElement, options: PngOptions): Promise<Blob> {
  const { width, height } = svg.getBoundingClientRect();
  const scale = options.scale ?? 2;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const css = await fontFaceCss(options.fontFamilies ?? []);
  if (css !== "") {
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = css;
    clone.insertBefore(style, clone.firstChild);
  }
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml;charset=utf-8",
    }),
  );
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("canvas is not available");
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b === null ? reject(new Error("PNG encoding failed")) : resolve(b)),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function saveBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const saveText = (filename: string, text: string, type = "text/csv;charset=utf-8"): void =>
  saveBlob(filename, new Blob([text], { type }));

/** True when the visitor asked the system for less motion. Read at draw time, not at import time. */
export const prefersReducedMotion = (): boolean =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;
