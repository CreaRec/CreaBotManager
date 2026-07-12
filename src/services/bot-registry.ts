import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { persistJsonFile } from "./persist-json";

const composeNameSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, "must be a valid Docker Compose name");

const managedBotSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "id must be lowercase alphanumeric with optional hyphens"),
  name: z.string().min(1),
  composeProject: composeNameSchema,
  composeService: composeNameSchema.default("bot"),
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
  byComposeTarget: Map<string, ManagedBot>;
}

export function composeTargetKey(project: string, service: string): string {
  return `${project}/${service}`;
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

function assertUniqueComposeTargets(bots: ManagedBot[]): void {
  const seen = new Set<string>();
  for (const bot of bots) {
    const key = composeTargetKey(bot.composeProject, bot.composeService);
    if (seen.has(key)) {
      throw new Error(`Duplicate managed bot compose target: "${key}"`);
    }
    seen.add(key);
  }
}

function buildRegistry(bots: ManagedBot[]): BotRegistry {
  assertUniqueIds(bots);
  assertUniqueComposeTargets(bots);
  const byId = new Map(bots.map((bot) => [bot.id, bot]));
  const byComposeTarget = new Map(
    bots.map((bot) => [composeTargetKey(bot.composeProject, bot.composeService), bot]),
  );
  return { bots, byId, byComposeTarget };
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
    composeProject: input.composeProject.trim(),
    composeService: (input.composeService ?? "bot").toString().trim() || "bot",
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
    const target = composeTargetKey(bot.composeProject, bot.composeService);
    if (this.registry.byComposeTarget.has(target)) {
      throw new RegistryError(`Compose target already registered: ${target}`);
    }

    const previous = this.registry;
    this.registry = buildRegistry([...this.registry.bots, bot]);
    try {
      this.save();
    } catch (err) {
      this.registry = previous;
      const message = err instanceof Error ? err.message : String(err);
      throw new RegistryError(message);
    }
    return bot;
  }

  removeBot(id: string): ManagedBot {
    const normalized = id.trim().toLowerCase();
    const bot = this.registry.byId.get(normalized);
    if (!bot) {
      throw new RegistryError(`Unknown bot id: ${id}`);
    }

    const previous = this.registry;
    this.registry = buildRegistry(this.registry.bots.filter((entry) => entry.id !== normalized));
    try {
      this.save();
    } catch (err) {
      this.registry = previous;
      const message = err instanceof Error ? err.message : String(err);
      throw new RegistryError(message);
    }
    return bot;
  }

  private save(): void {
    persistJsonFile(this.configPath, serializeRegistry(this.registry.bots), "bot registry");
  }
}
