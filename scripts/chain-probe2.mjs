import { readFileSync, writeFileSync } from "node:fs";
import { SolanaRpc, CONSTANTS, scanMintHoldings } from "../packages/sources/dist/index.js";
const rpc = new SolanaRpc({ heliusKey: process.env.HELIUS_API_KEY });
const top = JSON.parse(
  readFileSync(
    new URL("../packages/sources/fixtures/onchain/holders-top300.json", import.meta.url),
    "utf8",
  ),
);
const holdings = await scanMintHoldings(rpc, CONSTANTS.onycMint);
const acctOf = new Map();
for (const h of holdings)
  if (!acctOf.has(h.owner) || h.amount > acctOf.get(h.owner).amount) acctOf.set(h.owner, h);
const IGNORE = new Set([
  "11111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "ComputeBudget111111111111111111111111111111",
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
]);
const out = [];
for (const h of top.filter((x) => x.kind === "unknown").slice(0, 22)) {
  const acc = acctOf.get(h.owner);
  const sigs = await rpc.getSignatures(acc.tokenAccount, { limit: 3 });
  const progs = new Set();
  for (const s of sigs.slice(0, 2)) {
    const tx = await rpc.getTransaction(s.signature);
    for (const i of tx?.instructions ?? []) if (!IGNORE.has(i.programId)) progs.add(i.programId);
  }
  out.push({ owner: h.owner, onyc: Math.round(Number(h.amount) / 1e9), programs: [...progs] });
  console.log(Math.round(Number(h.amount) / 1e9), h.owner.slice(0, 8), [...progs].join(" "));
}
writeFileSync(
  new URL("../packages/sources/fixtures/onchain/holder-programs-probe.json", import.meta.url),
  JSON.stringify(out, null, 2),
);
