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
export type Persona = "default" | "holder" | "hunter" | "analyst";

export const PERSONAS: { id: Persona; label: string; hint: string }[] = [
  { id: "default", label: "All", hint: "The standard order" },
  { id: "holder", label: "Holder", hint: "Safety and exits first" },
  { id: "hunter", label: "Hunter", hint: "Yield and points first" },
  { id: "analyst", label: "Analyst", hint: "Capital and flows first" },
];

const ORDER: Record<Persona, SectionId[]> = {
  default: ["now", "safety", "best", "points", "flows", "changes", "capital"],
  holder: ["now", "safety", "flows", "changes", "best", "points", "capital"],
  hunter: ["now", "best", "points", "safety", "flows", "changes", "capital"],
  analyst: ["now", "safety", "capital", "flows", "best", "points", "changes"],
};

/** Every section exactly once; "now" always stays first because it holds the NAV and the vitals. */
export function sectionOrder(persona: Persona): SectionId[] {
  return ORDER[persona];
}

const KEY = "onyc.persona";

export function isPersona(v: unknown): v is Persona {
  return v === "default" || v === "holder" || v === "hunter" || v === "analyst";
}

/** Read the remembered persona; storage may be blocked, in which case the default is used. */
export function loadPersona(): Persona {
  try {
    const v = window.localStorage.getItem(KEY);
    return isPersona(v) ? v : "default";
  } catch {
    return "default";
  }
}

export function savePersona(p: Persona): void {
  try {
    window.localStorage.setItem(KEY, p);
  } catch {
    // Storage can be blocked; the choice then lasts for this visit only.
  }
}
