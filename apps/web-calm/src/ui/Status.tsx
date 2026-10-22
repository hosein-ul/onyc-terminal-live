import {
  CircleCheck,
  CircleDashed,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

export type StatusState = "good" | "watch" | "bad" | "neutral";

const ICON: Record<StatusState, LucideIcon> = {
  good: CircleCheck,
  watch: TriangleAlert,
  bad: OctagonAlert,
  neutral: CircleDashed,
};

/** The state of a check as an icon: the shape and the colour both carry it. Decorative; the word is next to it. */
export function StatusIcon({ state, size = 16 }: { state: StatusState; size?: number }) {
  const Icon = ICON[state];
  return (
    <span className={`status status-${state}`} aria-hidden="true">
      <Icon size={size} strokeWidth={2} />
    </span>
  );
}
