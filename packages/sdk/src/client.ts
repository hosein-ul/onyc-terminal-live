import {
  endpoints,
  type EndpointName,
  type EndpointParams,
  type EndpointQuery,
  type EndpointResponse,
} from "./contract.js";
import { streamTickSchema } from "./schemas.js";
import type { z } from "zod";

export class ApiError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
  }
}

export interface ClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  /** Validate every response against its schema. Default true: a changed contract fails loudly. */
  validate?: boolean;
}

type CallArgs<K extends EndpointName> = (Record<string, never> extends EndpointParams<K>
  ? { params?: undefined }
  : { params: EndpointParams<K> }) & { query?: EndpointQuery<K>; signal?: AbortSignal };

function fill(path: string, params: Record<string, string>): string {
  return path.replace(/\{(\w+)\}/g, (_m, key: string) => encodeURIComponent(params[key] ?? ""));
}

export interface Client {
  call: <K extends EndpointName>(name: K, args?: CallArgs<K>) => Promise<EndpointResponse<K>>;
  /** Subscribe to /v1/stream. Returns a function that closes the connection. */
  stream: (handlers: {
    onTick?: (tick: z.infer<typeof streamTickSchema>) => void;
    onEvent?: (event: unknown) => void;
    onError?: (error: unknown) => void;
  }) => () => void;
}

export function createClient(options: ClientOptions): Client {
  const base = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;
  const validate = options.validate ?? true;

  return {
    async call(name, args) {
      const def = endpoints[name];
      const params = (args?.params ?? {}) as Record<string, string>;
      const url = new URL(base + fill(def.path, params));
      for (const [key, value] of Object.entries(
        (args?.query ?? {}) as Record<string, string | number | boolean | undefined | null>,
      )) {
        if (value !== undefined && value !== null && value !== "")
          url.searchParams.set(key, String(value));
      }
      const response = await doFetch(url, {
        headers: { accept: "application/json" },
        ...(args?.signal === undefined ? {} : { signal: args.signal }),
      });
      const text = await response.text();
      if (!response.ok) throw new ApiError(response.status, def.path, text.slice(0, 300));
      const json: unknown = JSON.parse(text);
      if (!validate) return json as EndpointResponse<typeof name>;
      const parsed = def.response.safeParse(json);
      if (!parsed.success) {
        throw new ApiError(
          502,
          def.path,
          `response does not match the contract: ${parsed.error.issues[0]?.message ?? ""}`,
        );
      }
      return parsed.data as EndpointResponse<typeof name>;
    },

    stream(handlers) {
      const source = new EventSource(`${base}/v1/stream`);
      source.addEventListener("tick", (message) => {
        const parsed = streamTickSchema.safeParse(
          JSON.parse((message as MessageEvent<string>).data),
        );
        if (parsed.success) handlers.onTick?.(parsed.data);
      });
      source.addEventListener("event", (message) => {
        handlers.onEvent?.(JSON.parse((message as MessageEvent<string>).data));
      });
      source.onerror = (error) => handlers.onError?.(error);
      return () => source.close();
    },
  };
}
