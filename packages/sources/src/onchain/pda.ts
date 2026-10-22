import { createHash } from "node:crypto";
import { decodeBase58, encodeBase58 } from "./base58.js";

/**
 * Program derived addresses, computed locally: sha256(seeds, bump, program id, "ProgramDerivedAddress") must not be a
 * point on the ed25519 curve. No library is needed; the curve check is the standard decompression test.
 */
const P = 2n ** 255n - 19n;
const D = (-121665n * modInv(121666n)) % P;

function mod(a: bigint, m = P): bigint {
  const r = a % m;
  return r >= 0n ? r : r + m;
}

function modPow(base: bigint, exp: bigint, m = P): bigint {
  let result = 1n;
  let b = mod(base, m);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return result;
}

function modInv(a: bigint): bigint {
  return modPow(a, P - 2n);
}

/** True when the 32 bytes decode to a point on the ed25519 curve (so they could be a real public key). */
export function isOnCurve(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  const b = Uint8Array.from(bytes);
  b[31] = (b[31] ?? 0) & 0x7f; // drop the sign bit
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(b[i] ?? 0);
  if (y >= P) return false;
  const y2 = mod(y * y);
  const u = mod(y2 - 1n);
  const v = mod(D * y2 + 1n);
  if (v === 0n) return false;
  const x2 = mod(u * modInv(v));
  if (x2 === 0n) return true;
  // x2 has a square root exactly when x2^((p-1)/2) = 1 (Euler's criterion).
  return modPow(x2, (P - 1n) / 2n) === 1n;
}

const enc = new TextEncoder();
const seed = (s: string | Uint8Array): Uint8Array => (typeof s === "string" ? enc.encode(s) : s);

export function findProgramAddress(
  seeds: (string | Uint8Array)[],
  programId: string,
): { address: string; bump: number } {
  const program = decodeBase58(programId);
  for (let bump = 255; bump >= 0; bump--) {
    const hash = createHash("sha256");
    for (const s of seeds) hash.update(seed(s));
    hash.update(Uint8Array.from([bump]));
    hash.update(program);
    hash.update(enc.encode("ProgramDerivedAddress"));
    const out = Uint8Array.from(hash.digest());
    if (!isOnCurve(out)) return { address: encodeBase58(out), bump };
  }
  throw new Error("no valid bump seed");
}

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

/** The associated token account of a wallet or PDA for a mint. */
export function associatedTokenAddress(
  owner: string,
  mint: string,
  tokenProgram: string = TOKEN_PROGRAM,
): string {
  return findProgramAddress(
    [decodeBase58(owner), decodeBase58(tokenProgram), decodeBase58(mint)],
    ATA_PROGRAM,
  ).address;
}
