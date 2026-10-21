export type SourceErrorKind = "network" | "timeout" | "http" | "parse" | "schema";

/** Every failure from an upstream is one of these, so the worker can record it in `source_health`. */
export class SourceError extends Error {
  readonly kind: SourceErrorKind;
  readonly source: string;
  readonly url: string;
  readonly status: number | undefined;

  constructor(
    kind: SourceErrorKind,
    source: string,
    url: string,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(`[${source}] ${kind}: ${message} (${url})`, { cause: options.cause });
    this.name = "SourceError";
    this.kind = kind;
    this.source = source;
    this.url = url;
    this.status = options.status;
  }
}
