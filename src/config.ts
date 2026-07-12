import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ quiet: true });

const schema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  ADMIN_TELEGRAM_IDS: z.string().optional(),
  BOT_HANDLER_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  MANAGED_BOTS_CONFIG: z.string().min(1).default("data/managed-bots.json"),
  USER_PERMISSIONS_CONFIG: z.string().min(1).default("data/user-permissions.json"),
  DOCKER_PATH: z.string().min(1).default("/usr/bin/docker"),
  DOCKER_HOST: z.string().min(1).optional(),
});

export interface AppConfig {
  telegramBotToken: string;
  adminTelegramIds: number[];
  botHandlerTimeoutMs: number;
  managedBotsConfigPath: string;
  userPermissionsConfigPath: string;
  dockerPath: string;
  dockerHost?: string;
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
        throw new Error(`Telegram ids list contains a non-numeric id: "${s}"`);
      }
      return n;
    });
}

function envForSchema(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    const trimmed = value.trim();
    out[key] = trimmed === "" ? undefined : trimmed;
  }
  return out;
}

function build(): AppConfig {
  const parsed = schema.parse(envForSchema());
  return {
    telegramBotToken: parsed.TELEGRAM_BOT_TOKEN,
    adminTelegramIds: parseIds(parsed.ADMIN_TELEGRAM_IDS),
    botHandlerTimeoutMs: parsed.BOT_HANDLER_TIMEOUT_MS,
    managedBotsConfigPath: parsed.MANAGED_BOTS_CONFIG,
    userPermissionsConfigPath: parsed.USER_PERMISSIONS_CONFIG,
    dockerPath: parsed.DOCKER_PATH,
    dockerHost: parsed.DOCKER_HOST,
  };
}

export const config: AppConfig = build();
