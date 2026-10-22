import {
  Activity,
  Bell,
  Coins,
  HeartPulse,
  LayoutDashboard,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Umbrella,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** One line shown under the label in the mobile menu. */
  hint: string;
  /** Sidebar group heading. */
  group: "Returns" | "Risk" | "Live" | "";
}

/** One page per subject, in groups. The older combined addresses redirect (see App.tsx). */
export const NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, hint: "The whole picture", group: "" },
  {
    to: "/nav",
    label: "NAV & Yield",
    icon: TrendingUp,
    hint: "How ONyc earns and its price",
    group: "Returns",
  },
  {
    to: "/capital",
    label: "Capital & DeFi",
    icon: Coins,
    hint: "Where the capital sits",
    group: "Returns",
  },
  {
    to: "/points",
    label: "Points",
    icon: Sparkles,
    hint: "Who earns points and how much",
    group: "Returns",
  },
  {
    to: "/risk",
    label: "Risk Signals",
    icon: ShieldAlert,
    hint: "Independent checks with limits",
    group: "Risk",
  },
  {
    to: "/market",
    label: "Peg & Exits",
    icon: Scale,
    hint: "Market price and how to exit",
    group: "Risk",
  },
  {
    to: "/reinsurance",
    label: "Reinsurance",
    icon: Umbrella,
    hint: "The insurance book behind the yield",
    group: "Risk",
  },
  {
    to: "/onchain",
    label: "On-chain Checks",
    icon: ShieldCheck,
    hint: "What the contract says",
    group: "Risk",
  },
  {
    to: "/health",
    label: "Data Health",
    icon: HeartPulse,
    hint: "Sources and conflicts",
    group: "Risk",
  },
  {
    to: "/activity",
    label: "Activity",
    icon: Activity,
    hint: "Every live program transaction",
    group: "Live",
  },
  { to: "/alerts", label: "Alerts", icon: Bell, hint: "Events and Telegram alerts", group: "Live" },
];
