import { ArrowUpRight, CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

/** The white card of the Calm direction: radius 24, no border, no shadow. */
export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
  as: Tag = "section",
}: {
  title?: string | undefined;
  subtitle?: string | undefined;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={`card ${className}`}>
      {(title !== undefined || actions !== undefined) && (
        <header className="card-head">
          <div>
            {title !== undefined && <h2 className="card-title">{title}</h2>}
            {subtitle !== undefined && <p className="card-sub">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </Tag>
  );
}

export type Tone = "neutral" | "good" | "bad" | "accent" | "watch";

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

const NOTICE_ICON = {
  info: Info,
  good: CircleCheck,
  watch: TriangleAlert,
  bad: CircleAlert,
} as const;

/** An inline message: what happened and why, never a bare error code. */
export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: keyof typeof NOTICE_ICON;
  title?: string;
  children: ReactNode;
}) {
  const Icon = NOTICE_ICON[tone];
  return (
    <div className={`notice notice-${tone}`} role={tone === "bad" ? "alert" : "note"}>
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      <div>
        {title !== undefined && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
    </div>
  );
}

/** Label over a number, for the small facts inside a card. */
export function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ? `tone-${tone}` : ""}`}>{value}</div>
      {note !== undefined && <div className="stat-note">{note}</div>}
    </div>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="ext" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
    </a>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow?: string;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow !== undefined && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
      </div>
      {right}
    </div>
  );
}

export function Skeleton({
  height = 24,
  width = "100%",
}: {
  height?: number;
  width?: number | string;
}) {
  return <span className="skel" style={{ height, width }} aria-hidden="true" />;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children !== undefined && <p>{children}</p>}
    </div>
  );
}

/** Splits a list of children into a responsive grid: each child sets its own width with a span class. */
export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid">{children}</div>;
}
