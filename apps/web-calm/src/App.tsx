import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { ActivityPage as AlertsPage } from "./pages/Activity";
import { ActivityPage } from "./pages/ActivityLive";
import { CapitalDefiPage } from "./pages/CapitalDefi";
import { ChainPage } from "./pages/Chain";
import { DataHealthPage } from "./pages/DataHealth";
import { NavYieldPage } from "./pages/NavYield";
import { PegLiquidityPage } from "./pages/PegLiquidity";
import { PointsPage } from "./pages/Points";
import { ReinsurancePage } from "./pages/Reinsurance";
import { RiskPage } from "./pages/Risk";
import { GlossaryPage } from "./pages/Glossary";
import { OverviewPage } from "./pages/Overview";
import { ChartsGallery } from "./routes/ChartsGallery";

/** Addresses from the time pages were combined: each section anchor now has a page of its own. */
const REDIRECTS: [string, string][] = [["yield", "/nav"]];
const ANCHORS: Record<string, string> = {
  "#nav": "/nav",
  "#capital": "/capital",
  "#points": "/points",
  "#market": "/market",
  "#reinsurance": "/reinsurance",
  "#chain": "/onchain",
  "#sources": "/health",
  "#onchain": "/activity",
  "#activity": "/alerts",
};

/** The old wallet page address now opens the popup on the Overview. */
function WalletRedirect() {
  const { address = "" } = useParams();
  return <Navigate to={`/?wallet=${address}`} replace />;
}

/** A page that used to be a combined page: an old section anchor sends the visitor to that section's own page. */
function WithLegacyAnchor({ children }: { children: ReactNode }) {
  const { hash } = useLocation();
  const to = ANCHORS[hash];
  if (to !== undefined) return <Navigate to={to} replace />;
  return <>{children}</>;
}

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
                <Route path="nav" element={<NavYieldPage />} />
                <Route path="capital" element={<CapitalDefiPage />} />
                <Route path="points" element={<PointsPage />} />
                <Route
                  path="risk"
                  element={
                    <WithLegacyAnchor>
                      <RiskPage />
                    </WithLegacyAnchor>
                  }
                />
                <Route path="market" element={<PegLiquidityPage />} />
                <Route path="reinsurance" element={<ReinsurancePage />} />
                <Route path="onchain" element={<ChainPage />} />
                <Route path="health" element={<DataHealthPage />} />
                <Route path="activity" element={<ActivityPage />} />
                <Route path="wallet/:address" element={<WalletRedirect />} />
                <Route path="wallet" element={<Navigate to="/" replace />} />
                <Route
                  path="alerts"
                  element={
                    <WithLegacyAnchor>
                      <AlertsPage />
                    </WithLegacyAnchor>
                  }
                />
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
