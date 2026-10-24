import {
  CONSTANTS,
  classify,
  instructionDiscriminator,
  onycMoves,
  venueMove,
  type ParsedTransaction,
} from "@onyc/sources";
import { describe, expect, it } from "vitest";

const ONYC = CONSTANTS.onycMint;
const P = CONSTANTS.onreProgram;
const bal = (accountIndex: number, amount: bigint) => ({
  accountIndex,
  mint: ONYC,
  uiTokenAmount: { amount: amount.toString(), decimals: 9 },
});
const base: ParsedTransaction = {
  slot: 1,
  blockTime: 1_760_000_000,
  signature: "sig",
  err: null,
  signer: "signer",
  accountKeys: [],
  instructions: [],
  preTokenBalances: [],
  postTokenBalances: [],
};
const ins = (name: string) => ({
  programId: P,
  discriminator: instructionDiscriminator(name),
  accounts: [],
});
const T = 10n ** 9n;

describe("onycMoves", () => {
  it("a mint raises the supply by the amount received", () => {
    const tx = { ...base, postTokenBalances: [bal(3, 1000n * T)] };
    expect(onycMoves(tx)).toEqual({ supplyDelta: 1000, largestMove: 1000 });
  });

  it("a burn that empties an account lowers the supply even when the account is missing afterwards", () => {
    const tx = { ...base, preTokenBalances: [bal(3, 400n * T)] };
    expect(onycMoves(tx)).toEqual({ supplyDelta: -400, largestMove: 400 });
  });

  it("a plain transfer between two accounts changes nothing in total", () => {
    const tx = {
      ...base,
      preTokenBalances: [bal(1, 500n * T), bal(2, 0n)],
      postTokenBalances: [bal(1, 200n * T), bal(2, 300n * T)],
    };
    expect(onycMoves(tx)).toEqual({ supplyDelta: 0, largestMove: 300 });
  });

  it("ignores other mints", () => {
    const tx = {
      ...base,
      postTokenBalances: [
        {
          accountIndex: 1,
          mint: CONSTANTS.usdcMint,
          uiTokenAmount: { amount: "5000000", decimals: 6 },
        },
      ],
    };
    expect(onycMoves(tx)).toEqual({ supplyDelta: 0, largestMove: 0 });
  });
});

describe("classify", () => {
  it("names a permissionless mint from its instruction", () => {
    const tx = {
      ...base,
      instructions: [ins("take_offer_permissionless_v2")],
      postTokenBalances: [bal(3, 50n * T)],
    };
    const c = classify(tx, 100_000);
    expect(c?.kind).toBe("mint");
    expect(c?.instruction).toBe("take_offer_permissionless_v2");
    expect(c?.supplyDelta).toBe(50);
  });

  it("prefers the most informative instruction when a transaction holds several", () => {
    const tx = {
      ...base,
      instructions: [ins("refresh_market_stats"), ins("fulfill_redemption_request")],
    };
    expect(classify(tx, 100_000)?.kind).toBe("redeem_fulfilled");
  });

  it("keeps configuration changes and price vector changes apart", () => {
    expect(classify({ ...base, instructions: [ins("add_offer_vector")] }, 100_000)?.kind).toBe(
      "price_vector",
    );
    expect(classify({ ...base, instructions: [ins("set_kill_switch")] }, 100_000)?.kind).toBe(
      "admin_config",
    );
  });

  it("records a transfer without program instructions only when it reaches the large threshold", () => {
    const move = (n: bigint) => ({
      ...base,
      preTokenBalances: [bal(1, n * T)],
      postTokenBalances: [bal(1, 0n), bal(2, n * T)],
    });
    expect(classify(move(99_999n), 100_000)).toBeNull();
    const large = classify(move(100_000n), 100_000);
    expect(large?.kind).toBe("large_transfer");
    expect(large?.largestMove).toBe(100_000);
  });

  it("ignores instructions of other programs", () => {
    const tx = {
      ...base,
      instructions: [
        { programId: "other", discriminator: instructionDiscriminator("take_offer"), accounts: [] },
      ],
    };
    expect(classify(tx, 100_000)).toBeNull();
  });
});

describe("moves into and out of protocols", () => {
  const owned = (accountIndex: number, amount: bigint, owner: string) => ({
    ...bal(accountIndex, amount),
    owner,
  });
  const venues = new Map([
    ["kamino-owner", { label: "Kamino Lend", protocol: "Kamino", kind: "lending" as const }],
  ]);

  it("a deposit raises the protocol's balance and is a venue_in of that size", () => {
    const tx = {
      ...base,
      preTokenBalances: [owned(1, 5_000n * T, "user"), owned(2, 100n * T, "kamino-owner")],
      postTokenBalances: [owned(1, 0n, "user"), owned(2, 5_100n * T, "kamino-owner")],
    };
    expect(venueMove(tx, venues)?.net).toBe(5_000);
    const c = classify(tx, 100_000, venues, 1_000);
    expect(c?.kind).toBe("venue_in");
    expect(c?.venue?.label).toBe("Kamino Lend");
    expect(c?.largestMove).toBe(5_000);
  });

  it("a withdrawal is a venue_out and a move below the minimum is ignored", () => {
    const out = {
      ...base,
      preTokenBalances: [owned(2, 9_000n * T, "kamino-owner")],
      postTokenBalances: [owned(2, 6_000n * T, "kamino-owner"), owned(1, 3_000n * T, "user")],
    };
    expect(classify(out, 100_000, venues, 1_000)?.kind).toBe("venue_out");
    const small = {
      ...base,
      preTokenBalances: [owned(2, 9n * T, "kamino-owner")],
      postTokenBalances: [owned(2, 8n * T, "kamino-owner"), owned(1, 1n * T, "user")],
    };
    expect(classify(small, 100_000, venues, 1_000)).toBeNull();
  });

  it("program instructions still win over a venue move", () => {
    const tx = {
      ...base,
      instructions: [ins("take_offer")],
      postTokenBalances: [owned(2, 5_000n * T, "kamino-owner")],
    };
    expect(classify(tx, 100_000, venues, 1_000)?.kind).toBe("mint");
  });
});
