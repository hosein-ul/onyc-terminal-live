import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Logo, LogoMark } from "./Logo";
import { NAV } from "./nav";

function Footer() {
  return (
    <footer className="site-foot">
      <p>Unofficial community tool. Not affiliated with OnRe. Not investment advice.</p>
      <p>
        Every number shows where it came from and how old it is. This site is read-only: it never
        asks you to sign or send anything.
      </p>
    </footer>
  );
}

/** A 76 px icon rail on desktop (names on hover and focus); a top bar and a full menu on phones. */
export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
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
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>

      <aside className="rail">
        <div className="rail-mark">
          <LogoMark size={40} />
        </div>
        <nav aria-label="Pages" className="rail-nav">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"} className="rail-item" aria-label={label}>
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              <span className="rail-tip" aria-hidden="true">
                {label}
              </span>
            </NavLink>
          ))}
        </nav>
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
            <nav aria-label="Pages" className="nav">
              {NAV.map(({ to, label, icon: Icon, hint }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  className="nav-item"
                  onClick={() => setOpen(false)}
                >
                  <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                  <span className="nav-text">
                    <span>{label}</span>
                    <small>{hint}</small>
                  </span>
                </NavLink>
              ))}
            </nav>
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
