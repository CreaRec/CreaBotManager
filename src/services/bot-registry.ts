import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const managedBotSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "id must be lowercase alphanumeric with optional hyphens"),
  name: z.string().min(1),
  serviceName: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9@._+-]+$/, "serviceName must be a valid systemd unit name"),
});

const registryFileSchema = z.object({
  bots: z.array(managedBotSchema),
});

const registryArraySchema = z.array(managedBotSchema);

export type ManagedBot = z.infer<typeof managedBotSchema>;

export interface BotRegistry {
  bots: ManagedBot[];
  byId: Map<string, ManagedBot>;
  byServiceName: Map<string, ManagedBot>;
}

function assertUniqueIds(bots: ManagedBot[]): void {
  const seen = new Set<string>();
  for (const bot of bots) {
    if (seen.has(bot.id)) {
      throw new Error(`Duplicate managed bot id: "${bot.id}"`);
    }
    seen.add(bot.id);
  }
}

function assertUniqueServiceNames(bots: ManagedBot[]): void {
  const seen = new Set<string>();
  for (const bot of bots) {
    if (seen.has(bot.serviceName)) {
      throw new Error(`Duplicate managed bot serviceName: "${bot.serviceName}"`);
    }
    seen.add(bot.serviceName);
  }
}

function buildRegistry(bots: ManagedBot[]): BotRegistry {
  assertUniqueIds(bots);
  assertUniqueServiceNames(bots);
  const byId = new Map(bots.map((bot) => [bot.id, bot]));
  const byServiceName = new Map(bots.map((bot) => [bot.serviceName, bot]));
  return { bots, byId, byServiceName };
}

function parseRegistryJson(raw: string, source: string): BotRegistry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in managed bots config (${source})`);
  }

  if (Array.isArray(parsed)) {
    return buildRegistry(registryArraySchema.parse(parsed));
  }

  return buildRegistry(registryFileSchema.parse(parsed).bots);
}

export function loadBotRegistry(configPath: string): BotRegistry {
  const absolutePath = resolve(configPath);
  let raw: string;
  try {
    raw = readFileSync(absolutePath, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read managed bots config at ${absolutePath}: ${message}`);
  }
  return parseRegistryJson(raw, absolutePath);
}

export function parseBotRegistryJson(raw: string): BotRegistry {
  return parseRegistryJson(raw, "inline JSON");
}
