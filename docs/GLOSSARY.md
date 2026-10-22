# Glossary

Generated from `packages/glossary` by `scripts/gen-glossary.mjs`; edit the package, not this file. The same entries power the "?" hints and the `/glossary` page in every app.

Each entry says where its definition comes from: **Stated by OnRe** (public docs or APIs), **This tool's method** (how this tool computes or labels something, which OnRe does not define) or **General meaning** (the ordinary meaning, used because OnRe's pages use the label without defining it).

## Aggregate

*General meaning.*

A contract that pays when the losses from several events in a period add up past a set size.

**Why it matters:** Many medium events can trigger it, not just one large one.

OnRe's layer table uses this label; the meaning given is the usual one in insurance.

## APY

*Stated by OnRe.*

The yearly return you would get if today's rate carried on for a year and each day's gain earned more the next day.

**Why it matters:** It lets you compare ONyc with other places for your money; the reported figure and what really happened over 30 days can differ.

Reported APY is OnRe's own figure. Realised APY is this tool's calculation from the last 30 days of NAV.

## AUM

*Stated by OnRe.*

The total dollar value of the assets behind all ONyc in circulation.

**Why it matters:** A shrinking AUM means people are taking money out; it also sets how much any single exit weighs.

Seven sources report this number and they differ by a few percent because they measure slightly different things.

## Available capital

*This tool's method.*

The rest of the fund: not committed to insurance and not part of the liquidity layer.

**Why it matters:** It sits in collateral assets earning ordinary yield and can be moved into new layers.

Computed here as AUM minus bound, offered and the liquidity layer.

## Bound capital

*Stated by OnRe.*

Money that is already committed to reinsurance contracts.

**Why it matters:** It is the part of the fund that earns insurance premium, and the part at risk if a disaster happens.

Here: the sum of layers marked Bound in OnRe's reinsurance sheet.

## bps

*General meaning.*

A basis point is one hundredth of one percent, so 100 bps is 1%.

**Why it matters:** Small differences such as fees and discounts are easier to compare in bps than in decimals.

## Circulating supply

*Stated by OnRe.*

How many ONyc tokens exist right now.

**Why it matters:** When it falls, holders are redeeming; when it grows, new money is coming in.

## Collateral ratio

*Stated by OnRe.*

Assets held divided by tokens issued; above 100% there is more behind the tokens than the tokens are worth.

**Why it matters:** It is the plainest check that every token is covered.

The figure comes from Accountable's proof of solvency, not from OnRe directly.

## Down-tick

*This tool's method.*

A day on which NAV was lower than the day before.

**Why it matters:** NAV is meant to rise steadily, so any fall is worth knowing about.

Counted here from OnRe's daily NAV history; OnRe does not publish a list of down-ticks.

## Expected loss

*Stated by OnRe.*

The average yearly loss a layer is modelled to suffer, as listed in OnRe's reinsurance sheet.

**Why it matters:** A premium far above the expected loss is the margin that pays for the risk taken.

A model figure, not a forecast; real years can be far better or far worse.

## Expected yield

*Stated by OnRe.*

The return the sheet expects on a layer's capital if losses match the model.

**Why it matters:** It is where the high end of ONyc's yield comes from, and it assumes losses behave as modelled.

## ILW

*General meaning.*

A contract that pays out only when total losses across the whole industry from one event pass a set size.

**Why it matters:** Whether it pays depends on the size of the disaster, not on any one insurer's own loss.

OnRe's layer table uses this label; the meaning given is the usual one in insurance.

## jrONyc

*Stated by OnRe.*

The first-loss share of ONyc on Exponent: it earns more, and it loses first when losses happen.

**Why it matters:** Higher yield here is payment for taking the losses before anyone else.

