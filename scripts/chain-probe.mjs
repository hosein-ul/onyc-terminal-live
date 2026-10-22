#!/usr/bin/env node
// Reads the OnRe program and the ONyc mint from Solana, prints what it finds and saves raw fixtures.
// Usage: node scripts/chain-probe.mjs [part]   (part: state | holders | activity | vaults; default state)
// Uses HELIUS_API_KEY when set, otherwise the public RPC (slow, rate limited). Read-only.
import { mkdirSync, writeFileSync } from "node:fs";
import {
  CONSTANTS,
  SolanaRpc,
  associatedTokenAddress,
  decodeExcludedAccounts,
  decodeMarketStats,
  decodeOffer,
  decodeRedemptionOffer,
  decodeRedemptionRequest,
  decodeState,
  decodeTokenAccount,
  discriminatorFilter,
  findProgramAddress,
  identifyInstruction,
  KNOWN_PROGRAMS,
  TOKEN_PROGRAM,
} from "../packages/sources/dist/index.js";

const part = process.argv[2] ?? "state";
const dir = new URL("../packages/sources/fixtures/onchain/", import.meta.url);
mkdirSync(dir, { recursive: true });
const save = (name, value) =>
  writeFileSync(
    new URL(name, dir),
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2),
  );
const b64 = (u8) => Buffer.from(u8).toString("base64");

const rpc = new SolanaRpc({ heliusKey: process.env.HELIUS_API_KEY });
console.log("provider:", rpc.provider);
const P = CONSTANTS.onreProgram;
const ONYC = CONSTANTS.onycMint;

async function accountsOf(name, size) {
  const filters = [{ memcmp: discriminatorFilter(name) }];
  if (size) filters.unshift({ dataSize: size });
  return rpc.getProgramAccounts(P, filters);
}

if (part === "state") {
  const supply = await rpc.getTokenSupply(ONYC);
  console.log("mint supply (ONyc):", Number(supply.amount) / 1e9);
  const mintAcc = await rpc.getAccount(ONYC);
  save("mint.json", {
    supply: supply.amount,
    decimals: supply.decimals,
    owner: mintAcc.owner,
    data: b64(mintAcc.data),
  });

  const state = (await accountsOf("State"))[0];
  const s = decodeState(state.data);
  console.log("State", state.pubkey, {
    boss: s.boss,
    killed: s.isKilled,
    mint: s.onycMint,
    admins: s.admins.length,
    mainOffer: s.mainOffer,
    worker: s.worker,
  });
  save("state.json", { pubkey: state.pubkey, data: b64(state.data) });

  const offers = await accountsOf("Offer", 608);
  console.log("Offers:", offers.length);
  save(
    "offers.json",
    offers.map((o) => ({ pubkey: o.pubkey, data: b64(o.data) })),
  );
  for (const o of offers) {
    const d = decodeOffer(o.data);
    console.log(
      " offer",
      o.pubkey,
      "in",
      d.tokenInMint.slice(0, 6),
      "out",
      d.tokenOutMint.slice(0, 6),
      "vectors",
      d.vectors.length,
      "fee",
      d.feeBasisPoints,
      "disabled",
      d.disabled,
    );
  }

  const redOffers = await accountsOf("RedemptionOffer", 256);
  save(
    "redemption-offers.json",
    redOffers.map((o) => ({ pubkey: o.pubkey, data: b64(o.data) })),
  );
  for (const o of redOffers) {
    const d = decodeRedemptionOffer(o.data);
    console.log(
      " redemption offer",
      o.pubkey,
      "out",
      d.tokenOutMint.slice(0, 6),
      "executed",
      Number(d.executedRedemptions) / 1e9,
      "requested",
      Number(d.requestedRedemptions) / 1e9,
      "fee",
      d.feeBasisPoints,
      "propAmm",
      d.feeBasisPointsPropAmmSell,
      "vaultTargetBps",
      d.vaultTargetBps,
    );
  }

  const reqs = await accountsOf("RedemptionRequest");
  save(
    "redemption-requests.json",
    reqs.map((o) => ({ pubkey: o.pubkey, data: b64(o.data) })),
  );
  const decoded = reqs.map((r) => decodeRedemptionRequest(r.data));
  const open = decoded.filter((r) => r.fulfilledAmount < r.amount);
  console.log(
    "RedemptionRequest accounts:",
    reqs.length,
    "open:",
    open.length,
    "open ONyc:",
    open.reduce((a, r) => a + Number(r.amount - r.fulfilledAmount) / 1e9, 0),
  );

  const stats = (await accountsOf("MarketStats"))[0];
  const m = decodeMarketStats(stats.data);
  console.log("MarketStats", stats.pubkey, {
    nav: Number(m.nav) / 1e9,
    apy: Number(m.apy) / 1e6,
    circ: Number(m.circulatingSupply) / 1e9,
    tvl: Number(m.tvl) / 1e9,
    at: new Date(Number(m.lastUpdatedAt) * 1000).toISOString(),
  });
  save("market-stats.json", { pubkey: stats.pubkey, data: b64(stats.data) });

  const ex = await accountsOf("CirculatingSupplyExcludedAccounts");
  if (ex[0]) {
    const e = decodeExcludedAccounts(ex[0].data);
    console.log("Circulating-supply excluded owners:", e.owners);
    save("excluded-accounts.json", {
      pubkey: ex[0].pubkey,
      owners: e.owners,
      data: b64(ex[0].data),
    });
  }

  // Derived addresses from constants.rs seeds, checked against what exists.
  const pdas = {
    state: findProgramAddress(["state"], P),
    offerVaultAuthority: findProgramAddress(["offer_vault_authority"], P),
    redemptionVaultAuthority: findProgramAddress(["redemption_offer_vault_authority"], P),
    reserveVaultAuthority: findProgramAddress(["reserve_vault_authority"], P),
    marketStats: findProgramAddress(["market_stats"], P),
    mintAuthority: findProgramAddress(["mint_authority"], P),
  };
  console.log("PDAs:", Object.fromEntries(Object.entries(pdas).map(([k, v]) => [k, v.address])));
  console.log("State PDA matches discovered State account:", pdas.state.address === state.pubkey);
  console.log("MarketStats PDA matches:", pdas.marketStats.address === stats.pubkey);
  save("pdas.json", pdas);
}

