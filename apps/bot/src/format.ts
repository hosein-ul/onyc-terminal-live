import type { EventRow } from "./rules.js";

const MARK: Record<string, string> = { alert: "ALERT", watch: "WATCH", info: "INFO" };

/** Plain text, no markup: Telegram's parsers reject stray characters, and a URL or a title must never break a message. */
export function formatAlert(
  event: Pick<EventRow, "severity" | "title" | "body" | "ts">,
  webUrl?: string,
): string {
  const lines = [`[${MARK[event.severity] ?? event.severity.toUpperCase()}] ${event.title}`];
  if (event.body !== "") lines.push(event.body);
  lines.push(event.ts.toISOString().replace("T", " ").slice(0, 16) + " UTC");
  if (webUrl !== undefined) lines.push(webUrl);
  lines.push("Unofficial community tool, not affiliated with OnRe. Not investment advice.");
  return lines.join("\n");
}
