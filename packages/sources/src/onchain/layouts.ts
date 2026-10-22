import { createHash } from "node:crypto";
import { decodeBase58, encodeBase58 } from "./base58.js";

/**
 * Account layouts of the OnRe program, read from github.com/onre-finance/onre-sol (programs/onreapp/src), checked against
 * live accounts on 22 October 2026:
 *  - state.rs `State`, `MarketStats`
 *  - instructions/offer/offer_state.rs `Offer`, `OfferVector` (zero copy, 608 bytes)
 *  - instructions/redemption/redemption_offer_state.rs `RedemptionOffer` (256 bytes), `RedemptionRequest`
 * Anchor accounts start with an 8 byte discriminator: the first 8 bytes of sha256("account:<Name>").
 */

export const accountDiscriminator = (name: string): Uint8Array =>
  Uint8Array.from(createHash("sha256").update(`account:${name}`).digest().subarray(0, 8));

export const instructionDiscriminator = (name: string): Uint8Array =>
  Uint8Array.from(createHash("sha256").update(`global:${name}`).digest().subarray(0, 8));

/** The memcmp value (base58) that selects accounts of one Anchor type. */
export const discriminatorFilter = (name: string): { offset: number; bytes: string } => ({
  offset: 0,
  bytes: encodeBase58(accountDiscriminator(name)),
});

export const hasDiscriminator = (data: Uint8Array, name: string): boolean => {
  const d = accountDiscriminator(name);
  return d.every((b, i) => data[i] === b);
};

class Reader {
  private at = 0;
  private readonly view: DataView;
  constructor(readonly data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }
  skip(n: number): void {
    this.at += n;
  }
  u8(): number {
    const v = this.view.getUint8(this.at);
    this.at += 1;
    return v;
  }
  u16(): number {
    const v = this.view.getUint16(this.at, true);
    this.at += 2;
    return v;
  }
  u32(): number {
    const v = this.view.getUint32(this.at, true);
    this.at += 4;
    return v;
  }
  u64(): bigint {
    const v = this.view.getBigUint64(this.at, true);
    this.at += 8;
    return v;
  }
  i64(): bigint {
    const v = this.view.getBigInt64(this.at, true);
    this.at += 8;
    return v;
  }
  u128(): bigint {
    const lo = this.u64();
    const hi = this.u64();
    return (hi << 64n) | lo;
  }
  pubkey(): string {
    const v = encodeBase58(this.data.subarray(this.at, this.at + 32));
    this.at += 32;
    return v;
  }
  string(): string {
    const len = this.u32();
    const v = Buffer.from(this.data.subarray(this.at, this.at + len)).toString("utf8");
    this.at += len;
    return v;
  }
}

function expect(data: Uint8Array, name: string): Reader {
  if (!hasDiscriminator(data, name)) {
    throw new Error(`account is not a ${name} (discriminator mismatch)`);
  }
  const r = new Reader(data);
  r.skip(8);
  return r;
}

export interface OfferVectorAccount {
  startTime: bigint;
  baseTime: bigint;
  /** Scale 1e9 (PRICE_DECIMALS = 9 in constants.rs). */
  basePrice: bigint;
  /** Scale 1e6: 10_000 is 1% (offer_utils.rs, calculate_vector_price). */
  apr: bigint;
  priceFixDuration: bigint;
}

export interface OfferAccount {
  tokenInMint: string;
  tokenOutMint: string;
  /** Non-empty vectors only (start time 0 marks an unused slot). */
  vectors: OfferVectorAccount[];
  feeBasisPoints: number;
  disabled: boolean;
  feeBasisPointsPermissionless: number;
}

export const MAX_VECTORS = 10;

export function decodeOffer(data: Uint8Array): OfferAccount {
  const r = expect(data, "Offer");
  const tokenInMint = r.pubkey();
  const tokenOutMint = r.pubkey();
  const vectors: OfferVectorAccount[] = [];
  for (let i = 0; i < MAX_VECTORS; i++) {
    const v = {
      startTime: r.u64(),
      baseTime: r.u64(),
      basePrice: r.u64(),
      apr: r.u64(),
      priceFixDuration: r.u64(),
    };
    if (v.startTime !== 0n) vectors.push(v);
  }
  const feeBasisPoints = r.u16();
  r.skip(1); // bump
  r.skip(1); // needs_approval
  r.skip(1); // allow_permissionless
  const disabled = r.u8() !== 0;
  const feeBasisPointsPermissionless = r.u16();
  return {
    tokenInMint,
    tokenOutMint,
    vectors,
    feeBasisPoints,
    disabled,
    feeBasisPointsPermissionless,
  };
}

