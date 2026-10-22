import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeBase58, encodeBase58 } from "./base58.js";
import {
  concentration,
  labelHolders,
  totalsByOwner,
  venueFromPrograms,
  whaleMoves,
  type RawHolding,
} from "./holders.js";
import { identifyInstruction } from "./instructions.js";
import {
  accountDiscriminator,
  decodeExcludedAccounts,
  decodeMarketStats,
  decodeOffer,
  decodeRedemptionOffer,
  decodeState,
  discriminatorFilter,
  instructionDiscriminator,
} from "./layouts.js";
import { associatedTokenAddress, findProgramAddress, isOnCurve } from "./pda.js";

const fixture = <T>(name: string): T =>
  JSON.parse(
    readFileSync(new URL(`../../fixtures/onchain/${name}.json`, import.meta.url), "utf8"),
  ) as T;
const bytes = (b64: string): Uint8Array => Uint8Array.from(Buffer.from(b64, "base64"));

const PROGRAM = "onreuGhHHgVzMWSkj2oQDLDtvvGvoepBPkqyaubFcwe";
const ONYC = "5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5";

describe("base58", () => {
  it("round-trips an address and keeps leading zeros", () => {
    expect(encodeBase58(decodeBase58(PROGRAM))).toBe(PROGRAM);
    expect(encodeBase58(Uint8Array.from([0, 0, 1]))).toBe("112");
    expect(decodeBase58("112")).toEqual(Uint8Array.from([0, 0, 1]));
  });
  it("rejects characters outside the alphabet", () => {
    expect(() => decodeBase58("0OIl")).toThrow();
  });
});

