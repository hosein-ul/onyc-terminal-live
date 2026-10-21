import { and, asc, eq, schema, sql, type Database } from "@onyc/db";
import { ALERT_RULES } from "@onyc/sdk";
import { helpText, parseCommand } from "./commands.js";
import { describeRule } from "./rules.js";
import { checkWebhookUrl } from "./webhook.js";

const MAX_RULES = 20;
const MAX_WEBHOOKS = 5;

interface Owned {
  id: number;
  channel: string;
  target: string;
  kind: string;
  params: unknown;
}

const record = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** The rules this chat controls: its own Telegram rules and the webhooks it registered, oldest first. */
async function owned(db: Database, chatId: string): Promise<Owned[]> {
  const rows = await db
    .select()
    .from(schema.alertRules)
    .where(
      sql`(${schema.alertRules.channel} = 'telegram' and ${schema.alertRules.target} = ${chatId})
        or (${schema.alertRules.channel} = 'webhook' and ${schema.alertRules.params}->>'owner' = ${chatId})`,
    )
    .orderBy(asc(schema.alertRules.id));
  return rows;
}

const label = (r: Owned): string =>
  `${r.channel === "webhook" ? `webhook ${r.target}: ` : ""}${describeRule(r)}`;

/** Run one Telegram message and return the reply text. Only chat-private data is read or written; nothing here sends. */
export async function handleMessage(db: Database, chatId: string, text: string): Promise<string> {
  const command = parseCommand(text);
  switch (command.kind) {
    case "start":
    case "help":
      return helpText();
    case "invalid":
      return command.message;
    case "list": {
      const rules = await owned(db, chatId);
      if (rules.length === 0)
        return "You have no alert rules. Try /subscribe downtick, or /help for the list.";
      return rules.map((r, i) => `${i + 1}. ${label(r)}`).join("\n");
    }
    case "unsubscribe": {
      const rules = await owned(db, chatId);
      const ids =
        command.target === "all"
          ? rules.map((r) => r.id)
          : rules[command.target - 1] === undefined
            ? []
            : [rules[command.target - 1]?.id ?? -1];
      if (ids.length === 0) return "No rule has that number. Send /list to see yours.";
      for (const id of ids) await db.delete(schema.alertRules).where(eq(schema.alertRules.id, id));
      return ids.length === 1 ? "Removed 1 rule." : `Removed ${ids.length} rules.`;
    }
    case "subscribe":
    case "webhook": {
      const channel = command.kind === "webhook" ? "webhook" : "telegram";
      const rules = await owned(db, chatId);
      if (rules.length >= MAX_RULES)
        return `You already have ${MAX_RULES} rules. Remove one with /unsubscribe first.`;
      let target = chatId;
      let params: Record<string, unknown> = { ...command.params };
      if (command.kind === "webhook") {
        const checked = checkWebhookUrl(command.url);
        if (!checked.ok) return checked.message;
        if (rules.filter((r) => r.channel === "webhook").length >= MAX_WEBHOOKS)
          return `You already have ${MAX_WEBHOOKS} webhooks.`;
        target = checked.url.href;
        params = { ...params, owner: chatId };
      }
      const same = rules.find(
        (r) =>
          r.channel === channel &&
          r.target === target &&
          r.kind === command.rule &&
          JSON.stringify(record(r.params)) === JSON.stringify(params),
      );
      if (same !== undefined) return "You already have that rule.";
      await db.insert(schema.alertRules).values({ channel, target, kind: command.rule, params });
      const def = ALERT_RULES.find((r) => r.key === command.rule);
      return `Subscribed: ${describeRule({ kind: command.rule, params })}.${channel === "webhook" ? " Alerts arrive as signed JSON when the bot has a WEBHOOK_SECRET." : ""}${def?.source === "bot" ? " This rule is checked by the bot about once a minute." : ""}`;
    }
  }
}

/** Remove a chat's rules, for example when Telegram reports that the chat blocked the bot. */
export async function dropChat(db: Database, chatId: string): Promise<void> {
  await db
    .delete(schema.alertRules)
    .where(and(eq(schema.alertRules.channel, "telegram"), eq(schema.alertRules.target, chatId)));
}
