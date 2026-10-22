import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { ActivityPage } from "./pages/ActivityLive";
import { AlertsApiPage, RiskReinsurancePage, YieldPointsPage } from "./pages/Combined";
import { GlossaryPage } from "./pages/Glossary";
import { OverviewPage } from "./pages/Overview";
import { WalletPage } from "./pages/Wallet";
import { ChartsGallery } from "./routes/ChartsGallery";

/** The eleven older addresses still work: each lands on the section of a combined page that took it over. */
const REDIRECTS: [string, string][] = [
  ["nav", "/yield#nav"],
  ["capital", "/yield#capital"],
  ["points", "/yield#points"],
  ["market", "/risk#market"],
  ["reinsurance", "/risk#reinsurance"],
  ["health", "/risk#sources"],
  ["developers", "/alerts#developers"],
];

/** Scroll to the anchor in the address once its section has rendered, and to the top on a plain page change. */
function ScrollToHash() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash === "") {
      window.scrollTo(0, 0);
      return undefined;
    }
    let tries = 0;
    const id = window.setInterval(() => {
      const el = document.getElementById(hash.slice(1));
      tries += 1;
      if (el !== null) {
        el.scrollIntoView({ block: "start" });
        window.clearInterval(id);
      } else if (tries > 30) {
        window.clearInterval(id);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [pathname, hash]);
  return null;
}

export function App() {
  return (
    <>
      <ScrollToHash />
      <Routes>
        <Route path="/_charts" element={<ChartsGallery />} />
        <Route
          path="*"
          element={
            <AppShell>
              <Routes>
                <Route index element={<OverviewPage />} />
                <Route path="yield" element={<YieldPointsPage />} />
                <Route path="risk" element={<RiskReinsurancePage />} />
                <Route path="activity" element={<ActivityPage />} />
                <Route path="wallet" element={<WalletPage />} />
                <Route path="wallet/:address" element={<WalletPage />} />
                <Route path="alerts" element={<AlertsApiPage />} />
                <Route path="glossary" element={<GlossaryPage />} />
                {REDIRECTS.map(([from, to]) => (
                  <Route key={from} path={from} element={<Navigate to={to} replace />} />
                ))}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          }
        />
      </Routes>
    </>
  );
}
