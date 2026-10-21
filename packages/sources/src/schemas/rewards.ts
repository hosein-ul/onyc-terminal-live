import { z } from "zod";

const num = z.number();

const marketPairSchema = z.looseObject({ yt: num, lp: num });

/** Points per venue. Extra venues OnRe adds later pass through; a missing one fails validation. */
export const pointsBreakdownSchema = z.looseObject({
  wallet: num,
  permissionlessBoost: num,
  kamino: z.looseObject({
    onyc: num,
    usdg: num,
    usdc: num,
    usds: num,
    onycJitosol: num,
    usdgOnyc: num,
  }),
  exponent: z.looseObject({
    yt: num,
    lp: num,
    markets: z.record(z.string(), marketPairSchema),
    tranching: z.looseObject({ senior: num, junior: num }),
  }),
  loopscale: z.looseObject({ onyc: num, usdc: num }),
  ratex: num,
  carrot: num,
  carrotLending: num,
  elemental: num,
  exponentVault: num,
  onreYieldPlus: num,
  orca: z.looseObject({ onycUsdc: num, onycJitosol: num }),
  referralBonus: num,
});
export type PointsBreakdown = z.infer<typeof pointsBreakdownSchema>;

export const activeMultiplierSchema = z.looseObject({
  sourceType: z.string(),
  multiplier: num,
  effectiveFromDate: z.string(),
  effectiveToDate: z.string().nullable(),
});

const pointsEntryShape = {
  rank: z.number().int(),
  address: z.string(),
  totalPoints: num,
  pointsBreakdown: pointsBreakdownSchema,
  /** Provided by OnRe; the comparison window is not documented. */
  rankChange: num.nullable(),
  activeMultipliers: z.array(activeMultiplierSchema).nullable(),
};

export const leaderboardEntrySchema = z.looseObject(pointsEntryShape);
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

export const walletPointsSchema = z.looseObject(pointsEntryShape);
export type WalletPoints = z.infer<typeof walletPointsSchema>;

export const leaderboardPageSchema = z.looseObject({
  leaderboard: z.looseObject({
    content: z.array(leaderboardEntrySchema),
    totalElements: z.number().int(),
    totalPages: z.number().int(),
    number: z.number().int(),
    size: z.number().int(),
    first: z.boolean(),
    last: z.boolean(),
    empty: z.boolean(),
  }),
});
export type LeaderboardPage = z.infer<typeof leaderboardPageSchema>;

const protocolName = z.string();

export const aumGrowthSchema = z.looseObject({
  series: z.array(
    z.looseObject({
      date: z.string(),
      protocol: protocolName,
      aumUsd: num,
      deltaUsd: num.nullable(),
      deltaPct: num.nullable(),
      normalizationMethod: z.string(),
    }),
  ),
});
export type AumGrowth = z.infer<typeof aumGrowthSchema>;

export const capitalDistributionSchema = z.looseObject({
  asOfDate: z.string(),
  totalAumUsd: num,
  distribution: z.array(
    z.looseObject({
      protocol: protocolName,
      snapshotDate: z.string(),
      capitalUsd: num,
      /** A fraction: 0.547 = 54.7%, despite the name. */
      sharePct: num,
      normalizationMethod: z.string(),
    }),
  ),
});
export type CapitalDistribution = z.infer<typeof capitalDistributionSchema>;

/** Raw `*Raw` fields are ONyc times 1e9 and exceed 2^53, so treat them as approximate. */
export const capitalReconciliationSchema = z.looseObject({
  asOfDate: z.string(),
  navUsd: num,
  circulatingOnycRaw: num,
  circulatingOnycUsd: num,
  rawWalletOnycRaw: num,
  rawWalletUsd: num,
  knownCustodyOnycRaw: num,
  knownCustodyUsd: num,
  adjustedWalletOnycRaw: num,
  adjustedWalletUsd: num,
  attributedProtocolOnycRaw: num,
  attributedProtocolUsd: num,
  unexplainedOnycRaw: num,
  unexplainedOnycUsd: num,
  entries: z.array(
    z.looseObject({
      protocol: protocolName,
      snapshotDate: z.string(),
      onycRaw: num,
      capitalUsd: num,
      normalizationMethod: z.string(),
    }),
  ),
});
export type CapitalReconciliation = z.infer<typeof capitalReconciliationSchema>;

/** Only the last 31 days are served, so the worker stores a daily snapshot to build history. */
export const pointsGrowthSchema = z.looseObject({
  series: z.array(
    z.looseObject({
      date: z.string(),
      basePointsIssued: num,
      referralBonusIssued: num,
      totalPointsIssued: num,
      dailyBaseGrowth: num,
      dailyReferralGrowth: num,
      dailyTotalGrowth: num,
    }),
  ),
});
export type PointsGrowth = z.infer<typeof pointsGrowthSchema>;

export const referralStatsSchema = z.looseObject({
  walletAddress: z.string(),
  totalReferrals: num,
  activeReferrals: num,
  pendingReferrals: num,
  totalReferralBonus: num,
  referralCode: z.string().nullable(),
});

export const referralEligibilitySchema = z.looseObject({
  isEligible: z.boolean(),
  currentRank: num.nullable(),
  totalUsers: num.nullable(),
  requiredRankThreshold: num.nullable(),
});

export const referralStatusSchema = z.looseObject({
  isReferred: z.boolean(),
  referrerWalletAddress: z.string().nullable(),
  referralCode: z.string().nullable(),
  isActive: z.boolean().nullable(),
  activatedAt: z.string().nullable(),
});

export const referralCodeSchema = z.looseObject({
  code: z.string(),
  walletAddress: z.string(),
  isCustom: z.boolean(),
  usageCount: num,
  createdAt: z.string(),
});
