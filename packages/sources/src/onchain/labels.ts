/**
 * Who holds ONyc. A token account has an owner; when that owner is itself an account owned by a known program (a lending
 * market, a pool, a vault), the holder is labelled with that program. Wallets owned by the System program are "wallet".
 * How each id was confirmed (22 October 2026): the Kamino Lend id appears in the transactions of the account holding 134.08M ONyc,
 * which at NAV is $155.3M against $154.95M of Kamino capital in OnRe's rewards API; the Exponent id owns the account holding
 * 28.94M ONyc ($33.5M against $33.50M). Orca and Raydium are the published Whirlpool and CLMM ids. See docs/DATA_SOURCES.md section 10.
 */
export interface Venue {
  label: string;
  /** Group used in tables and bars; one protocol can have several programs. */
  protocol: string;
  kind: "lending" | "dex" | "yield" | "vault" | "aggregator" | "onre";
}

export const KNOWN_PROGRAMS: Record<string, Venue> = {
  KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD: {
    label: "Kamino Lend",
    protocol: "Kamino",
    kind: "lending",
  },
  kvauTFR8qm1dhniz6pYuBZkuene3Hfrs1VQhVRgCNrr: {
    label: "Kamino Vaults",
    protocol: "Kamino",
    kind: "vault",
  },
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: {
    label: "Orca Whirlpool",
    protocol: "Orca",
    kind: "dex",
  },
  "1oopBoJG58DgkUVKkEzKgyG9dvRmpgeEm1AVjoHkF78": {
    label: "Loopscale",
    protocol: "Loopscale",
    kind: "lending",
  },
  XP1BRLn8eCYSygrd8er5P4GKdzqKbC3DLoSsS5UYVZy: {
    label: "Exponent",
    protocol: "Exponent",
    kind: "yield",
  },
  FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr: {
    label: "Kamino Farms",
    protocol: "Kamino",
    kind: "lending",
  },
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: {
    label: "Raydium CLMM",
    protocol: "Raydium",
    kind: "dex",
  },
  onreuGhHHgVzMWSkj2oQDLDtvvGvoepBPkqyaubFcwe: {
    label: "OnRe program",
    protocol: "OnRe",
    kind: "onre",
  },
};

/** Holders that are not programs: exchanges and custodians are labelled only when the address is published by them. */
export const KNOWN_WALLETS: Record<string, Venue> = {};
