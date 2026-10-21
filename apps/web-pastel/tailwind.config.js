/**
 * Tremor 3 needs Tailwind 3. Preflight is off so Tailwind adds only the utility classes Tremor uses and never resets the
 * app's own styles. Tremor colour names map to the --chart-* tokens, so Tremor follows the skin.
 */
const v = (n) => `var(--chart-${n})`;
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "./node_modules/@tremor/react/dist/**/*.{js,mjs}",
  ],
  corePlugins: { preflight: false },
  safelist: [
    {
      pattern: /^(fill|stroke|bg|text|border|ring)-(accent|good|bad|s[1-8])$/,
      variants: ["hover", "ui-selected"],
    },
  ],
  theme: {
    extend: {
      colors: {
        accent: v("accent"),
        good: v("good"),
        bad: v("bad"),
        s1: v("s1"),
        s2: v("s2"),
        s3: v("s3"),
        s4: v("s4"),
        s5: v("s5"),
        s6: v("s6"),
        s7: v("s7"),
        s8: v("s8"),
        tremor: {
          brand: {
            faint: v("ground"),
            muted: v("line"),
            subtle: v("accent"),
            DEFAULT: v("accent"),
            emphasis: v("ink"),
            inverted: v("surface"),
          },
          background: {
            muted: v("ground"),
            subtle: v("surface"),
            DEFAULT: v("surface"),
            emphasis: v("ink"),
          },
          border: { DEFAULT: v("line") },
          ring: { DEFAULT: v("line") },
          content: {
            subtle: v("muted"),
            DEFAULT: v("muted"),
            emphasis: v("ink"),
            strong: v("ink"),
            inverted: v("surface"),
          },
        },
      },
      borderRadius: { "tremor-default": "12px", "tremor-small": "8px", "tremor-full": "9999px" },
      boxShadow: { "tremor-card": "none", "tremor-input": "none", "tremor-dropdown": "none" },
    },
  },
};
