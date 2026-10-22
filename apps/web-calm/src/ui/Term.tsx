import { splitByTerms, TERM_BY_ID } from "@onyc/glossary";
import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

/** Remembers which terms already had their one-line explanation on this page. The shell remounts it on every route. */
const SeenContext = createContext<Set<string> | null>(null);

export function GlossProvider({ children }: { children: ReactNode }) {
  const [seen] = useState(() => new Set<string>());
  return <SeenContext.Provider value={seen}>{children}</SeenContext.Provider>;
}

/** A small "?" that opens the plain-language definition. Works with hover, keyboard focus and a tap. */
export function TermHint({ id, label }: { id: string; label?: string }) {
  const term = TERM_BY_ID.get(id);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 8, top: 8 });
  const button = useRef<HTMLButtonElement>(null);
  const lastPointer = useRef<string>("mouse");
  const timer = useRef<number | undefined>(undefined);
  const later = (fn: () => void, ms: number): void => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, ms);
  };
  const uid = useId();

  const place = (): void => {
    const el = button.current;
    if (el === null) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(240, window.innerWidth - 16);
    const left = Math.min(
      Math.max(8, r.left + r.width / 2 - width / 2),
      window.innerWidth - width - 8,
    );
    const below = r.bottom + 8;
    // Open upwards when there is no room underneath.
    const top = below + 90 > window.innerHeight && r.top > 100 ? r.top - 8 - 76 : below;
    setPos({ left, top });
  };

  const show = (): void => {
    place();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: PointerEvent): void => {
      const t = e.target;
      if (
        t instanceof Node &&
        !button.current?.contains(t) &&
        !document.getElementById(uid)?.contains(t)
      ) {
        setOpen(false);
      }
    };
    const close = (): void => setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, uid]);

  if (term === undefined) return null;
  return (
    <span className="term">
      <button
        ref={button}
        type="button"
        className="term-btn"
        aria-label={label ?? `What is ${term.term}?`}
        aria-expanded={open}
        aria-controls={open ? uid : undefined}
        onPointerDown={(e) => {
          lastPointer.current = e.pointerType;
        }}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") later(show, 350);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") later(() => setOpen(false), 120);
        }}
        onClick={() => {
          // A mouse click on an already hover-opened hint keeps it open; a tap or Enter toggles it.
          if (lastPointer.current === "mouse" && open) return;
          if (open) setOpen(false);
          else show();
        }}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open &&
        createPortal(
          <div
            id={uid}
            role="tooltip"
            className="term-pop"
            style={{ left: pos.left, top: pos.top }}
            onPointerEnter={() => window.clearTimeout(timer.current)}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") later(() => setOpen(false), 120);
            }}
          >
            <strong>{term.term}</strong>
            <span>{term.tip}</span>
            <Link to={`/glossary#${term.id}`}>More</Link>
          </div>,
          document.body,
        )}
    </span>
  );
}

/** A label or sentence with a "?" after every glossary term in it. */
export function Gloss({ text }: { text: string }) {
  return (
    <>
      {splitByTerms(text).map((p, i) => (
        <Fragment key={`${i}-${p.text}`}>
          {p.text}
          {p.termId !== undefined && <TermHint id={p.termId} />}
        </Fragment>
      ))}
    </>
  );
}

/** Only the "?" marks for the terms in a label, for places where the label itself sits inside a button. */
export function GlossHints({ text }: { text: string }) {
  return (
    <>
      {splitByTerms(text).map((p, i) =>
        p.termId === undefined ? null : <TermHint key={`${i}-${p.termId}`} id={p.termId} />,
      )}
    </>
  );
}

/** The one-line explanation printed the first time a term appears on a page. Later uses print nothing. */
export function TermNote({ id }: { id: string }) {
  const seen = useContext(SeenContext);
  const [first] = useState(() => {
    if (seen === null || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const term = TERM_BY_ID.get(id);
  if (!first || term === undefined) return null;
  return (
    <p className="term-note">
      <b>{term.term}:</b> {term.short}
    </p>
  );
}
