/**
 * The glossary. Every term the apps show has one plain sentence ("short"), one sentence on why it matters ("why"), and
 * the basis of the definition:
 *  - "onre": stated in OnRe's public documentation or returned by its APIs;
 *  - "method": how this tool computes or labels something, which OnRe does not define;
 *  - "industry": the ordinary insurance or DeFi meaning, used because OnRe's pages use the label without defining it.
 * Where the basis is not "onre" the entry says so in "note". Nothing here is an OnRe statement unless the basis says so.
 */

export type TermBasis = "onre" | "method" | "industry";

export interface Term {
  id: string;
  /** How the term is written when it is the heading of an entry. */
  term: string;
  /** Other spellings that should also be recognised in text. Longest match wins. */
  aliases: string[];
  /** One sentence, no jargon. */
  short: string;
  /** One sentence on why a reader should care. */
  why: string;
  basis: TermBasis;
  /** What is and is not known, when the basis is not plain "onre". */
  note?: string;
  source?: { label: string; url: string };
}

const DOCS = "https://docs.onre.finance";

export const TERMS: Term[] = [
  {
    id: "nav",
    term: "NAV",
    aliases: ["net asset value"],
    short:
      "The official value of one ONyc in US dollars, published once a day by OnRe and so far moving up in small daily steps.",
    why: "The market price is judged against it, and it is the starting point for what a redemption pays.",
    basis: "onre",
    note: "A redemption does not pay exactly NAV: fees and a liquidity discount apply.",
    source: {
      label: "OnRe docs: Redemptions and onchain liquidity",
      url: `${DOCS}/technical-resources/redemptions-and-onchain-liquidity`,
    },
  },
  {
    id: "apy",
    term: "APY",
    aliases: ["annual percentage yield", "live APY", "reported APY", "realised APY"],
    short:
      "The yearly return you would get if today's rate carried on for a year and each day's gain earned more the next day.",
    why: "It lets you compare ONyc with other places for your money; the reported figure and what really happened over 30 days can differ.",
    basis: "onre",
    note: "Reported APY is OnRe's own figure. Realised APY is this tool's calculation from the last 30 days of NAV.",
  },
  {
    id: "aum",
    term: "AUM",
    aliases: ["assets under management", "TVL"],
    short: "The total dollar value of the assets behind all ONyc in circulation.",
    why: "A shrinking AUM means people are taking money out; it also sets how much any single exit weighs.",
    basis: "onre",
    note: "Seven sources report this number and they differ by a few percent because they measure slightly different things.",
  },
  {
    id: "circulating-supply",
    term: "Circulating supply",
    aliases: ["supply"],
    short: "How many ONyc tokens exist right now.",
    why: "When it falls, holders are redeeming; when it grows, new money is coming in.",
    basis: "onre",
  },
  {
    id: "premium-discount",
    term: "Premium / discount",
    aliases: ["premium", "discount", "peg"],
    short:
      "How far the price on the open market is above (premium) or below (discount) the official NAV.",
    why: "A discount means you can buy ONyc below its official value but also that sellers are in a hurry.",
    basis: "method",
    note: "Computed here from the Jupiter market price and OnRe's NAV.",
  },
  {
    id: "bps",
    term: "bps",
    aliases: ["basis points", "basis point", "bp"],
    short: "A basis point is one hundredth of one percent, so 100 bps is 1%.",
    why: "Small differences such as fees and discounts are easier to compare in bps than in decimals.",
    basis: "industry",
  },
  {
    id: "liquidity-layer",
    term: "Liquidity layer",
    aliases: ["liquidity layer coverage", "liquid collateral"],
    short:
      "A part of the money that OnRe keeps unallocated so that people can exit and the price can be supported.",
    why: "It is the cushion for exits; if it is thin, big redemptions are harder.",
    basis: "onre",
    note: "This tool shows two numbers and names them apart: the policy share (15% of AUM, as on OnRe's Transparency page) and the measured balance (collateral flagged as liquidity layer in OnRe's collateral sheet). OnRe's docs describe unallocated reserves but give no single definition of the layer.",
    source: { label: "OnRe docs: ONyc buybacks", url: `${DOCS}/onyc-in-defi/onyc-buybacks` },
  },
  {
    id: "collateral-ratio",
    term: "Collateral ratio",
    aliases: ["collateralization", "collateralisation"],
    short:
      "Assets held divided by tokens issued; above 100% there is more behind the tokens than the tokens are worth.",
    why: "It is the plainest check that every token is covered.",
    basis: "onre",
    note: "The figure comes from Accountable's proof of solvency, not from OnRe directly.",
  },
  {
    id: "proof-of-solvency",
    term: "Proof of solvency",
    aliases: ["solvency"],
    short:
      "A report by an independent firm (Accountable) listing the reserves held and the tokens issued at a point in time.",
    why: "It is the independent evidence that the money exists; an old report proves less, so its age is shown.",
    basis: "onre",
    source: {
      label: "OnRe docs: Independent attestations",
      url: `${DOCS}/security-and-verification/independent-attestations`,
    },
  },
  {
    id: "bound-capital",
    term: "Bound capital",
    aliases: ["bound"],
    short: "Money that is already committed to reinsurance contracts.",
    why: "It is the part of the fund that earns insurance premium, and the part at risk if a disaster happens.",
    basis: "onre",
    note: "Here: the sum of layers marked Bound in OnRe's reinsurance sheet.",
  },
  {
    id: "offered-capital",
    term: "Offered capital",
    aliases: ["offered"],
    short: "Money offered to reinsurance contracts that are not yet agreed.",
    why: "It shows how much new insurance business is in the pipeline; it is often zero.",
    basis: "onre",
    note: "Here: the sum of layers marked Offered in OnRe's reinsurance sheet.",
  },
  {
    id: "available-capital",
    term: "Available capital",
    aliases: ["available"],
    short: "The rest of the fund: not committed to insurance and not part of the liquidity layer.",
    why: "It sits in collateral assets earning ordinary yield and can be moved into new layers.",
    basis: "method",
    note: "Computed here as AUM minus bound, offered and the liquidity layer.",
  },
  {
    id: "reinsurance-layer",
    term: "Reinsurance layer",
    aliases: ["layer", "layers", "reinsurance book"],
    short:
      "One reinsurance contract: ONyc's capital agrees to pay part of the losses from certain disasters, and in return receives a premium.",
    why: "The book of layers is where the extra yield comes from and where the risk sits.",
    basis: "onre",
    source: {
      label: "OnRe docs: Reinsurance deals overview",
      url: `${DOCS}/reinsurance-framework/reinsurance-deals-overview`,
    },
  },
  {
    id: "ilw",
    term: "ILW",
    aliases: ["industry loss warranty"],
    short:
      "A contract that pays out only when total losses across the whole industry from one event pass a set size.",
    why: "Whether it pays depends on the size of the disaster, not on any one insurer's own loss.",
    basis: "industry",
    note: "OnRe's layer table uses this label; the meaning given is the usual one in insurance.",
  },
  {
    id: "quota-share",
    term: "Quota share",
    aliases: ["quota"],
    short:
      "A contract where the reinsurer takes a fixed percentage of an insurer's policies, with that percentage of premiums and of losses.",
    why: "Losses and gains rise and fall in step with the insurer's whole portfolio.",
    basis: "industry",
    note: "OnRe's layer table uses this label; the meaning given is the usual one in insurance.",
  },
  {
    id: "per-occurrence",
    term: "Per occurrence",
    aliases: ["per-occ", "1st event per occ", "2nd event per occ", "first event"],
    short: "A contract that pays for the losses of a single event, once they pass a set size.",
    why: "One big disaster can trigger it, so concentration in one region matters.",
    basis: "industry",
    note: "OnRe's layer table uses this label; the meaning given is the usual one in insurance.",
  },
  {
    id: "aggregate",
    term: "Aggregate",
    aliases: ["1st-3rd event aggregate"],
    short:
      "A contract that pays when the losses from several events in a period add up past a set size.",
    why: "Many medium events can trigger it, not just one large one.",
    basis: "industry",
    note: "OnRe's layer table uses this label; the meaning given is the usual one in insurance.",
  },
  {
    id: "expected-loss",
    term: "Expected loss",
    aliases: ["EL"],
    short:
      "The average yearly loss a layer is modelled to suffer, as listed in OnRe's reinsurance sheet.",
    why: "A premium far above the expected loss is the margin that pays for the risk taken.",
    basis: "onre",
    note: "A model figure, not a forecast; real years can be far better or far worse.",
  },
  {
    id: "expected-yield",
    term: "Expected yield",
    aliases: ["book yield"],
    short: "The return the sheet expects on a layer's capital if losses match the model.",
    why: "It is where the high end of ONyc's yield comes from, and it assumes losses behave as modelled.",
    basis: "onre",
  },
  {
    id: "renewal",
    term: "Renewal",
    aliases: ["renewal date", "renewals"],
    short: "The date a reinsurance contract ends and has to be agreed again, often at a new price.",
    why: "When many layers renew in the same month, the yield of the book can change at once.",
    basis: "onre",
  },
  {
    id: "looping",
    term: "Looping",
    aliases: ["loop", "leveraged"],
    short:
      "Depositing ONyc, borrowing against it, buying more ONyc with the loan and repeating, to hold more ONyc than you put in.",
    why: "It lifts both the yield and the risk, and a large share of ONyc in loops can be sold in a forced wave if the price slips.",
    basis: "onre",
    source: {
      label: "OnRe docs: Looping and leveraged exposure",
      url: `${DOCS}/onyc-in-defi/defi-opportunities/looping-and-leveraged-exposure`,
    },
  },
  {
    id: "ltv-liquidation",
    term: "LTV and liquidation",
    aliases: ["LTV", "loan-to-value", "liquidation", "liquidated"],
    short:
      "LTV is how much you borrowed compared with what you put up; if it climbs past the lender's limit your position is sold to repay the loan, which is liquidation.",
    why: "A small fall in the price can wipe out a position that is close to the limit.",
    basis: "industry",
  },
  {
    id: "pt",
    term: "PT",
    aliases: ["principal token", "PT-ONyc", "PT-srONyc"],
    short:
      "A token that trades below its face value and is worth exactly its face value on a set date.",
    why: "Buying it locks in a fixed return if you hold to that date.",
    basis: "onre",
    note: "Defined on Exponent, the venue that issues it; OnRe's points program gives PT tokens no points.",
  },
  {
    id: "yt",
    term: "YT",
    aliases: ["yield token"],
    short:
      "A token that receives the yield of the underlying asset until a set date, but not the asset itself.",
    why: "It is a leveraged bet on yield: it can pay a lot or nothing.",
    basis: "onre",
    source: {
      label: "OnRe docs: Yield trading",
      url: `${DOCS}/onyc-in-defi/defi-opportunities/yield-trading`,
    },
  },
  {
    id: "sr-ronyc",
    term: "srONyc",
    aliases: ["senior tranche", "senior"],
    short:
      "The protected share of ONyc on Exponent: lower yield, and it is paid back after the junior share has taken losses.",
    why: "It suits holders who want ONyc's reinsurance yield with a buffer under it.",
    basis: "onre",
    source: {
      label: "OnRe docs: Risk-tranching markets",
      url: `${DOCS}/onyc-in-defi/defi-opportunities/risk-tranching-markets`,
    },
  },
  {
    id: "jr-ronyc",
    term: "jrONyc",
    aliases: ["junior tranche", "junior", "tranche", "tranches", "tranching"],
    short:
      "The first-loss share of ONyc on Exponent: it earns more, and it loses first when losses happen.",
    why: "Higher yield here is payment for taking the losses before anyone else.",
    basis: "onre",
    source: {
      label: "OnRe docs: Risk-tranching markets",
      url: `${DOCS}/onyc-in-defi/defi-opportunities/risk-tranching-markets`,
    },
  },
  {
    id: "points-multiplier",
    term: "Points multiplier",
    aliases: ["multiplier", "multipliers", "global multiplier", "points"],
    short:
      "OnRe's points formula is balance × days × 1 point per ONyc per day × a multiplier for where the ONyc is used (for example 1x in a wallet, 6x in a loop).",
    why: "It decides how many points the same money earns in different places.",
    basis: "onre",
    note: "The leaderboard also reports a global multiplier of 0.0001 since 3 October 2026, which OnRe does not explain. It is shown as reported.",
    source: { label: "OnRe docs: Points program", url: `${DOCS}/onyc-in-defi/onre-points-program` },
  },
  {
    id: "rank-change",
    term: "Rank change",
    aliases: ["rankChange"],
    short: "How many places a wallet has moved on the points leaderboard, as reported by OnRe.",
    why: "It shows whether a wallet is gaining or losing ground against others.",
    basis: "onre",
    note: "OnRe does not say over what period it is measured. This tool also computes its own 1, 7 and 30 day moves.",
  },
  {
    id: "price-vector",
    term: "Price vector",
    aliases: ["price vectors"],
    short:
      "The schedule that sets NAV: a starting price, a yearly rate and a start date, from which the price grows a little every day.",
    why: "It lets you see tomorrow's NAV in advance, and it is how a sudden change of rate shows up.",
    basis: "method",
    note: "OnRe's docs do not use this term. It is the name of the on-chain parameter set that this tool decodes; the decoded schedule matches the published NAV exactly.",
  },
  {
    id: "down-tick",
    term: "Down-tick",
    aliases: ["down-ticks", "downtick", "downticks"],
    short: "A day on which NAV was lower than the day before.",
    why: "NAV is meant to rise steadily, so any fall is worth knowing about.",
    basis: "method",
    note: "Counted here from OnRe's daily NAV history; OnRe does not publish a list of down-ticks.",
  },
  {
    id: "redemption-fee",
    term: "Redemption fee",
    aliases: ["exit fee", "redemption"],
    short:
      "A small fee taken when you turn ONyc back into dollars with OnRe instead of selling it on the market.",
    why: "It is part of what it costs to leave.",
    basis: "onre",
    note: "OnRe's API shows 25 bps for a request and 20 to 30 bps on the PropAMM route; its docs state a 30 bps service fee. The figures differ, so check the quote before a large exit.",
    source: {
      label: "OnRe docs: Redemptions",
      url: `${DOCS}/technical-resources/redemptions-and-onchain-liquidity`,
    },
  },
  {
    id: "propamm",
    term: "PropAMM",
    aliases: ["prop amm", "prop-amm"],
    short:
      "One of OnRe's own ways to sell ONyc for dollars directly, with its own fee shown per offer.",
    why: "It is an exit route that does not depend on the market price.",
    basis: "onre",
    note: "OnRe's docs only name it (PropAmmPairState) and do not define it. The fee comes from OnRe's API.",
  },
  {
    id: "net-flow",
    term: "Net flow",
    aliases: ["net flows", "flow effect"],
    short:
      "Money that came in minus money that went out over a period, estimated from the change in the number of tokens.",
    why: "It separates a fall in AUM caused by people leaving from one caused by prices.",
    basis: "method",
    note: "Estimated here from supply changes multiplied by NAV; OnRe does not publish flows.",
  },
];

export const TERM_BY_ID: ReadonlyMap<string, Term> = new Map(TERMS.map((t) => [t.id, t]));
