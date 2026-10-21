import { desc, eq, schema, sql } from "@onyc/db";
import { formatDate, formatPercent } from "@onyc/format";
import { CONSTANTS, SOURCE, decodePriceVector, jupiter, onreCore } from "@onyc/sources";
import type { Ctx, Job } from "../context.js";
import { emitEvent } from "../events.js";
import { track } from "../health.js";
import { chunked, floorToMinute, saveRaw } from "../snapshots.js";

const ONYC = CONSTANTS.onycMint;

/** Every 60 s: NAV, APY, TVL from OnRe and the market price from Jupiter. */
export const liveJob: Job = {
  name: "live",
  schedule: "0 * * * * *",
  async run(ctx) {
    const o = ctx.fetchOptions;
    const [nav, apy, tvl, price] = await Promise.all([
      track(ctx, SOURCE.core, "GET /data/live-nav", () => onreCore.liveNav(o)),
      track(ctx, SOURCE.core, "GET /data/live-apy", () => onreCore.liveApy(o)),
      track(ctx, SOURCE.core, "GET /data/live-tvl", () => onreCore.liveTvl(o)),
      track(ctx, SOURCE.jupiter, "GET /price/v3", () => jupiter.price(ONYC, o)),
    ]);

    const navValue = nav?.data ?? null;
    const marketPrice = price?.data[ONYC]?.usdPrice ?? null;
    const premiumBps =
      navValue !== null && marketPrice !== null ? (marketPrice / navValue - 1) * 1e4 : null;
    const values = {
      nav: navValue,
      apy: apy?.data ?? null,
      tvl: tvl?.data ?? null,
      marketPrice,
      premiumBps,
    };
    if (Object.values(values).every((v) => v === null)) return;

    const ts = floorToMinute(ctx.now());
    await ctx.handle.db
      .insert(schema.liveTicks)
      .values({ ts, ...values })
      .onConflictDoUpdate({ target: schema.liveTicks.ts, set: values });
  },
};

/** Hourly: the whole daily NAV history in one call. The first run is the backfill from 2025-05-28. */
export const navHistoryJob: Job = {
  name: "nav-history",
  schedule: "0 5 * * * *",
  async run(ctx) {
    const result = await track(ctx, SOURCE.core, "GET /data/nav", () =>
      onreCore.navHistory(ctx.fetchOptions),
    );
    if (result === null) return;
    await saveRaw(ctx, SOURCE.core, "GET /data/nav", result, "json");

    const rows = result.data.map((row) => ({
      date: row.date,
      nav: row.nav,
      aum: row.aum,
      circulatingSupply: row.circulatingSupply,
      fetchedAt: result.fetchedAt,
    }));
    await chunked(rows, 500, (chunk) =>
      ctx.handle.db
        .insert(schema.navDaily)
        .values(chunk)
        .onConflictDoUpdate({
          target: schema.navDaily.date,
          set: {
            nav: sql`excluded.nav`,
            aum: sql`excluded.aum`,
            circulatingSupply: sql`excluded.circulating_supply`,
            fetchedAt: sql`excluded.fetched_at`,
          },
        }),
    );

    // The sheet is the only source of the reported APY per day; copy it across where it exists.
    await ctx.handle.db.execute(sql`
      update nav_daily d set apy_reported = s.apy
      from nav_sheet_daily s
      where d.date = s.date and s.apy is not null and d.apy_reported is distinct from s.apy`);

    const ascending = [...result.data].sort((a, b) => (a.date < b.date ? -1 : 1));
    const first = ascending[0];
    if (first !== undefined && first.date !== "2025-05-28") {
      ctx.log.warn({ firstDate: first.date }, "NAV history no longer starts on 2025-05-28");
    }
    for (let i = 1; i < ascending.length; i += 1) {
      const today = ascending[i];
      const yesterday = ascending[i - 1];
      if (today === undefined || yesterday === undefined || today.nav >= yesterday.nav) continue;
      await emitEvent(ctx, {
        kind: "nav_downtick",
        severity: "alert",
        title: `NAV down-tick on ${formatDate(today.date)}`,
        body: `NAV fell from ${yesterday.nav} to ${today.nav}.`,
        data: { date: today.date, from: yesterday.nav, to: today.nav },
        dedupKey: `nav_downtick:${today.date}`,
        ts: new Date(`${today.date}T00:00:00Z`),
      });
    }
  },
};

