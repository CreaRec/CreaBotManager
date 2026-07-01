import type { BotRegistryStore } from "./bot-registry";
import type { BotRegistry, ManagedBot } from "./bot-registry";
import {
  fetchServiceLogs,
  formatStatusEmoji,
  parseIsActive,
  runSystemctl,
  type CommandResult,
  type SystemdConfig,
} from "./systemd";

export type ServiceAction = "start" | "stop" | "restart";

export interface BotStatus {
  bot: ManagedBot;
  state: ReturnType<typeof parseIsActive>;
  raw: string;
}

export interface ActionResult {
  bot: ManagedBot;
  action: ServiceAction;
  command: CommandResult;
  success: boolean;
}

export class BotManager {
  constructor(
    private readonly store: BotRegistryStore,
    private readonly systemd: SystemdConfig,
  ) {}

  private registry(): BotRegistry {
    return this.store.getRegistry();
  }

  listBots(): ManagedBot[] {
    return this.registry().bots;
  }

  getBot(id: string): ManagedBot | undefined {
    return this.registry().byId.get(id);
  }

  resolveBotId(input: string): ManagedBot | undefined {
    const normalized = input.trim().toLowerCase();
    return this.registry().byId.get(normalized);
  }

  async getStatus(id: string): Promise<BotStatus | undefined> {
    const bot = this.resolveBotId(id);
    if (!bot) return undefined;

    const result = await runSystemctl(this.systemd, "is-active", bot.serviceName);
    const state = parseIsActive(result.stdout || result.stderr);
    return { bot, state, raw: result.stdout || result.stderr };
  }

  async listStatuses(): Promise<BotStatus[]> {
    const statuses: BotStatus[] = [];
    for (const bot of this.registry().bots) {
      const result = await runSystemctl(this.systemd, "is-active", bot.serviceName);
      statuses.push({
        bot,
        state: parseIsActive(result.stdout || result.stderr),
        raw: result.stdout || result.stderr,
      });
    }
    return statuses;
  }

  async runAction(id: string, action: ServiceAction): Promise<ActionResult | undefined> {
    const bot = this.resolveBotId(id);
    if (!bot) return undefined;

    const command = await runSystemctl(this.systemd, action, bot.serviceName);
    const success = command.exitCode === 0;
    return { bot, action, command, success };
  }

  async getDetailedStatus(id: string): Promise<{ bot: ManagedBot; command: CommandResult } | undefined> {
    const bot = this.resolveBotId(id);
    if (!bot) return undefined;

    const command = await runSystemctl(this.systemd, "status", bot.serviceName);
    return { bot, command };
  }

  async getLogs(id: string, lines: number): Promise<{ bot: ManagedBot; command: CommandResult } | undefined> {
    const bot = this.resolveBotId(id);
    if (!bot) return undefined;

    const command = await fetchServiceLogs(this.systemd, bot.serviceName, lines);
    return { bot, command };
  }
}

export function formatBotList(statuses: BotStatus[]): string {
  if (statuses.length === 0) {
    return "No bots registered.\n\nAdd one: /botadd <id> <service> [name]";
  }

  const lines = ["Registered bots:", ""];
  for (const { bot, state } of statuses) {
    lines.push(`${formatStatusEmoji(state)} ${bot.name} (\`${bot.id}\`) — ${state}`);
  }
  lines.push(
    "",
    "Service control:",
    "/botstart <id> — start",
    "/botstop <id> — stop",
    "/botrestart <id> — restart",
    "/botstatus <id> — status",
    "/botlogs <id> [lines] — logs",
    "",
    "Registry:",
    "/botadd <id> <service> [name] — register bot",
    "/botremove <id> — unregister bot",
  );
  return lines.join("\n");
}

export function formatActionResult(result: ActionResult): string {
  const emoji = result.success ? "✅" : "❌";
  const detail = result.command.stdout || result.command.stderr || "(no output)";
  return `${emoji} ${result.action} \`${result.bot.id}\` (${result.bot.serviceName})\n${detail}`;
}

export function formatDetailedStatus(bot: ManagedBot, command: CommandResult): string {
  const body = command.stdout || command.stderr || "(no output)";
  const header = `Status for ${bot.name} (\`${bot.id}\`, ${bot.serviceName}):`;
  const text = `${header}\n\n${body}`;
  return text.length > 4000 ? `${text.slice(0, 3990)}…` : text;
}

export function formatLogs(bot: ManagedBot, command: CommandResult): string {
  const body = command.stdout || command.stderr || "(no logs)";
  const header = `Logs for ${bot.name} (\`${bot.id}\`, ${bot.serviceName}):`;
  const text = `${header}\n\n${body}`;
  return text.length > 4000 ? `${text.slice(0, 3990)}…` : text;
}

export function unknownBotMessage(id: string, registry: BotRegistry): string {
  if (registry.bots.length === 0) {
    return `Unknown bot id: \`${id}\`.\nNo bots registered yet. Use /botadd.`;
  }
  const known = registry.bots.map((b) => b.id).join(", ");
  return `Unknown bot id: \`${id}\`.\nRegistered ids: ${known}`;
}

export function formatBotAdded(bot: ManagedBot): string {
  return `✅ Bot registered:\n• id: \`${bot.id}\`\n• name: ${bot.name}\n• service: ${bot.serviceName}`;
}

export function formatBotRemoved(bot: ManagedBot): string {
  return `✅ Bot removed: \`${bot.id}\` (${bot.serviceName})`;
}
