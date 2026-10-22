import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Logo } from "./Logo";
import { NAV } from "./nav";
import { topicFor } from "./topic";

function Footer() {
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

/** A wordmark and rounded chips for the eleven pages; on phones a menu button and a sheet of the same chips. */
export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const menuButton = useRef<HTMLButtonElement>(null);
  const topic = topicFor(location.pathname);

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
    <div className="shell" data-topic={topic}>
      <a className="skip" href="#main">
        Skip to content
      </a>

      <header className="topnav">
        <Logo />
        <nav aria-label="Pages" className="chips">
          {NAV.map(({ to, label }) => (
            <NavLink key={to} to={to} end={to === "/"} className="chip">
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          ref={menuButton}
          type="button"
          className="icon-btn menu-btn"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen(true)}
        >
          <Menu size={22} strokeWidth={2} aria-hidden="true" />
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
              <Logo />
              <button type="button" className="icon-btn" onClick={() => setOpen(false)}>
                <X size={22} strokeWidth={2} aria-hidden="true" />
                <span className="sr-only">Close menu</span>
              </button>
            </div>
            <nav aria-label="Pages" className="sheet-chips">
              {NAV.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  className="chip"
                  onClick={() => setOpen(false)}
                >
                  {label}
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
