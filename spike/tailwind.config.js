/** Spike only: Tremor v3 requires Tailwind v3. Colours map to the skin variables so Tremor follows the active skin. */
const v = (n) => `var(--${n})`;
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./node_modules/@tremor/react/dist/**/*.{js,mjs}"],
  safelist: [
    {
      pattern: /^(fill|stroke|bg|text|border|ring)-(accent|s[1-7])$/,
      variants: ["hover", "ui-selected"],
    },
  ],
  theme: {
    extend: {
      colors: {
        accent: v("accent"),
        s1: v("s1"), s2: v("s2"), s3: v("s3"), s4: v("s4"), s5: v("s5"), s6: v("s6"), s7: v("s7"),
        tremor: {
          brand: { faint: v("ground"), muted: v("line"), subtle: v("accent"), DEFAULT: v("accent"), emphasis: v("ink"), inverted: v("surface") },
          background: { muted: v("ground"), subtle: v("surface"), DEFAULT: v("surface"), emphasis: v("ink") },
          border: { DEFAULT: v("line") },
          ring: { DEFAULT: v("line") },
          content: { subtle: v("muted"), DEFAULT: v("muted"), emphasis: v("ink"), strong: v("ink"), inverted: v("surface") },
        },
      },
      borderRadius: { "tremor-default": "14px", "tremor-small": "10px", "tremor-full": "9999px" },
      boxShadow: { "tremor-card": "none", "tremor-input": "none", "tremor-dropdown": "none" },
    },
  },
};
