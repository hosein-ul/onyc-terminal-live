#!/usr/bin/env node
// Writes docs/GLOSSARY.md from the glossary package, so the document and the in-app glossary never differ.
// Usage: pnpm --filter @onyc/glossary build && node scripts/gen-glossary.mjs
import { writeFileSync } from "node:fs";
import { BASIS_LABEL, sortedTerms } from "../packages/glossary/dist/index.js";

const lines = [
  "# Glossary",
  "",
  'Generated from `packages/glossary` by `scripts/gen-glossary.mjs`; edit the package, not this file. The same entries power the "?" hints and the `/glossary` page in every app.',
  "",
  "Each entry says where its definition comes from: **Stated by OnRe** (public docs or APIs), **This tool's method** (how this tool computes or labels something, which OnRe does not define) or **General meaning** (the ordinary meaning, used because OnRe's pages use the label without defining it).",
  "",
];
for (const t of sortedTerms()) {
  lines.push(
    `## ${t.term}`,
    "",
    `*${BASIS_LABEL[t.basis]}.*`,
    "",
    t.short,
    "",
    `**Why it matters:** ${t.why}`,
    "",
  );
  if (t.note) lines.push(t.note, "");
  if (t.source) lines.push(`Source: [${t.source.label}](${t.source.url})`, "");
}
writeFileSync(new URL("../docs/GLOSSARY.md", import.meta.url), lines.join("\n"));
console.log("wrote docs/GLOSSARY.md");