Source: [OnRe docs: Risk-tranching markets](https://docs.onre.finance/onyc-in-defi/defi-opportunities/risk-tranching-markets)

## Liquidity layer

*Stated by OnRe.*

A part of the money that OnRe keeps unallocated so that people can exit and the price can be supported.

**Why it matters:** It is the cushion for exits; if it is thin, big redemptions are harder.

This tool shows two numbers and names them apart: the policy share (15% of AUM, as on OnRe's Transparency page) and the measured balance (collateral flagged as liquidity layer in OnRe's collateral sheet). OnRe's docs describe unallocated reserves but give no single definition of the layer.

Source: [OnRe docs: ONyc buybacks](https://docs.onre.finance/onyc-in-defi/onyc-buybacks)

## Looping

*Stated by OnRe.*

Depositing ONyc, borrowing against it, buying more ONyc with the loan and repeating, to hold more ONyc than you put in.

**Why it matters:** It lifts both the yield and the risk, and a large share of ONyc in loops can be sold in a forced wave if the price slips.

Source: [OnRe docs: Looping and leveraged exposure](https://docs.onre.finance/onyc-in-defi/defi-opportunities/looping-and-leveraged-exposure)

## LTV and liquidation

*General meaning.*

LTV is how much you borrowed compared with what you put up; if it climbs past the lender's limit your position is sold to repay the loan, which is liquidation.

**Why it matters:** A small fall in the price can wipe out a position that is close to the limit.

## NAV

*Stated by OnRe.*

The official value of one ONyc in US dollars, published once a day by OnRe and so far moving up in small daily steps.

**Why it matters:** The market price is judged against it, and it is the starting point for what a redemption pays.

A redemption does not pay exactly NAV: fees and a liquidity discount apply.

Source: [OnRe docs: Redemptions and onchain liquidity](https://docs.onre.finance/technical-resources/redemptions-and-onchain-liquidity)

## Net flow

*This tool's method.*

Money that came in minus money that went out over a period, estimated from the change in the number of tokens.

**Why it matters:** It separates a fall in AUM caused by people leaving from one caused by prices.

Estimated here from supply changes multiplied by NAV; OnRe does not publish flows.

## Offered capital

*Stated by OnRe.*

Money offered to reinsurance contracts that are not yet agreed.

**Why it matters:** It shows how much new insurance business is in the pipeline; it is often zero.

Here: the sum of layers marked Offered in OnRe's reinsurance sheet.

## Per occurrence

*General meaning.*

A contract that pays for the losses of a single event, once they pass a set size.

**Why it matters:** One big disaster can trigger it, so concentration in one region matters.

OnRe's layer table uses this label; the meaning given is the usual one in insurance.

## Points multiplier

*Stated by OnRe.*

OnRe's points formula is balance × days × 1 point per ONyc per day × a multiplier for where the ONyc is used (for example 1x in a wallet, 6x in a loop).

**Why it matters:** It decides how many points the same money earns in different places.

The leaderboard also reports a global multiplier of 0.0001 since 3 October 2026, which OnRe does not explain. It is shown as reported.

Source: [OnRe docs: Points program](https://docs.onre.finance/onyc-in-defi/onre-points-program)

## Premium / discount

*This tool's method.*

How far the price on the open market is above (premium) or below (discount) the official NAV.

**Why it matters:** A discount means you can buy ONyc below its official value but also that sellers are in a hurry.

Computed here from the Jupiter market price and OnRe's NAV.

## Price vector

*This tool's method.*

The schedule that sets NAV: a starting price, a yearly rate and a start date, from which the price grows a little every day.

**Why it matters:** It lets you see tomorrow's NAV in advance, and it is how a sudden change of rate shows up.

OnRe's docs do not use this term. It is the name of the on-chain parameter set that this tool decodes; the decoded schedule matches the published NAV exactly.

## Proof of solvency

*Stated by OnRe.*

A report by an independent firm (Accountable) listing the reserves held and the tokens issued at a point in time.

**Why it matters:** It is the independent evidence that the money exists; an old report proves less, so its age is shown.

Source: [OnRe docs: Independent attestations](https://docs.onre.finance/security-and-verification/independent-attestations)

## PropAMM

*Stated by OnRe.*

One of OnRe's own ways to sell ONyc for dollars directly, with its own fee shown per offer.

**Why it matters:** It is an exit route that does not depend on the market price.

OnRe's docs only name it (PropAmmPairState) and do not define it. The fee comes from OnRe's API.

## PT

*Stated by OnRe.*

A token that trades below its face value and is worth exactly its face value on a set date.

**Why it matters:** Buying it locks in a fixed return if you hold to that date.

Defined on Exponent, the venue that issues it; OnRe's points program gives PT tokens no points.

## Quota share

*General meaning.*

A contract where the reinsurer takes a fixed percentage of an insurer's policies, with that percentage of premiums and of losses.

**Why it matters:** Losses and gains rise and fall in step with the insurer's whole portfolio.

OnRe's layer table uses this label; the meaning given is the usual one in insurance.

## Rank change

*Stated by OnRe.*

How many places a wallet has moved on the points leaderboard, as reported by OnRe.

**Why it matters:** It shows whether a wallet is gaining or losing ground against others.

OnRe does not say over what period it is measured. This tool also computes its own 1, 7 and 30 day moves.

## Redemption fee

*Stated by OnRe.*

A small fee taken when you turn ONyc back into dollars with OnRe instead of selling it on the market.

**Why it matters:** It is part of what it costs to leave.

OnRe's API shows 25 bps for a request and 20 to 30 bps on the PropAMM route; its docs state a 30 bps service fee. The figures differ, so check the quote before a large exit.

Source: [OnRe docs: Redemptions](https://docs.onre.finance/technical-resources/redemptions-and-onchain-liquidity)

## Reinsurance layer

*Stated by OnRe.*

One reinsurance contract: ONyc's capital agrees to pay part of the losses from certain disasters, and in return receives a premium.

**Why it matters:** The book of layers is where the extra yield comes from and where the risk sits.

Source: [OnRe docs: Reinsurance deals overview](https://docs.onre.finance/reinsurance-framework/reinsurance-deals-overview)

## Renewal

*Stated by OnRe.*

The date a reinsurance contract ends and has to be agreed again, often at a new price.

**Why it matters:** When many layers renew in the same month, the yield of the book can change at once.

## srONyc

*Stated by OnRe.*

The protected share of ONyc on Exponent: lower yield, and it is paid back after the junior share has taken losses.

**Why it matters:** It suits holders who want ONyc's reinsurance yield with a buffer under it.

Source: [OnRe docs: Risk-tranching markets](https://docs.onre.finance/onyc-in-defi/defi-opportunities/risk-tranching-markets)

## YT

*Stated by OnRe.*

A token that receives the yield of the underlying asset until a set date, but not the asset itself.

**Why it matters:** It is a leveraged bet on yield: it can pay a lot or nothing.

Source: [OnRe docs: Yield trading](https://docs.onre.finance/onyc-in-defi/defi-opportunities/yield-trading)
