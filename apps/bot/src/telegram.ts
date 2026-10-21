import { z } from "zod";

const updateSchema = z.object({
  update_id: z.number(),
  message: z
    .object({
      text: z.string().optional(),
      chat: z.object({ id: z.number(), type: z.string() }),
    })
    .optional(),
});
const updatesResponse = z.object({ ok: z.boolean(), result: z.array(updateSchema).default([]) });
const okResponse = z.object({ ok: z.boolean(), description: z.string().optional() });

export interface Update {
  updateId: number;
  chatId: string;
  chatType: string;
  text: string;
}

/** A thin Telegram Bot API client over `fetch`, so tests can pass a fake and the bot needs no SDK. */
export class TelegramClient {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private url(method: string): string {
    return `https://api.telegram.org/bot${this.token}/${method}`;
  }

  /** Long-poll for new messages after `offset`. Updates without text are skipped but still advance the offset. */
  async getUpdates(
    offset: number,
    timeoutSeconds: number,
  ): Promise<{ updates: Update[]; nextOffset: number }> {
    const res = await this.fetchImpl(this.url("getUpdates"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offset, timeout: timeoutSeconds, allowed_updates: ["message"] }),
      signal: AbortSignal.timeout((timeoutSeconds + 10) * 1000),
    });
    if (!res.ok) throw new Error(`Telegram getUpdates answered ${res.status}`);
    const parsed = updatesResponse.parse(await res.json());
    let nextOffset = offset;
    const updates: Update[] = [];
    for (const u of parsed.result) {
      nextOffset = Math.max(nextOffset, u.update_id + 1);
      if (u.message?.text !== undefined) {
        updates.push({
          updateId: u.update_id,
          chatId: String(u.message.chat.id),
          chatType: u.message.chat.type,
          text: u.message.text,
        });
      }
    }
    return { updates, nextOffset };
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    const res = await this.fetchImpl(this.url("sendMessage"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = okResponse.parse(await res.json().catch(() => ({ ok: false })));
    // The token must never reach a log line, so the error names the method and the reason only.
    if (!res.ok || !body.ok)
      throw new Error(`Telegram sendMessage failed: ${body.description ?? res.status}`);
  }
}
