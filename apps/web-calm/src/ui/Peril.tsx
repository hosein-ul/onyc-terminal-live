import {
  CalendarX,
  CloudLightning,
  Globe,
  Mountain,
  Tornado,
  Waves,
  Wind,
  type LucideIcon,
} from "lucide-react";

export interface PerilKind {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Matches the peril text OnRe prints in its reinsurance sheet. */
  match: RegExp;
}

/** The perils named in OnRe's layer table, in the order they are drawn. Icons are Lucide, the one icon set of the app. */
export const PERILS: PerilKind[] = [
  { key: "wind", label: "Windstorm and hurricane", icon: Wind, match: /wind|hurricane/i },
  { key: "earthquake", label: "Earthquake", icon: Mountain, match: /earthquake/i },
  {
    key: "convective",
    label: "Severe convective storm",
    icon: CloudLightning,
    match: /convective/i,
  },
  { key: "flood", label: "Flood", icon: Waves, match: /flood/i },
  { key: "tornado", label: "Tornado", icon: Tornado, match: /tornado/i },
  { key: "all", label: "All natural perils", icon: Globe, match: /all natural|peak perils/i },
  { key: "contingency", label: "Contingency", icon: CalendarX, match: /contingency/i },
];

export const perilsIn = (text: string): PerilKind[] => PERILS.filter((p) => p.match.test(text));

/** The icons for the perils a layer covers, each with a text label for screen readers and a tooltip. */
export function PerilIcons({ text, size = 16 }: { text: string; size?: number }) {
  const found = perilsIn(text);
  if (found.length === 0) return null;
  return (
    <span className="perils" role="img" aria-label={found.map((p) => p.label).join(", ")}>
      {found.map(({ key, label, icon: Icon }) => (
        <span key={key} className="peril" title={label}>
          <Icon size={size} strokeWidth={1.75} aria-hidden="true" />
        </span>
      ))}
    </span>
  );
}
