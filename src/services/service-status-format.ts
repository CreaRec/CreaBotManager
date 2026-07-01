import type { CommandResult } from "./systemd";
import { formatStatusEmoji, parseIsActive, type ServiceState } from "./systemd";

const ACTIVE_STATE_LABELS: Record<string, string> = {
  active: "работает",
  inactive: "остановлен",
  failed: "ошибка",
  activating: "запускается",
  deactivating: "останавливается",
  reloading: "перезагружается",
};

const SUB_STATE_LABELS: Record<string, string> = {
  running: "процесс запущен",
  dead: "не запущен",
  exited: "завершён",
  start: "запуск",
  stop: "остановка",
  failed: "сбой",
};

const UNIT_FILE_LABELS: Record<string, string> = {
  enabled: "включён",
  disabled: "выключен",
  "static": "системный",
  masked: "заблокирован",
};

export function parseSystemctlShow(stdout: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const line of stdout.split("\n")) {
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) props[key] = value;
  }
  return props;
}

export function formatBytes(value: number): string | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatServiceStateLabel(activeState: string, subState?: string): string {
  const active = activeState.trim().toLowerCase();
  const activeLabel = ACTIVE_STATE_LABELS[active] ?? activeState;
  if (!subState || subState === "n/a") return activeLabel;

  const sub = subState.trim().toLowerCase();
  const subLabel = SUB_STATE_LABELS[sub] ?? subState;
  if (active === "active" && sub === "running") return "работает";
  if (active === "inactive" && sub === "dead") return "остановлен";
  return `${activeLabel} (${subLabel})`;
}

export function formatUnitFileState(value: string | undefined): string | undefined {
  if (!value || value === "n/a") return undefined;
  return UNIT_FILE_LABELS[value] ?? value;
}

export function formatTimestamp(value: string | undefined): string | undefined {
  if (!value || value === "n/a") return undefined;
  return value;
}

export function stateFromServiceProps(props: Record<string, string>): ServiceState {
  const activeState = props.ActiveState?.trim().toLowerCase();
  if (activeState === "activating") return "unknown";
  if (activeState === "deactivating") return "inactive";
  if (activeState) return parseIsActive(activeState);
  return "unknown";
}

export interface HumanStatusInput {
  bot: { id: string; name: string; serviceName: string };
  state: ServiceState;
  props: Record<string, string>;
  command?: CommandResult;
}

export function formatHumanServiceStatus(input: HumanStatusInput): string {
  const { bot, state, props, command } = input;
  const emoji = formatStatusEmoji(state);
  const stateLabel = formatServiceStateLabel(props.ActiveState ?? state, props.SubState);
  const lines = [
    `📊 *${bot.name}*`,
    "",
    `• id: \`${bot.id}\``,
    `• сервис: ${bot.serviceName}`,
    `• состояние: ${emoji} ${stateLabel}`,
  ];

  const autostart = formatUnitFileState(props.UnitFileState);
  if (autostart) lines.push(`• автозапуск: ${autostart}`);

  const pid = props.MainPID;
  if (pid && pid !== "0") lines.push(`• PID: ${pid}`);

  const startedAt =
    state === "active" ? formatTimestamp(props.ActiveEnterTimestamp) : formatTimestamp(props.InactiveEnterTimestamp);
  if (startedAt) {
    lines.push(state === "active" ? `• запущен: ${startedAt}` : `• остановлен: ${startedAt}`);
  }

  const memory = props.MemoryCurrent ? formatBytes(Number(props.MemoryCurrent)) : undefined;
  if (memory) lines.push(`• память: ${memory}`);

  if (state === "failed" && props.Result && props.Result !== "success") {
    lines.push(`• результат: ${props.Result}`);
  }

  const raw = command?.stderr || command?.stdout || "";
  if (raw.toLowerCase().includes("password is required") || raw.toLowerCase().includes("not allowed")) {
    lines.push("", "⚠️ Нет доступа к systemctl. Проверьте sudoers на сервере.");
  }

  const text = lines.join("\n");
  return text.length > 4000 ? `${text.slice(0, 3990)}…` : text;
}
