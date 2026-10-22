import { Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { FallbackBanner } from "../lib/offline";
import { setTheme, useTheme } from "../lib/theme";
import { GlossProvider } from "../ui/Term";
import { WalletDialog, WalletSearch } from "../ui/WalletDialog";
import { Logo } from "./Logo";
import { NAV } from "./nav";

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Pages" className="nav">
      {NAV.map(({ to, label, icon: Icon, hint, group }, i) => (
        <Fragment key={to}>
          {group !== "" && NAV[i - 1]?.group !== group && (
            <div className="nav-group" aria-hidden="true">
              {group}
            </div>
          )}
          <NavLink to={to} end={to === "/"} className="nav-item" title={label} onClick={onNavigate}>
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            <span className="nav-text">
              <span>{label}</span>
              <small>{hint}</small>
            </span>
          </NavLink>
        </Fragment>
      ))}
    </nav>
  );
}

function ThemeToggle() {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(next)}
      title={`Switch to ${next} theme`}
    >
      {theme === "dark" ? (
        <Sun size={18} strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Moon size={18} strokeWidth={1.75} aria-hidden="true" />
      )}
      <span className="sr-only">Switch to {next} theme</span>
    </button>
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
      <p>
        <Link to="/glossary">Glossary</Link>: every technical term on this site in plain words.
      </p>
    </footer>
  );
}

/** Left sidebar on desktop; a top bar and a slide-over menu on phones. */
export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("onyc-sidebar") === "collapsed";
    } catch {
      return false;
    }
  });
  const toggleSidebar = (): void => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("onyc-sidebar", c ? "open" : "collapsed");
      } catch {
        /* the choice then lasts for this visit */
      }
      return !c;
    });
  };
  const location = useLocation();
  const menuButton = useRef<HTMLButtonElement>(null);

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
    <div className={`shell ${collapsed ? "shell-collapsed" : ""}`}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside
        className="sidebar"
        onClick={(e) => {
          // A click on the sidebar's own surface (not on a link or a button) opens or closes it.
          if (e.target instanceof Element && e.target.closest("a, button") === null)
            toggleSidebar();
        }}
      >
        <div className="sidebar-head">
          <Logo />
          <button
            type="button"
            className="collapse-btn"
            onClick={toggleSidebar}
            aria-pressed={collapsed}
            title={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden="true" />
            )}
            <span className="sr-only">
              {collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
            </span>
          </button>
        </div>
        <NavList />
        <div className="sidebar-foot">
          <span>
            Read-only and independent. <Link to="/glossary">Glossary</Link>
          </span>
          <ThemeToggle />
        </div>
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
            <div className="sidebar-foot">
              <span>Theme</span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}

      <div className="main-col">
        {location.pathname !== "/" && (
          <div className="topline">
            <WalletSearch />
          </div>
        )}
        <FallbackBanner />
        <main id="main" className="main" tabIndex={-1}>
          <GlossProvider key={location.pathname}>{children}</GlossProvider>
        </main>
        <Footer />
      </div>
      <WalletDialog />
    </div>
  );
}