/** Every 5 minutes: mint offers and their price vectors. A new vector is a NAV re-pricing. */
export const offersJob: Job = {
  name: "offers",
  schedule: "0 */5 * * * *",
  async run(ctx) {
    const result = await track(ctx, SOURCE.core, "GET /offers", () =>
      onreCore.offers(ctx.fetchOptions),
    );
    if (result === null) return;
    await saveRaw(ctx, SOURCE.core, "GET /offers", result, "json");
    const now = ctx.now();
    const { db } = ctx.handle;

    for (const offer of result.data) {
      await db
        .insert(schema.mintOffers)
        .values({
          address: offer.address,
          tokenInMint: offer.tokenInMint,
          tokenOutMint: offer.tokenOutMint,
          price: offer.price,
          apy: offer.apy,
          activeNow: offer.activeNow,
          allowPermissionless: offer.allowPermissionless,
          feeBasisPoints: offer.feeBasisPoints,
          disabled: offer.disabled,
          validFrom: new Date(offer.validFrom),
          firstSeen: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.mintOffers.address,
          set: {
            price: offer.price,
            apy: offer.apy,
            activeNow: offer.activeNow,
            allowPermissionless: offer.allowPermissionless,
            feeBasisPoints: offer.feeBasisPoints,
            disabled: offer.disabled,
            validFrom: new Date(offer.validFrom),
            updatedAt: now,
          },
        });

      for (const vector of offer.vectors) {
        const inserted = await db
          .insert(schema.priceVectors)
          .values({
            offer: offer.address,
            startTime: new Date(vector.startTime * 1000),
            baseTime: new Date(vector.baseTime * 1000),
            basePrice: vector.basePrice,
            apr: vector.apr,
            priceFixDuration: vector.priceFixDuration,
            state: vector.state,
            firstSeen: now,
          })
          .onConflictDoNothing()
          .returning({ id: schema.priceVectors.id });
        if (inserted.length === 0) continue;

        const decoded = decodePriceVector(vector);
        // Both mint offers share the same vectors, so the event key leaves the offer out.
        await emitEvent(ctx, {
          kind: "nav_repriced",
          severity: "info",
          title: `NAV price vector from ${formatDate(decoded.startTime)}`,
          body: `Base price ${decoded.basePrice.toFixed(9)}, APR ${formatPercent(decoded.apr, 4)}, base time ${formatDate(decoded.baseTime)}.`,
          data: {
            startTime: vector.startTime,
            baseTime: vector.baseTime,
            basePrice: vector.basePrice,
            apr: vector.apr,
          },
          dedupKey: `vector:${vector.startTime}:${vector.baseTime}:${vector.basePrice}:${vector.apr}`,
          ts: decoded.startTime,
        });
      }
    }
  },
};

/** Every 5 minutes: redemption offers, settings and the public request log. */
export const redemptionJob: Job = {
  name: "redemption",
  schedule: "0 2-57/5 * * * *",
  async run(ctx) {
    const o = ctx.fetchOptions;
    const now = ctx.now();
    const { db } = ctx.handle;

    const offers = await track(ctx, SOURCE.core, "GET /redemption/offers", () =>
      onreCore.redemptionOffers(o),
    );
    if (offers !== null) {
      await saveRaw(ctx, SOURCE.core, "GET /redemption/offers", offers, "json");
      for (const offer of offers.data) {
        const t = schema.redemptionOffersSnap;
        const latest = (
          await db
            .select()
            .from(t)
            .where(eq(t.offer, offer.offerAddress))
            .orderBy(desc(t.ts))
            .limit(1)
        )[0];
        const same =
          latest !== undefined &&
          latest.executed === offer.executedRedemptions &&
          latest.requested === offer.requestedRedemptions &&
          latest.feeBps === offer.feeBasisPoints &&
          latest.propAmmFeeBps === offer.feeBasisPointsPropAmmSell &&
          latest.vaultTarget === offer.vaultTarget &&
          latest.disabled === offer.disabled;
        if (same) continue;
        await db.insert(t).values({
          ts: now,
          offer: offer.offerAddress,
          redemptionOffer: offer.redemptionOfferAddress,
          tokenOutMint: offer.tokenOutMint,
          executed: offer.executedRedemptions,
          requested: offer.requestedRedemptions,
          feeBps: offer.feeBasisPoints,
          propAmmFeeBps: offer.feeBasisPointsPropAmmSell,
          vaultTarget: offer.vaultTarget,
          disabled: offer.disabled,
        });
      }
    }

    const settings = await track(ctx, SOURCE.core, "GET /redemption/settings", () =>
      onreCore.redemptionSettings(o),
    );
    if (settings !== null) {
      await saveRaw(ctx, SOURCE.core, "GET /redemption/settings", settings, "json");
      const s = settings.data;
      const t = schema.redemptionSettingsSnap;
      const latest = (await db.select().from(t).orderBy(desc(t.ts)).limit(1))[0];
      const same =
        latest !== undefined &&
        latest.allowPartial === s.allowPartialRedemptions &&
        latest.coolDown === s.coolDown &&
        latest.growthRate === s.growthRate &&
        latest.initialCapacity === s.initialCapacity &&
        latest.maxCapacity === s.maxCapacity &&
        latest.maxSharePerRequest === s.maxSharePerRequest &&
        latest.startTime.getTime() === new Date(s.startTime).getTime();
      if (!same) {
        await db.insert(t).values({
          ts: now,
          allowPartial: s.allowPartialRedemptions,
          coolDown: s.coolDown,
          growthRate: s.growthRate,
          initialCapacity: s.initialCapacity,
          maxCapacity: s.maxCapacity,
          maxSharePerRequest: s.maxSharePerRequest,
          startTime: new Date(s.startTime),
        });
      }
    }

    await ingestRedemptionLog(ctx);
  },
};

