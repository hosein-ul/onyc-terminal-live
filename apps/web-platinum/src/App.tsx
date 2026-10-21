import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { ActivityPage } from "./pages/Activity";
import { CapitalDefiPage } from "./pages/CapitalDefi";
import { DevelopersPage } from "./pages/Developers";
import { HealthPage } from "./pages/Health";
import { NavYieldPage } from "./pages/NavYield";
import { OverviewPage } from "./pages/Overview";
import { PegLiquidityPage } from "./pages/PegLiquidity";
import { PointsPage } from "./pages/Points";
import { ReinsurancePage } from "./pages/Reinsurance";
import { RiskPage } from "./pages/Risk";
import { WalletPage } from "./pages/Wallet";
import { ChartsGallery } from "./routes/ChartsGallery";

export function App() {
  return (
    <Routes>
      <Route path="/_charts" element={<ChartsGallery />} />
      <Route
        path="*"
        element={
          <AppShell>
            <Routes>
              <Route index element={<OverviewPage />} />
              <Route path="nav" element={<NavYieldPage />} />
              <Route path="market" element={<PegLiquidityPage />} />
              <Route path="reinsurance" element={<ReinsurancePage />} />
              <Route path="capital" element={<CapitalDefiPage />} />
              <Route path="points" element={<PointsPage />} />
              <Route path="wallet" element={<WalletPage />} />
              <Route path="wallet/:address" element={<WalletPage />} />
              <Route path="risk" element={<RiskPage />} />
              <Route path="health" element={<HealthPage />} />
              <Route path="activity" element={<ActivityPage />} />
              <Route path="developers" element={<DevelopersPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
        }
      />
    </Routes>
  );
}
