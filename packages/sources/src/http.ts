import type { ZodType } from "zod";
import { SourceError } from "./errors.js";

export const USER_AGENT = "onyc-terminal/0.1 (unofficial community analytics; read-only)";

export interface FetchOptions {
  /** Per-attempt timeout. Default 30 s. */
  timeoutMs?: number;
  /** Extra attempts after the first for network errors, timeouts, 429 and 5xx. Default 2. */
  retries?: number;
  /** Base for exponential backoff with jitter. Default 500 ms. */
  backoffMs?: number;
  headers?: Record<string, string>;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  /** Injected in tests so retries do not sleep. */
  sleep?: (ms: number) => Promise<void>;
  method?: "GET" | "POST";
  body?: string;
  /** What to show in errors and logs instead of the real URL, for URLs that carry an API key. */
  displayUrl?: string;
}

export interface HttpResult {
  url: string;
  status: number;
  text: string;
  fetchedAt: Date;
  latencyMs: number;
}

/** A parsed and validated response plus what the worker needs to store it. */
export interface SourceResult<T> {
  data: T;
  /** The exact response body, kept for `raw_snapshots`. */
  raw: string;
  url: string;
  status: number;
  fetchedAt: Date;
  latencyMs: number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** undici reports only "fetch failed"; the useful part (ECONNRESET, ETIMEDOUT, ...) is on `cause`. */
function describeNetworkError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause: unknown = error.cause;
  if (cause instanceof Error) {
    const code = (cause as Error & { code?: unknown }).code;
    return `${error.message}: ${typeof code === "string" ? `${code} ` : ""}${cause.message}`;
  }
  return error.message;
}

function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (header === null) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? Math.min(seconds * 1000, 60_000) : undefined;
}

/**
 * GET with timeout, retry and a User-Agent. Statuses listed in `acceptStatuses` are returned as results
 * (for example 404 on a referral code, which means "no code", not an error).
 */
export async function httpGet(
  source: string,
  url: string,
  options: FetchOptions & { acceptStatuses?: readonly number[] } = {},
): Promise<HttpResult> {
  const {
    timeoutMs = 30_000,
    retries = 2,
    backoffMs = 500,
    headers = {},
    fetchImpl = fetch,
    sleep = defaultSleep,
    acceptStatuses = [],
    method = "GET",
    body,
    displayUrl = url,
  } = options;

  let lastError: SourceError | undefined;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const started = Date.now();
    let failure: SourceError;
    let retryable = true;
    let waitHint: number | undefined;
    try {
      const response = await fetchImpl(url, {
        method,
        ...(body === undefined ? {} : { body }),
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/json, text/csv, */*",
          ...headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      });
      const text = await response.text();
      if (response.ok || acceptStatuses.includes(response.status)) {
        return {
          url,
          status: response.status,
          text,
          fetchedAt: new Date(),
          latencyMs: Date.now() - started,
        };
      }
      failure = new SourceError("http", source, displayUrl, `HTTP ${response.status}`, {
        status: response.status,
      });
      retryable = response.status === 429 || response.status >= 500;
      waitHint = retryAfterMs(response);
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      failure = new SourceError(
        timedOut ? "timeout" : "network",
        source,
        displayUrl,
        timedOut
          ? `no response within ${timeoutMs} ms`
          : describeNetworkError(error).replaceAll(url, displayUrl),
        { cause: error },
      );
    }
    if (!retryable) throw failure;
    lastError = failure;
    if (attempt < retries) {
      await sleep(waitHint ?? backoffMs * 2 ** attempt + Math.random() * backoffMs);
    }
  }
  throw lastError ?? new SourceError("network", source, displayUrl, "request failed");
}

/** Validate unknown data against a zod schema, turning failures into `SourceError("schema")`. */
export function validate<T>(source: string, url: string, schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  throw new SourceError("schema", source, url, `response shape changed: ${issues}`, {
    cause: parsed.error,
  });
}

/** GET JSON and validate it. */
export async function getJson<T>(
  source: string,
  url: string,
  schema: ZodType<T>,
  options: FetchOptions & { acceptStatuses?: readonly number[] } = {},
): Promise<SourceResult<T>> {
  const response = await httpGet(source, url, options);
  let json: unknown;
  try {
    json = JSON.parse(response.text);
  } catch (error) {
    throw new SourceError("parse", source, url, "body is not valid JSON", { cause: error });
  }
  return {
    data: validate(source, url, schema, json),
    raw: response.text,
    url,
    status: response.status,
    fetchedAt: response.fetchedAt,
    latencyMs: response.latencyMs,
  };
}

/** GET text and run a parser that throws `SourceError` or `Error` on bad input. */
export async function getText<T>(
  source: string,
  url: string,
  parse: (text: string) => T,
  options: FetchOptions = {},
): Promise<SourceResult<T>> {
  const response = await httpGet(source, url, options);
  let data: T;
  try {
    data = parse(response.text);
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError(
      "parse",
      source,
      url,
      error instanceof Error ? error.message : String(error),
      {
        cause: error,
      },
    );
  }
  return {
    data,
    raw: response.text,
    url,
    status: response.status,
    fetchedAt: response.fetchedAt,
    latencyMs: response.latencyMs,
  };
}
