import { readFileSync, renameSync, writeFileSync } from "node:fs";
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

export type ManagedBotInput = z.input<typeof managedBotSchema>;

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

export function parseManagedBot(input: ManagedBotInput): ManagedBot {
  return managedBotSchema.parse({
    id: input.id.trim().toLowerCase(),
    name: input.name.trim(),
    serviceName: input.serviceName.trim(),
  });
}

export function serializeRegistry(bots: ManagedBot[]): string {
  return `${JSON.stringify({ bots }, null, 2)}\n`;
}

export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryError";
  }
}

export class BotRegistryStore {
  private registry: BotRegistry;
  readonly configPath: string;

  constructor(configPath: string, initial?: BotRegistry) {
    this.configPath = resolve(configPath);
    this.registry = initial ?? loadBotRegistry(configPath);
  }

  getRegistry(): BotRegistry {
    return this.registry;
  }

  addBot(input: ManagedBotInput): ManagedBot {
    const bot = parseManagedBot(input);

    if (this.registry.byId.has(bot.id)) {
      throw new RegistryError(`Bot id already exists: ${bot.id}`);
    }
    if (this.registry.byServiceName.has(bot.serviceName)) {
      throw new RegistryError(`Service already registered: ${bot.serviceName}`);
    }

    this.registry = buildRegistry([...this.registry.bots, bot]);
    this.save();
    return bot;
  }

  removeBot(id: string): ManagedBot {
    const normalized = id.trim().toLowerCase();
    const bot = this.registry.byId.get(normalized);
    if (!bot) {
      throw new RegistryError(`Unknown bot id: ${id}`);
    }

    this.registry = buildRegistry(this.registry.bots.filter((entry) => entry.id !== normalized));
    this.save();
    return bot;
  }

  private save(): void {
    const tmpPath = `${this.configPath}.tmp.${process.pid}`;
    writeFileSync(tmpPath, serializeRegistry(this.registry.bots), "utf8");
    renameSync(tmpPath, this.configPath);
  }
}
