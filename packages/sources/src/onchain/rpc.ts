import { z } from "zod";
import { SourceError } from "../errors.js";
import { decodeBase58 } from "./base58.js";

/** Public endpoint used when no Helius key is set. It is rate limited, so every call waits its turn. */
export const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";
export const HELIUS_URL = "https://mainnet.helius-rpc.com/";

export interface RpcOptions {
  /** A Helius key makes the client use Helius; without one it falls back to the public endpoint. */
  heliusKey?: string | undefined;
  /** Overrides both, for a private endpoint. */
  url?: string | undefined;
  /** Minimum time between two calls. Defaults to 120 ms with a key and 600 ms on the public endpoint. */
  minIntervalMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  userAgent?: string;
}

const rpcEnvelope = z.looseObject({
  result: z.unknown().optional(),
  error: z.looseObject({ code: z.number().optional(), message: z.string() }).optional(),
});

export interface RpcAccount {
  pubkey: string;
  lamports: number;
  owner: string;
  executable: boolean;
  /** Raw account data; empty when a zero-length slice was asked for. */
  data: Uint8Array;
}

export interface SignatureInfo {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
}

export interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number };
}

export interface ParsedInstruction {
  programId: string;
  /** The first 8 bytes of the instruction data, which is the Anchor discriminator for Anchor programs. */
  discriminator: Uint8Array | null;
  accounts: string[];
}

export interface ParsedTransaction {
  slot: number;
  blockTime: number | null;
  signature: string;
  err: unknown;
  signer: string | null;
  accountKeys: string[];
  instructions: ParsedInstruction[];
  preTokenBalances: TokenBalance[];
  postTokenBalances: TokenBalance[];
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface RawAccount {
  lamports: number;
  owner: string;
  executable: boolean;
  data: [string, string];
}

interface RawInstruction {
  programIdIndex: number;
  accounts: number[];
  data: string;
}

interface RawTransaction {
  slot: number;
  blockTime?: number | null;
  transaction: {
    message: { accountKeys: string[]; instructions: RawInstruction[] };
  };
  meta: {
    err: unknown;
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
    loadedAddresses?: { writable: string[]; readonly: string[] };
    innerInstructions?: { instructions: RawInstruction[] }[];
  } | null;
}

function toAccount(pubkey: string, a: RawAccount): RpcAccount {
  return {
    pubkey,
    lamports: a.lamports,
    owner: a.owner,
    executable: a.executable,
    data: Uint8Array.from(Buffer.from(a.data[0], "base64")),
  };
}

export function parseTransaction(signature: string, t: RawTransaction): ParsedTransaction {
  const keys = [
    ...t.transaction.message.accountKeys,
    ...(t.meta?.loadedAddresses?.writable ?? []),
    ...(t.meta?.loadedAddresses?.readonly ?? []),
  ];
  const decode = (i: RawInstruction): ParsedInstruction => {
    let data: Uint8Array | null;
    try {
      data = decodeBase58(i.data);
    } catch {
      data = null;
    }
    return {
      programId: keys[i.programIdIndex] ?? "",
      discriminator: data !== null && data.length >= 8 ? data.slice(0, 8) : null,
      accounts: i.accounts.map((a) => keys[a] ?? ""),
    };
  };
  const top = t.transaction.message.instructions.map(decode);
  const inner = (t.meta?.innerInstructions ?? []).flatMap((x) => x.instructions.map(decode));
  return {
    slot: t.slot,
    blockTime: t.blockTime ?? null,
    signature,
    err: t.meta?.err ?? null,
    signer: keys[0] ?? null,
    accountKeys: keys,
    instructions: [...top, ...inner],
    preTokenBalances: t.meta?.preTokenBalances ?? [],
    postTokenBalances: t.meta?.postTokenBalances ?? [],
  };
}

/**
 * A small read-only Solana JSON-RPC client: one call at a time, a minimum gap between calls, and retries with backoff on
 * 429 and 5xx. It never signs or sends anything. getProgramAccounts is only called from the worker, with filters.
 */
export class SolanaRpc {
  readonly url: string;
  readonly provider: "helius" | "custom" | "public";
  private readonly minInterval: number;
  private readonly retries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly userAgent: string;
  private last = 0;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(options: RpcOptions = {}) {
    const key = options.heliusKey?.trim();
    this.provider = options.url ? "custom" : key ? "helius" : "public";
    this.url =
      options.url ?? (key ? `${HELIUS_URL}?api-key=${encodeURIComponent(key)}` : PUBLIC_RPC);
    this.minInterval = options.minIntervalMs ?? (this.provider === "public" ? 600 : 120);
    this.retries = options.retries ?? 5;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.userAgent = options.userAgent ?? "onyc-terminal/0.1 (independent, read-only)";
  }

  /** The URL with any key removed, for logs and errors. */
  get displayUrl(): string {
    return this.provider === "helius" ? `${HELIUS_URL}?api-key=REDACTED` : this.url;
  }