export interface RedemptionOfferAccount {
  offer: string;
  tokenInMint: string;
  tokenOutMint: string;
  /** ONyc, 9 decimals. */
  executedRedemptions: bigint;
  requestedRedemptions: bigint;
  feeBasisPoints: number;
  vaultTargetBps: number;
  disabled: boolean;
  feeBasisPointsPropAmmSell: number;
}

export function decodeRedemptionOffer(data: Uint8Array): RedemptionOfferAccount {
  const r = expect(data, "RedemptionOffer");
  const offer = r.pubkey();
  const tokenInMint = r.pubkey();
  const tokenOutMint = r.pubkey();
  const executedRedemptions = r.u128();
  const requestedRedemptions = r.u128();
  const feeBasisPoints = r.u16();
  r.skip(8); // gap
  r.skip(1); // bump
  const vaultTargetBps = r.u16();
  const disabled = r.u8() !== 0;
  const feeBasisPointsPropAmmSell = r.u16();
  return {
    offer,
    tokenInMint,
    tokenOutMint,
    executedRedemptions,
    requestedRedemptions,
    feeBasisPoints,
    vaultTargetBps,
    disabled,
    feeBasisPointsPropAmmSell,
  };
}

export interface RedemptionRequestAccount {
  offer: string;
  requestId: string;
  redeemer: string;
  /** ONyc, 9 decimals. */
  amount: bigint;
  fulfilledAmount: bigint;
}

export function decodeRedemptionRequest(data: Uint8Array): RedemptionRequestAccount {
  const r = expect(data, "RedemptionRequest");
  const offer = r.pubkey();
  const requestId = r.string();
  const redeemer = r.pubkey();
  const amount = r.u64();
  r.skip(1); // bump
  const fulfilledAmount = r.u64();
  return { offer, requestId, redeemer, amount, fulfilledAmount };
}

export interface MarketStatsAccount {
  /** Scale 1e6 like the vector APR (get_apy.rs). */
  apy: bigint;
  circulatingSupply: bigint;
  /** Scale 1e9. */
  nav: bigint;
  navAdjustment: bigint;
  /** Scale 1e9 (dollars): 283_547_009_181_578_000 on 22 October 2026 is $283.5M. */
  tvl: bigint;
  lastUpdatedAt: bigint;
  lastUpdatedSlot: bigint;
}

export function decodeMarketStats(data: Uint8Array): MarketStatsAccount {
  const r = expect(data, "MarketStats");
  return {
    apy: r.u64(),
    circulatingSupply: r.u64(),
    nav: r.u64(),
    navAdjustment: r.i64(),
    tvl: r.u64(),
    lastUpdatedAt: r.i64(),
    lastUpdatedSlot: r.u64(),
  };
}

export interface StateAccount {
  boss: string;
  proposedBoss: string;
  isKilled: boolean;
  onycMint: string;
  admins: string[];
  approver1: string;
  approver2: string;
  maxSupply: bigint;
  worker: string;
  maxMintAmount: bigint;
  mainOffer: string;
}

const SYSTEM = "11111111111111111111111111111111";

export function decodeState(data: Uint8Array): StateAccount {
  const r = expect(data, "State");
  const boss = r.pubkey();
  const proposedBoss = r.pubkey();
  const isKilled = r.u8() !== 0;
  const onycMint = r.pubkey();
  const admins: string[] = [];
  for (let i = 0; i < 20; i++) {
    const a = r.pubkey();
    if (a !== SYSTEM) admins.push(a);
  }
  const approver1 = r.pubkey();
  const approver2 = r.pubkey();
  r.skip(1); // bump
  const maxSupply = r.u64();
  const worker = r.pubkey();
  const maxMintAmount = r.u64();
  const mainOffer = r.pubkey();
  return {
    boss,
    proposedBoss,
    isKilled,
    onycMint,
    admins,
    approver1,
    approver2,
    maxSupply,
    worker,
    maxMintAmount,
    mainOffer,
  };
}

export interface CirculatingExcludedAccounts {
  owners: string[];
}

export function decodeExcludedAccounts(data: Uint8Array): CirculatingExcludedAccounts {
  const r = expect(data, "CirculatingSupplyExcludedAccounts");
  const owners: string[] = [];
  for (let i = 0; i < 20; i++) {
    const a = r.pubkey();
    if (a !== SYSTEM) owners.push(a);
  }
  return { owners };
}

export interface TokenAccountView {
  mint: string;
  owner: string;
  amount: bigint;
}

/** SPL token account (Token and Token-2022 share the first 165 bytes): mint, owner, amount. */
export function decodeTokenAccount(data: Uint8Array): TokenAccountView {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    mint: encodeBase58(data.subarray(0, 32)),
    owner: encodeBase58(data.subarray(32, 64)),
    amount: view.getBigUint64(64, true),
  };
}

export const base58Bytes = decodeBase58;
