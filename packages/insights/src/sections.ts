/** The sections of the long Overview, in the default order. The ids are also the anchors of the sticky section nav. */
export const SECTIONS = [
  { id: "now", label: "Now" },
  { id: "capital", label: "Capital" },
  { id: "best", label: "Best places" },
  { id: "points", label: "Points" },
  { id: "activity", label: "Activity" },
  { id: "flows", label: "Flows" },
  { id: "changes", label: "Changes" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
