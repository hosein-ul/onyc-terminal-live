import {
  Activity,
  Bell,
  Code2,
  Droplets,
  LayoutDashboard,
  Network,
  ShieldAlert,
  Trophy,
  TrendingUp,
  Umbrella,
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

/** The eleven pages of docs/SPEC.md, in order. */
export const NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, hint: "The morning view" },
  { to: "/nav", label: "NAV & Yield", icon: TrendingUp, hint: "Price, returns, yield sources" },
  {
    to: "/market",
    label: "Peg & Liquidity",
    icon: Droplets,
    hint: "Market price, pools, redemptions",
  },
  {
    to: "/reinsurance",
    label: "Reinsurance Book",
    icon: Umbrella,
    hint: "Layers, exposure, renewals",
  },
  { to: "/capital", label: "Capital & DeFi", icon: Network, hint: "Where the capital sits" },
  { to: "/points", label: "Points", icon: Trophy, hint: "Emission, leaderboard, concentration" },
  { to: "/wallet", label: "Wallet Lab", icon: Wallet, hint: "Look up any address" },
  { to: "/risk", label: "Risk & Transparency", icon: ShieldAlert, hint: "Independent signals" },
  { to: "/health", label: "Data Health", icon: Activity, hint: "Sources and conflicts" },
  { to: "/activity", label: "Activity & Alerts", icon: Bell, hint: "Events and the Telegram bot" },
  { to: "/developers", label: "Developers", icon: Code2, hint: "API and MCP" },
];
