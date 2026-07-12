import { formatDockerHint, isDockerDenied, wrapCodeBlock } from "../utils/telegram-format";
import type { BotRegistryStore } from "./bot-registry";
import type { BotRegistry, ManagedBot } from "./bot-registry";
import { composeTargetKey } from "./bot-registry";
import {
  formatHumanServiceStatus,
  stateFromServiceProps,
} from "./service-status-format";
import {
  fetchContainerLogs,
  formatStatusEmoji,
  inspectContainer,
  listComposeContainers,
  parseIsActive,
  runContainerAction,
  stateFromDockerState,
  type CommandResult,
  type ContainerAction,
  type DockerConfig,
} from "./docker";

const ACTION_LABELS: Record<ContainerAction, string> = {
  start: "Запуск",
  stop: "Остановка",
  restart: "Перезапуск",
};

export type ServiceAction = ContainerAction;

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

function targetOf(bot: ManagedBot) {
  return { composeProject: bot.composeProject, composeService: bot.composeService };
}

function targetLabel(bot: ManagedBot): string {
  return composeTargetKey(bot.composeProject, bot.composeService);
}

export class BotManager {
  constructor(
    private readonly store: BotRegistryStore,
    private readonly docker: DockerConfig,
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

    const { containers, command } = await listComposeContainers(this.docker, targetOf(bot));
    if (containers[0]) {
      const state = stateFromDockerState(containers[0].state);
      return { bot, state, raw: containers[0].status || containers[0].state };
    }
    const raw = command.stderr || command.stdout || "not found";
    return { bot, state: parseIsActive(raw), raw };
  }

  async listStatuses(): Promise<BotStatus[]> {
    return Promise.all(this.registry().bots.map(async (bot) => (await this.getStatus(bot.id))!));
  }

  async runAction(id: string, action: ServiceAction): Promise<ActionResult | undefined> {
    const bot = this.resolveBotId(id);
    if (!bot) return undefined;

    const command = await runContainerAction(this.docker, targetOf(bot), action);
    const success = command.exitCode === 0;
    return { bot, action, command, success };
  }

  async getDetailedStatus(id: string): Promise<ServiceDetails | undefined> {
    const bot = this.resolveBotId(id);
    if (!bot) return undefined;

    const { props, command, limitedDetails } = await inspectContainer(this.docker, targetOf(bot));
    const denied = isDockerDenied(command.stderr || command.stdout);

    if (Object.keys(props).length === 0) {
      const status = await this.getStatus(id);
      return {
        bot,
        state: status?.state ?? "unknown",
        props: { ActiveState: status?.raw ?? "unknown" },
        command,
        limitedDetails: denied || limitedDetails,
      };
    }

    return {
      bot,
      state: stateFromServiceProps(props),
      props,
      command,
      limitedDetails: denied || limitedDetails,
    };
  }

  async getLogs(id: string, lines: number): Promise<{ bot: ManagedBot; command: CommandResult } | undefined> {
    const bot = this.resolveBotId(id);
    if (!bot) return undefined;

    const command = await fetchContainerLogs(this.docker, targetOf(bot), lines);
    return { bot, command };
  }
}

export function formatBotList(statuses: BotStatus[], options?: { isAdmin?: boolean }): string {
  const isAdmin = options?.isAdmin ?? false;

  if (statuses.length === 0) {
    return isAdmin
      ? "No bots registered.\n\nAdd one: /botadd <id> <composeProject> [name]"
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
    lines.push("", "Registry (admin only):", "/botadd <id> <composeProject> [name]", "/botremove <id>");
  }

  return lines.join("\n");
}

function formatCommandOutput(command: CommandResult, emptyLabel: string): string {
  const raw = command.stdout || command.stderr || emptyLabel;
  const dockerHint = formatDockerHint(raw);
  const parts = [wrapCodeBlock(raw)];
  if (dockerHint) parts.push("", dockerHint);
  return parts.join("\n");
}

export function formatActionResult(result: ActionResult): string {
  const emoji = result.success ? "✅" : "❌";
  const label = ACTION_LABELS[result.action];
  const header = `${emoji} ${label} \`${result.bot.id}\` (${targetLabel(result.bot)})`;
  const text = `${header}\n${formatCommandOutput(result.command, "(нет вывода)")}`;
  return text.length > 4000 ? `${text.slice(0, 3990)}…` : text;
}

export function formatDetailedStatus(details: ServiceDetails): string {
  return formatHumanServiceStatus(details);
}

export function formatLogs(bot: ManagedBot, command: CommandResult): string {
  const header = `Логи ${bot.name} (\`${bot.id}\`, ${targetLabel(bot)}):`;
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
  return (
    `✅ Bot registered:\n• id: \`${bot.id}\`\n• name: ${bot.name}\n` +
    `• compose: \`${bot.composeProject}/${bot.composeService}\``
  );
}

export function formatBotRemoved(bot: ManagedBot): string {
  return `✅ Bot removed: \`${bot.id}\` (${targetLabel(bot)})`;
}
