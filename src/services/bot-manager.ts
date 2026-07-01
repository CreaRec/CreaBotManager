import { formatSudoHint, isSudoDenied, wrapCodeBlock } from "../utils/telegram-format";
import type { BotRegistryStore } from "./bot-registry";
import type { BotRegistry, ManagedBot } from "./bot-registry";
import {
  formatHumanServiceStatus,
  parseSystemctlShow,
  stateFromServiceProps,
} from "./service-status-format";
import {
  fetchServiceLogs,
  formatStatusEmoji,
  parseIsActive,
  showServiceProperties,
  runSystemctl,
  type CommandResult,
  type SystemdConfig,
} from "./systemd";

const ACTION_LABELS: Record<ServiceAction, string> = {
  start: "Запуск",
  stop: "Остановка",
  restart: "Перезапуск",
};

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

export interface ServiceDetails {
  bot: ManagedBot;
  state: ReturnType<typeof parseIsActive>;
  props: Record<string, string>;
  command: CommandResult;
  limitedDetails?: boolean;
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
    return Promise.all(
      this.registry().bots.map(async (bot) => {
        const result = await runSystemctl(this.systemd, "is-active", bot.serviceName);
        return {
          bot,
          state: parseIsActive(result.stdout || result.stderr),
          raw: result.stdout || result.stderr,
        };
      }),
    );
  }

  async runAction(id: string, action: ServiceAction): Promise<ActionResult | undefined> {
    const bot = this.resolveBotId(id);
    if (!bot) return undefined;

    const command = await runSystemctl(this.systemd, action, bot.serviceName);
    const success = command.exitCode === 0;
    return { bot, action, command, success };
  }

  async getDetailedStatus(id: string): Promise<ServiceDetails | undefined> {
    const bot = this.resolveBotId(id);
    if (!bot) return undefined;

    const command = await showServiceProperties(this.systemd, bot.serviceName);
    const props = parseSystemctlShow(command.stdout || command.stderr);
    const showDenied = isSudoDenied(command.stderr || command.stdout);

    if (Object.keys(props).length === 0) {
      const fallback = await runSystemctl(this.systemd, "is-active", bot.serviceName);
      const fallbackOutput = fallback.stdout || fallback.stderr;
      return {
        bot,
        state: parseIsActive(fallbackOutput),
        props: { ActiveState: fallbackOutput },
        command: fallback,
        limitedDetails: showDenied,
      };
    }

    const state = stateFromServiceProps(props);
    return { bot, state, props, command };
  }

  async getLogs(id: string, lines: number): Promise<{ bot: ManagedBot; command: CommandResult } | undefined> {
    const bot = this.resolveBotId(id);
    if (!bot) return undefined;

    const command = await fetchServiceLogs(this.systemd, bot.serviceName, lines);
    return { bot, command };
  }
}

export function formatBotList(statuses: BotStatus[], options?: { isAdmin?: boolean }): string {
  const isAdmin = options?.isAdmin ?? false;

  if (statuses.length === 0) {
    return isAdmin
      ? "No bots registered.\n\nAdd one: /botadd <id> <service> [name]"
      : "No bots assigned to you yet. Ask an admin to run /usergrant.";
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
  );

  if (isAdmin) {
    lines.push("", "Registry (admin only):", "/botadd <id> <service> [name]", "/botremove <id>");
  }

  return lines.join("\n");
}

function formatCommandOutput(command: CommandResult, emptyLabel: string): string {
  const raw = command.stdout || command.stderr || emptyLabel;
  const sudoHint = formatSudoHint(raw);
  const parts = [wrapCodeBlock(raw)];
  if (sudoHint) parts.push("", sudoHint);
  return parts.join("\n");
}

export function formatActionResult(result: ActionResult): string {
  const emoji = result.success ? "✅" : "❌";
  const label = ACTION_LABELS[result.action];
  const header = `${emoji} ${label} \`${result.bot.id}\` (${result.bot.serviceName})`;
  const text = `${header}\n${formatCommandOutput(result.command, "(нет вывода)")}`;
  return text.length > 4000 ? `${text.slice(0, 3990)}…` : text;
}

export function formatDetailedStatus(details: ServiceDetails): string {
  return formatHumanServiceStatus(details);
}

export function formatLogs(bot: ManagedBot, command: CommandResult): string {
  const header = `Логи ${bot.name} (\`${bot.id}\`, ${bot.serviceName}):`;
  const text = `${header}\n\n${formatCommandOutput(command, "(логов нет)")}`;
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
