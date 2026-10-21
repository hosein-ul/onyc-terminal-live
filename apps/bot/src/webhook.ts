import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** True for addresses a public webhook must never reach: loopback, private, link-local, shared, multicast, unspecified. */
export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  const ip = mapped?.[1] ?? address;
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      /^fe[89ab]/.test(lower) ||
      lower.startsWith("ff")
    );
  }
  return true; // not an address at all: refuse
}

/** Cheap, offline checks when a webhook is registered. Delivery repeats the address check after DNS resolution. */
export function checkWebhookUrl(
  raw: string,
): { ok: true; url: URL } | { ok: false; message: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, message: "That is not a URL." };
  }
  if (url.protocol !== "https:") return { ok: false, message: "Webhooks must use https." };
  if (url.username !== "" || url.password !== "")
    return { ok: false, message: "Remove the user name and password from the URL." };
  if (url.port !== "" && url.port !== "443")
    return { ok: false, message: "Webhooks must use the standard https port." };
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return { ok: false, message: "That host is not reachable from the internet." };
  }
  const literal = host.replace(/^\[|\]$/g, "");
  if (isIP(literal) !== 0 && isPrivateAddress(literal))
    return { ok: false, message: "That address is private." };
  return { ok: true, url };
}

export interface WebhookDeps {
  fetchImpl?: typeof fetch;
  resolve?: (host: string) => Promise<string[]>;
  secret?: string | undefined;
}

const defaultResolve = async (host: string): Promise<string[]> =>
  (await lookup(host, { all: true })).map((a) => a.address);

/** POST a JSON body to a registered webhook, after checking that its host resolves only to public addresses. */
export async function postWebhook(
  rawUrl: string,
  payload: unknown,
  deps: WebhookDeps = {},
): Promise<void> {
  const checked = checkWebhookUrl(rawUrl);
  if (!checked.ok) throw new Error(checked.message);
  const host = checked.url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) !== 0 ? [host] : await (deps.resolve ?? defaultResolve)(host);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error("The webhook host resolves to a private address.");
  }
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "onyc-terminal-bot",
  };
  if (deps.secret !== undefined) {
    headers["x-onyc-signature"] =
      `sha256=${createHmac("sha256", deps.secret).update(body).digest("hex")}`;
  }
  const res = await (deps.fetchImpl ?? fetch)(checked.url, {
    method: "POST",
    headers,
    body,
    redirect: "manual", // a redirect could point anywhere; the sender must publish the final URL
    signal: AbortSignal.timeout(5000),
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`The webhook answered ${res.status}.`);
}
