import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Logo } from "./Logo";
import { NAV } from "./nav";

const COLLAPSE_KEY = "onyc.sidebar.collapsed";

/** The desktop sidebar is either full width or an icon rail. The choice is remembered when storage is available. */
function useCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // Storage can be blocked; the sidebar still works for this visit.
      }
      return !c;
    });
  }, []);
  return [collapsed, toggle];
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Pages" className="nav">
      {NAV.map(({ to, label, icon: Icon, hint }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className="nav-item"
          data-label={label}
          onClick={onNavigate}
        >
          <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
          <span className="nav-text">
            <span>{label}</span>
            <small>{hint}</small>
          </span>
        </NavLink>
      ))}
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="site-foot">
      <p>Independent community tool. Not affiliated with OnRe. Not investment advice.</p>
      <p>
        Every number shows where it came from and how old it is. This site is read-only: it never
        asks you to sign or send anything.
      </p>
    </footer>
  );
}

/** Left sidebar on desktop; a top bar and a slide-over menu on phones. */
export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const menuButton = useRef<HTMLButtonElement>(null);
  const [collapsed, toggleCollapsed] = useCollapsed();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target;
      const typing =
        t instanceof HTMLElement &&
        (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
      if (e.key === "[" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) toggleCollapsed();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggleCollapsed]);

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className={collapsed ? "shell is-collapsed" : "shell"}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="sidebar-head">
          <Logo />
        </div>
        <NavList />
        <button
          type="button"
          className="collapse-btn"
          aria-pressed={collapsed}
          aria-keyshortcuts="["
          data-label={collapsed ? "Expand sidebar" : undefined}
          onClick={toggleCollapsed}
        >
          {collapsed ? (
            <PanelLeftOpen size={18} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden="true" />
          )}
          <span className="collapse-text">{collapsed ? "Expand sidebar" : "Collapse"}</span>
          <kbd className="collapse-key" aria-hidden="true">
            [
          </kbd>
        </button>
      </aside>

      <header className="topbar">
        <Logo size={28} />
        <button
          ref={menuButton}
          type="button"
          className="icon-btn"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen(true)}
        >
          <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
          <span className="sr-only">Open menu</span>
        </button>
      </header>

      {open && (
        <div className="drawer-wrap">
          <button
            type="button"
            className="drawer-scrim"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div
            className="drawer"
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <div className="drawer-head">
              <Logo size={28} />
              <button type="button" className="icon-btn" onClick={() => setOpen(false)}>
                <X size={20} strokeWidth={1.75} aria-hidden="true" />
                <span className="sr-only">Close menu</span>
              </button>
            </div>
            <NavList onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="main-col">
        <main id="main" className="main" tabIndex={-1}>
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}
