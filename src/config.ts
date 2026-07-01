import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ quiet: true });

function envForSchema(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    const trimmed = value.trim();
    out[key] = trimmed === "" ? undefined : trimmed;
  }
  return out;
}

function parseIds(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const n = Number(s);
      if (!Number.isInteger(n)) {
        throw new Error(`ALLOWED_TELEGRAM_IDS contains a non-numeric id: "${s}"`);
      }
      return n;
    });
}

const schema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  ALLOWED_TELEGRAM_IDS: z.string().optional(),
  BOT_HANDLER_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
});

export interface AppConfig {
  telegramBotToken: string;
  allowedTelegramIds: number[];
  botHandlerTimeoutMs: number;
}

function build(): AppConfig {
  const parsed = schema.parse(envForSchema());
  return {
    telegramBotToken: parsed.TELEGRAM_BOT_TOKEN,
    allowedTelegramIds: parseIds(parsed.ALLOWED_TELEGRAM_IDS),
    botHandlerTimeoutMs: parsed.BOT_HANDLER_TIMEOUT_MS,
  };
}

export const config: AppConfig = build();
