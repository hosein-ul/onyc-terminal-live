const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const INDEX = new Map([...ALPHABET].map((c, i) => [c, i]));

/** Base58 as used by Solana for addresses and signatures. */
export function encodeBase58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  return "1".repeat(zeros) + out;
}

export function decodeBase58(text: string): Uint8Array {
  let zeros = 0;
  while (zeros < text.length && text[zeros] === "1") zeros += 1;
  let n = 0n;
  for (const ch of text) {
    const v = INDEX.get(ch);
    if (v === undefined) throw new Error(`not base58: ${ch}`);
    n = n * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  return Uint8Array.from([...new Array<number>(zeros).fill(0), ...bytes]);
}
