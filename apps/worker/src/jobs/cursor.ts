/**
 * Which Solana signatures the chain-activity job reads next, and where its cursors move afterwards.
 *
 * Two lanes are read (the OnRe program and the ONyc mint). Each lane keeps the newest signature it has fully handled; the next
 * run asks Solana for everything newer. A lane's cursor only moves over signatures that were handled, so a busy minute, a
 * failed fetch or a long outage never makes the job skip or re-read transactions.
 */
export type Lane = "program" | "mint";

/** One signature as `getSignaturesForAddress` returns it. */
export interface LaneSig {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
}

/** A signature of the merged, oldest-first plan. `skip` marks a transaction that failed on chain: nothing to read, but the cursor passes it. */
export interface PlanEntry {
  signature: string;
  slot: number;
  blockTime: number | null;
  lanes: Lane[];
  skip: boolean;
}

export type Cursors = Partial<Record<Lane, string>>;

/**
 * Merge the lanes (each as Solana returns them, newest first) into one list, oldest first, without repeating a signature that
 * both lanes saw. The list stops after `max` transactions that need reading, so the rest waits for the next run.
 */
export function planBatch(
  lists: Partial<Record<Lane, readonly LaneSig[]>>,
  max: number,
): PlanEntry[] {
  const merged = new Map<string, PlanEntry>();
  for (const lane of ["program", "mint"] as const) {
    for (const s of [...(lists[lane] ?? [])].reverse()) {
      const hit = merged.get(s.signature);
      if (hit !== undefined) hit.lanes.push(lane);
      else
        merged.set(s.signature, {
          signature: s.signature,
          slot: s.slot,
          blockTime: s.blockTime,
          lanes: [lane],
          skip: s.err !== null,
        });
    }
  }
  // The sort is stable, so signatures of one slot keep the order Solana gave them.
  const ordered = [...merged.values()].sort((a, b) => a.slot - b.slot);
  const plan: PlanEntry[] = [];
  let reads = 0;
  for (const entry of ordered) {
    if (!entry.skip) {
      if (reads >= max) break;
      reads += 1;
    }
    plan.push(entry);
  }
  return plan;
}

/** Each lane's cursor moves to the newest signature of that lane among the entries that were handled; a lane with none stays put. */
export function advanceCursors(previous: Cursors, handled: readonly PlanEntry[]): Cursors {
  const next: Cursors = { ...previous };
  for (const lane of ["program", "mint"] as const) {
    for (let i = handled.length - 1; i >= 0; i -= 1) {
      const entry = handled[i];
      if (entry !== undefined && entry.lanes.includes(lane)) {
        next[lane] = entry.signature;
        break;
      }
    }
  }
  return next;
}

export const SIGNATURE_PAGE = 100;
export const SIGNATURE_PAGES = 10;

/**
 * Every signature newer than `until` for one address, newest first. Solana returns at most one page at a time, so a backlog is
 * read page by page; `truncated` is true when the cap stopped the walk and older signatures remain unread.
 */
export async function collectSignatures(
  page: (options: { limit: number; until?: string; before?: string }) => Promise<LaneSig[]>,
  until: string | undefined,
): Promise<{ sigs: LaneSig[]; truncated: boolean }> {
  const sigs: LaneSig[] = [];
  let before: string | undefined;
  for (let i = 0; i < SIGNATURE_PAGES; i += 1) {
    const got = await page({
      limit: SIGNATURE_PAGE,
      ...(until === undefined ? {} : { until }),
      ...(before === undefined ? {} : { before }),
    });
    sigs.push(...got);
    const last = got[got.length - 1];
    if (got.length < SIGNATURE_PAGE || last === undefined) return { sigs, truncated: false };
    before = last.signature;
  }
  return { sigs, truncated: true };
}