  private turn<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const wait = this.last + this.minInterval - Date.now();
      if (wait > 0) await this.sleep(wait);
      try {
        return await job();
      } finally {
        this.last = Date.now();
      }
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  async call(method: string, params: unknown[]): Promise<unknown> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.turn(async () => {
          const response = await this.fetchImpl(this.url, {
            method: "POST",
            headers: { "content-type": "application/json", "user-agent": this.userAgent },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
            signal: AbortSignal.timeout(90_000),
          });
          const text = await response.text();
          if (response.status === 429 || response.status >= 500) {
            throw Object.assign(new Error(`HTTP ${response.status}`), { retryable: true });
          }
          const parsed = rpcEnvelope.safeParse(JSON.parse(text));
          if (!parsed.success) {
            throw new SourceError(
              "schema",
              "solana-rpc",
              this.displayUrl,
              `${method}: not a JSON-RPC response`,
            );
          }
          if (parsed.data.error !== undefined) {
            const code = parsed.data.error.code;
            if (code === 429 || code === -32005 || code === -32009) {
              throw Object.assign(new Error(parsed.data.error.message), { retryable: true });
            }
            throw new SourceError(
              "http",
              "solana-rpc",
              this.displayUrl,
              `${method}: ${parsed.data.error.message}`,
            );
          }
          return parsed.data.result;
        });
      } catch (error) {
        const retryable =
          error instanceof Error &&
          ((error as { retryable?: boolean }).retryable === true ||
            /fetch failed|timeout|aborted/i.test(error.message));
        if (!retryable || attempt >= this.retries) {
          if (error instanceof SourceError) throw error;
          throw new SourceError(
            "network",
            "solana-rpc",
            this.displayUrl,
            `${method}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
        attempt += 1;
        await this.sleep(Math.min(20_000, 800 * 2 ** attempt) + Math.floor(Math.random() * 300));
      }
    }
  }

  async getAccount(address: string): Promise<RpcAccount | null> {
    const r = (await this.call("getAccountInfo", [address, { encoding: "base64" }])) as {
      value: RawAccount | null;
    };
    return r.value === null ? null : toAccount(address, r.value);
  }

  async getMultipleAccounts(addresses: string[]): Promise<(RpcAccount | null)[]> {
    const out: (RpcAccount | null)[] = [];
    for (let i = 0; i < addresses.length; i += 100) {
      const chunk = addresses.slice(i, i + 100);
      const r = (await this.call("getMultipleAccounts", [chunk, { encoding: "base64" }])) as {
        value: (RawAccount | null)[];
      };
      r.value.forEach((v, j) => out.push(v === null ? null : toAccount(chunk[j] ?? "", v)));
    }
    return out;
  }

  /**
   * Accounts owned by a program that match the filters. `dataSlice` limits the bytes returned, which keeps a scan of
   * every token account of a mint small. Worker only.
   */
  async getProgramAccounts(
    program: string,
    filters: ({ dataSize: number } | { memcmp: { offset: number; bytes: string } })[],
    dataSlice?: { offset: number; length: number },
  ): Promise<RpcAccount[]> {
    const r = (await this.call("getProgramAccounts", [
      program,
      { encoding: "base64", filters, ...(dataSlice ? { dataSlice } : {}) },
    ])) as { pubkey: string; account: RawAccount }[];
    return r.map((x) => toAccount(x.pubkey, x.account));
  }

  /** Total balance of one mint across a wallet's token accounts, raw units. */
  async getTokenBalanceByOwner(owner: string, mint: string): Promise<bigint> {
    const r = (await this.call("getTokenAccountsByOwner", [
      owner,
      { mint },
      { encoding: "jsonParsed" },
    ])) as {
      value: { account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }[];
    };
    return r.value.reduce(
      (sum, a) => sum + BigInt(a.account.data.parsed.info.tokenAmount.amount),
      0n,
    );
  }

  async getTokenSupply(mint: string): Promise<{ amount: bigint; decimals: number }> {
    const r = (await this.call("getTokenSupply", [mint])) as {
      value: { amount: string; decimals: number };
    };
    return { amount: BigInt(r.value.amount), decimals: r.value.decimals };
  }

  async getSignatures(
    address: string,
    options: { limit?: number; until?: string; before?: string } = {},
  ): Promise<SignatureInfo[]> {
    const r = (await this.call("getSignaturesForAddress", [
      address,
      {
        limit: options.limit ?? 100,
        commitment: "finalized",
        ...(options.until ? { until: options.until } : {}),
        ...(options.before ? { before: options.before } : {}),
      },
    ])) as { signature: string; slot: number; blockTime?: number | null; err: unknown }[];
    return r.map((x) => ({
      signature: x.signature,
      slot: x.slot,
      blockTime: x.blockTime ?? null,
      err: x.err,
    }));
  }

  async getTransaction(signature: string): Promise<ParsedTransaction | null> {
    const r = (await this.call("getTransaction", [
      signature,
      { encoding: "json", maxSupportedTransactionVersion: 0, commitment: "finalized" },
    ])) as RawTransaction | null;
    return r === null ? null : parseTransaction(signature, r);
  }
}
