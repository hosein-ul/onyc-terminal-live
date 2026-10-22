/** The sections of the long Overview, in the default order. The ids are also the anchors of the sticky section nav. */
export const SECTIONS = [
  { id: "now", label: "Now" },
  { id: "safety", label: "Safety" },
  { id: "best", label: "Best places" },
  { id: "points", label: "Points" },
  { id: "flows", label: "Flows" },
  { id: "changes", label: "Changes" },
  { id: "capital", label: "Capital" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