if (part === "holders") {
  const t0 = Date.now();
  const accounts = await rpc.getProgramAccounts(
    TOKEN_PROGRAM,
    [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: ONYC } }],
    { offset: 32, length: 40 },
  );
  console.log("token accounts:", accounts.length, "in", Date.now() - t0, "ms");
  const parsed = accounts.map((a) => ({
    account: a.pubkey,
    owner: Buffer.from(a.data.subarray(0, 32)).toString("hex"),
    amount: Buffer.from(a.data.subarray(32, 40)).readBigUInt64LE(0),
  }));
  save(
    "holders-raw.json",
    accounts.map((a) => ({ pubkey: a.pubkey, data: b64(a.data) })),
  );
  console.log("non-empty:", parsed.filter((p) => p.amount > 0n).length);
}

if (part === "activity") {
  const sigs = await rpc.getSignatures(P, { limit: 100 });
  console.log(
    "program signatures:",
    sigs.length,
    "newest",
    sigs[0] && new Date((sigs[0].blockTime ?? 0) * 1000).toISOString(),
  );
  save("signatures-program.json", sigs);
  const kinds = {};
  const sample = [];
  for (const s of sigs.filter((x) => x.err === null).slice(0, 25)) {
    const tx = await rpc.getTransaction(s.signature);
    if (!tx) continue;
    const ins = tx.instructions
      .filter((i) => i.programId === P)
      .map((i) => identifyInstruction(i.discriminator));
    for (const i of ins) {
      const k = i ? `${i.kind}:${i.name}` : "unknown";
      kinds[k] = (kinds[k] ?? 0) + 1;
    }
    sample.push({
      signature: s.signature,
      slot: tx.slot,
      blockTime: tx.blockTime,
      signer: tx.signer,
      ins: ins.map((i) => i?.name ?? null),
    });
  }
  console.log(kinds);
  save("transactions-sample.json", sample);
}
console.log(
  "known programs:",
  Object.keys(KNOWN_PROGRAMS).length,
  "ATA example:",
  associatedTokenAddress(P, ONYC),
);

if (part === "holders2") {
  const { scanMintHoldings, totalsByOwner, labelHolders, concentration, byProtocol } =
    await import("../packages/sources/dist/index.js");
  const holdings = await scanMintHoldings(rpc, ONYC);
  const totals = totalsByOwner(holdings);
  console.log("owners:", totals.length, "token accounts:", holdings.length);
  const c = concentration(totals);
  console.log(
    "gini",
    c.gini.toFixed(4),
    c.top.map((t) => `top${t.n}=${(t.share * 100).toFixed(1)}%`).join(" "),
  );
  const labelled = await labelHolders(rpc, totals.slice(0, 300));
  save(
    "holders-top300.json",
    labelled.map((h) => ({
      owner: h.owner,
      amount: h.amount.toString(),
      accounts: h.accounts,
      ownerProgram: h.ownerProgram,
      venue: h.venue,
      kind: h.kind,
    })),
  );
  console.log(
    byProtocol(labelled)
      .map((x) => `${x.protocol}: ${x.onyc.toFixed(0)}`)
      .join("\n"),
  );
  const unlabelled = {};
  for (const h of labelled.filter((x) => x.kind === "program" && !x.venue))
    unlabelled[h.ownerProgram] = (unlabelled[h.ownerProgram] ?? 0) + Number(h.amount) / 1e9;
  console.log(
    "unlabelled programs by ONyc:",
    Object.entries(unlabelled)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12),
  );
}