describe("discriminators", () => {
  it("match the values read from live accounts", () => {
    expect(Buffer.from(accountDiscriminator("State")).toString("hex")).toBe("d8926b5e684bb6b1");
    expect(Buffer.from(accountDiscriminator("MarketStats")).toString("hex")).toBe(
      "f02db6e95c76d153",
    );
    expect(discriminatorFilter("State").bytes).toBe(encodeBase58(accountDiscriminator("State")));
  });
  it("name the instructions seen in live transactions", () => {
    expect(
      identifyInstruction(instructionDiscriminator("take_offer_permissionless_v2"))?.kind,
    ).toBe("mint");
    expect(identifyInstruction(instructionDiscriminator("fulfill_redemption_request"))?.kind).toBe(
      "redeem_fulfilled",
    );
    expect(identifyInstruction(instructionDiscriminator("open_swap_sell"))?.kind).toBe(
      "propamm_sell",
    );
    expect(identifyInstruction(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });
});

describe("program derived addresses", () => {
  it("find the State and MarketStats accounts that exist on chain", () => {
    const state = fixture<{ pubkey: string }>("state");
    const stats = fixture<{ pubkey: string }>("market-stats");
    expect(findProgramAddress(["state"], PROGRAM).address).toBe(state.pubkey);
    expect(findProgramAddress(["market_stats"], PROGRAM).address).toBe(stats.pubkey);
  });
  it("derive the associated token account of the OnRe program for ONyc", () => {
    expect(associatedTokenAddress(PROGRAM, ONYC)).toBe(
      "6KUfN8WjrUvCjkznKBqB9jdeyM7y4EwLEyjFpE3mEoqR",
    );
  });
  it("tells a wallet key from a derived address", () => {
    // A program id is an ordinary key pair, so it is on the curve; a program derived address never is.
    expect(isOnCurve(decodeBase58(PROGRAM))).toBe(true);
    expect(isOnCurve(decodeBase58(fixture<{ pubkey: string }>("state").pubkey))).toBe(false);
  });
});

describe("account decoders on live fixtures", () => {
  it("State: boss, mint and admins", () => {
    const s = decodeState(bytes(fixture<{ data: string }>("state").data));
    expect(s.onycMint).toBe(ONYC);
    expect(s.boss).toBe("45YnzauhsBM8CpUz96Djf8UG5vqq2Dua62wuW9H3jaJ5");
    expect(s.isKilled).toBe(false);
    expect(s.admins.length).toBe(2);
  });

  it("circulating supply excludes the boss wallet's ONyc, which explains total supply against circulating supply", () => {
    const stats = decodeMarketStats(bytes(fixture<{ data: string }>("market-stats").data));
    const mint = fixture<{ supply: string }>("mint");
    const excluded = decodeExcludedAccounts(
      bytes(fixture<{ data: string }>("excluded-accounts").data),
    );
    expect(excluded.owners).toEqual(["45YnzauhsBM8CpUz96Djf8UG5vqq2Dua62wuW9H3jaJ5"]);
    const total = Number(BigInt(mint.supply)) / 1e9;
    const circulating = Number(stats.circulatingSupply) / 1e9;
    // 254.83M total minus 244.83M circulating is the 10.0M the boss wallet held when the stats were refreshed.
    expect(total - circulating).toBeGreaterThan(9.9e6);
    expect(total - circulating).toBeLessThan(10.2e6);
  });

  it("Offer: three offers, the mint offers carry vectors and the USDT offer none", () => {
    const offers = fixture<{ pubkey: string; data: string }[]>("offers").map((o) => ({
      pubkey: o.pubkey,
      d: decodeOffer(bytes(o.data)),
    }));
    expect(offers.length).toBe(3);
    const usdc = offers.find((o) => o.pubkey === "E88zkA9Pxb1i8EfSHrEW5ZUe6hiQbo8DHWQ3WhDFw7p6");
    expect(usdc?.d.tokenOutMint).toBe(ONYC);
    expect(usdc?.d.vectors.length).toBe(3);
    expect(offers.filter((o) => o.d.vectors.length === 0).length).toBe(1);
  });

  it("RedemptionOffer: fees and executed totals match the API's /redemption/offers", () => {
    const reds = fixture<{ data: string }[]>("redemption-offers").map((o) =>
      decodeRedemptionOffer(bytes(o.data)),
    );
    const usdc = reds.find(
      (r) => r.tokenOutMint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    );
    expect(usdc?.feeBasisPoints).toBe(25);
    expect(usdc?.feeBasisPointsPropAmmSell).toBe(20);
    expect(Number(usdc?.executedRedemptions) / 1e9).toBeCloseTo(5_293_625.682329137, 6);
  });
});

describe("holders", () => {
  const holding = (owner: string, amount: bigint, tokenAccount = owner + "-ata"): RawHolding => ({
    tokenAccount,
    owner,
    amount,
  });

  it("sums token accounts by owner and drops empty ones", () => {
    const totals = totalsByOwner([
      holding("a", 5n * 1_000_000_000n),
      holding("a", 5n * 1_000_000_000n, "a2"),
      holding("b", 1n * 1_000_000_000n),
      holding("c", 0n),
    ]);
    expect(totals.map((t) => [t.owner, t.amount, t.accounts])).toEqual([
      ["a", 10_000_000_000n, 2],
      ["b", 1_000_000_000n, 1],
    ]);
  });

  it("measures concentration: one owner with everything is a Gini near 1 and a top-1 share of 1", () => {
    const equal = concentration(
      totalsByOwner([1, 2, 3, 4].map((i) => holding(String(i), 10n ** 9n))),
      [1, 2],
    );
    expect(equal.gini).toBeCloseTo(0, 6);
    expect(equal.top[0]?.share).toBeCloseTo(0.25, 6);
    const skew = concentration(
      totalsByOwner([
        holding("whale", 10n ** 15n),
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => holding(String(i), 10n ** 9n)),
      ]),
      [1],
    );
    expect(skew.gini).toBeGreaterThan(0.85);
    expect(skew.top[0]?.share).toBeGreaterThan(0.99);
  });

  it("finds new and exited whales between two scans", () => {
    const threshold = 100n * 10n ** 9n;
    const before = totalsByOwner([
      holding("old", 500n * 10n ** 9n),
      holding("keep", 500n * 10n ** 9n),
    ]);
    const after = totalsByOwner([
      holding("new", 300n * 10n ** 9n),
      holding("keep", 500n * 10n ** 9n),
      holding("small", 5n * 10n ** 9n),
    ]);
    const moves = whaleMoves(before, after, threshold)
      .map((m) => `${m.kind}:${m.owner}`)
      .sort();
    expect(moves).toEqual(["exited:old", "new:new"]);
  });

  it("labels a venue from the programs a transaction called, lending before pools before routers", () => {
    expect(
      venueFromPrograms([
        "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
        "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
        "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD",
        "11111111111111111111111111111111",
      ])?.protocol,
    ).toBe("Kamino");
    expect(venueFromPrograms(["11111111111111111111111111111111"])).toBeNull();
  });

  it("labels the saved top holders: the Kamino lending authority holds 134M ONyc, the OnRe boss about 10M", () => {
    const top = fixture<{ owner: string; amount: string; kind: string }[]>("holders-top300");
    const probe =
      fixture<{ owner: string; onyc: number; programs: string[] }[]>("holder-programs-probe");
    const kamino = probe.find((p) =>
      p.programs.includes("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"),
    );
    expect(kamino?.onyc).toBeGreaterThan(130_000_000);
    expect(venueFromPrograms(kamino?.programs ?? [])?.protocol).toBe("Kamino");
    expect(top.length).toBe(300);
  });

  it("labelHolders uses the owner program and fixed addresses without any network call", async () => {
    const rpc = {
      getMultipleAccounts: (addrs: string[]) =>
        Promise.resolve(
          addrs.map((a) =>
            a === "wallet"
              ? {
                  pubkey: a,
                  lamports: 1,
                  owner: "11111111111111111111111111111111",
                  executable: false,
                  data: new Uint8Array(),
                }
              : a === "pool"
                ? {
                    pubkey: a,
                    lamports: 1,
                    owner: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
                    executable: false,
                    data: new Uint8Array(),
                  }
                : null,
          ),
        ),
    };
    const labelled = await labelHolders(
      rpc as never,
      [
        { owner: "boss", amount: 3n, accounts: 1 },
        { owner: "wallet", amount: 2n, accounts: 1 },
        { owner: "pool", amount: 1n, accounts: 1 },
      ],
      { extra: { boss: { label: "OnRe boss wallet", protocol: "OnRe", kind: "onre" } } },
    );
    expect(labelled.map((h) => [h.owner, h.kind, h.venue?.protocol ?? null, h.labelledBy])).toEqual(
      [
        ["boss", "unknown", "OnRe", "address"],
        ["wallet", "wallet", null, null],
        ["pool", "program", "Orca", "owner-program"],
      ],
    );
  });
});
