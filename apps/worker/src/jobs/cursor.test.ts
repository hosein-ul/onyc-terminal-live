import { describe, expect, it } from "vitest";
import {
  SIGNATURE_PAGE,
  advanceCursors,
  collectSignatures,
  planBatch,
  type Cursors,
  type LaneSig,
} from "./cursor.js";

const sig = (n: number, err: unknown = null): LaneSig => ({
  signature: `s${n}`,
  slot: n,
  blockTime: 1_000 + n,
  err,
});
/** Solana lists newest first. */
const newestFirst = (from: number, to: number): LaneSig[] =>
  Array.from({ length: to - from + 1 }, (_, i) => sig(to - i));

describe("planBatch", () => {
  it("lists the oldest transactions first and stops at the batch size", () => {
    const plan = planBatch({ mint: newestFirst(1, 10) }, 4);
    expect(plan.map((e) => e.signature)).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("merges the lanes and counts a signature both lanes saw once", () => {
    const plan = planBatch({ program: newestFirst(3, 5), mint: newestFirst(4, 6) }, 10);
    expect(plan.map((e) => e.signature)).toEqual(["s3", "s4", "s5", "s6"]);
    expect(plan.find((e) => e.signature === "s4")?.lanes).toEqual(["program", "mint"]);
  });

  it("passes failed transactions without counting them against the batch", () => {
    const plan = planBatch({ mint: [sig(4), sig(3, { InstructionError: 1 }), sig(2), sig(1)] }, 2);
    expect(plan.map((e) => [e.signature, e.skip])).toEqual([
      ["s1", false],
      ["s2", false],
      ["s3", true],
    ]);
  });
});

describe("advanceCursors", () => {
  it("moves each lane to the newest handled signature of that lane and leaves a quiet lane alone", () => {
    const plan = planBatch({ program: newestFirst(1, 3), mint: [] }, 10);
    expect(advanceCursors({ program: "old", mint: "keep" }, plan)).toEqual({
      program: "s3",
      mint: "keep",
    });
  });

  it("does not move past entries that were not handled", () => {
    const plan = planBatch({ mint: newestFirst(1, 5) }, 10);
    expect(advanceCursors({}, plan.slice(0, 2))).toEqual({ mint: "s2" });
  });
});

/** A chain of `total` signatures that answers like getSignaturesForAddress with `until` and `before`. */
const fakeChain =
  (total: number) =>
  (o: { limit: number; until?: string; before?: string }): Promise<LaneSig[]> => {
    const all = newestFirst(1, total);
    const start = o.before === undefined ? 0 : all.findIndex((s) => s.signature === o.before) + 1;
    const stop = all.findIndex((s) => s.signature === o.until);
    return Promise.resolve(all.slice(start, stop === -1 ? all.length : stop).slice(0, o.limit));
  };

describe("collectSignatures", () => {
  it("walks past one page to reach a backlog", async () => {
    const { sigs, truncated } = await collectSignatures(fakeChain(250), "s50");
    expect(sigs).toHaveLength(200);
    expect(sigs[0]?.signature).toBe("s250");
    expect(sigs[199]?.signature).toBe("s51");
    expect(truncated).toBe(false);
  });

  it("says so when the page cap leaves older signatures unread", async () => {
    const { sigs, truncated } = await collectSignatures(fakeChain(5_000), undefined);
    expect(sigs).toHaveLength(SIGNATURE_PAGE * 10);
    expect(truncated).toBe(true);
  });
});

/** Runs the job's loop against a fake chain: a backlog bigger than one batch must drain, with every signature read once. */
describe("a run after another, over a backlog", () => {
  it("reads every transaction exactly once and ends caught up", async () => {
    const total = 130;
    const read: string[] = [];
    let cursors: Cursors = {};
    const page = fakeChain(total);
    for (let run = 0; run < 10; run += 1) {
      const { sigs } = await collectSignatures(page, cursors.mint);
      const plan = planBatch({ mint: sigs }, 40);
      for (const e of plan) read.push(e.signature);
      cursors = advanceCursors(cursors, plan);
    }
    expect(read).toHaveLength(total);
    expect(new Set(read).size).toBe(total);
    expect(read[0]).toBe("s1");
    expect(cursors.mint).toBe(`s${total}`);
  });

  it("stays in front of a transaction that could not be fetched", () => {
    const plan = planBatch({ mint: newestFirst(1, 5) }, 10);
    // s3 failed to fetch: only s1 and s2 were handled.
    expect(advanceCursors({ mint: "s0" }, plan.slice(0, 2)).mint).toBe("s2");
  });
});
