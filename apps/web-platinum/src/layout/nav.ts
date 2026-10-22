import {
  Bell,
  LayoutDashboard,
  ShieldAlert,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** One line shown under the label in the mobile menu. */
  hint: string;
}

/** The five pages. The older eleven pages live inside these and their old addresses redirect (see App.tsx). */
export const NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, hint: "The whole picture, top to bottom" },
  { to: "/yield", label: "Yield & Points", icon: TrendingUp, hint: "Returns, DeFi venues, points" },
  {
    to: "/risk",
    label: "Risk & Reinsurance",
    icon: ShieldAlert,
    hint: "Signals, exits, the insurance book, data health",
  },
  { to: "/wallet", label: "Wallet", icon: Wallet, hint: "Look up any address" },
  { to: "/alerts", label: "Alerts & API", icon: Bell, hint: "Events, Telegram, API and MCP" },
];