async function ingestRedemptionLog(ctx: Ctx): Promise<void> {
  const { db } = ctx.handle;
  const size = 100;
  let page = 0;
  let totalPages = 1;
  while (page < totalPages && page < 50) {
    const current = page;
    const result = await track(ctx, SOURCE.core, "GET /redemption/requests", () =>
      onreCore.redemptionRequests(current, size, ctx.fetchOptions),
    );
    if (result === null) return;
    if (page === 0) await saveRaw(ctx, SOURCE.core, "GET /redemption/requests", result, "json");
    totalPages = result.data.page.totalPages;
    const now = ctx.now();
    const rows = result.data.content.map((r) => ({
      requestNumber: r.id,
      redeemer: r.redeemer,
      offerPda: r.redemptionOfferPda,
      requestPda: r.redemptionRequestPda,
      status: r.requestStatus,
      requestedAt: r.requestedAt == null ? null : new Date(r.requestedAt),
      redemptionTime: r.redemptionTime == null ? null : new Date(r.redemptionTime),
      amount: r.amount,
      fulfilledAmount: r.fulfilledAmount,
      tokenInMint: r.tokenInMint,
      tokenOutMint: r.tokenOutMint,
      submissionTx: r.submissionTx ?? null,
      fulfillmentTxs: r.fulfillmentTxs,
      firstSeen: now,
      lastSeen: now,
    }));
    await chunked(rows, 200, (chunk) =>
      db
        .insert(schema.redemptionRequests)
        .values(chunk)
        .onConflictDoUpdate({
          target: schema.redemptionRequests.requestPda,
          set: {
            status: sql`excluded.status`,
            requestedAt: sql`excluded.requested_at`,
            redemptionTime: sql`excluded.redemption_time`,
            fulfilledAmount: sql`excluded.fulfilled_amount`,
            fulfillmentTxs: sql`excluded.fulfillment_txs`,
            lastSeen: sql`excluded.last_seen`,
          },
        }),
    );
    page += 1;
  }
}

/** Every 15 minutes: `/settings` for token supplies and the sUSDe benchmark. Written on change. */
export const settingsJob: Job = {
  name: "settings",
  schedule: "0 7-52/15 * * * *",
  async run(ctx) {
    const result = await track(ctx, SOURCE.core, "GET /settings", () =>
      onreCore.settings(ctx.fetchOptions),
    );
    if (result === null) return;
    await saveRaw(ctx, SOURCE.core, "GET /settings", result, "json");
    const s = result.data;
    const supplies = Object.fromEntries(
      Object.entries(s.tokens).map(([mint, token]) => [
        mint,
        { symbol: token.symbol, supply: token.supply },
      ]),
    );
    const onycSupply = s.tokens[s.primaryToken]?.supply ?? null;

    const t = schema.settingsSnap;
    const latest = (await ctx.handle.db.select().from(t).orderBy(desc(t.ts)).limit(1))[0];
    const same =
      latest !== undefined &&
      latest.onycApy === s.misc.onycApy &&
      latest.susdeApyPct === s.misc.sUSDeAPY &&
      latest.tvlValue === s.misc.tvlValue &&
      latest.onycSupply === onycSupply &&
      JSON.stringify(latest.tokenSupplies) === JSON.stringify(supplies);
    if (same) return;
    await ctx.handle.db.insert(t).values({
      ts: ctx.now(),
      onycApy: s.misc.onycApy,
      susdeApyPct: s.misc.sUSDeAPY,
      tvlValue: s.misc.tvlValue,
      onycSupply,
      tokenSupplies: supplies,
    });
  },
};
