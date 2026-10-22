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
  /** Sidebar group heading. */
  group: "Monitor" | "Tools";
}

/** The five pages. The older eleven pages live inside these and their old addresses redirect (see App.tsx). */
export const NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, hint: "The whole picture, top to bottom", group: "Monitor" },
  { to: "/yield", label: "Yield & Points", icon: TrendingUp, hint: "Returns, DeFi venues, points", group: "Monitor" },
  {
    to: "/risk",
    label: "Risk & Reinsurance",
    icon: ShieldAlert,
    hint: "Signals, exits, the insurance book, data health",
    group: "Monitor",
  },
  { to: "/wallet", label: "Wallet", icon: Wallet, hint: "Look up any address", group: "Tools" },
  { to: "/alerts", label: "Alerts & API", icon: Bell, hint: "Events, Telegram, API and MCP", group: "Tools" },
];
