import { Markup } from "telegraf";
import type { BotStatus } from "../services/bot-manager";
import type { UserPermission } from "../services/user-permissions";
import { formatStatusEmoji } from "../services/systemd";

const BOT_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

export function isValidBotId(id: string): boolean {
  return BOT_ID_RE.test(id);
}

export function botSelectData(botId: string): string {
  return `b:${botId}`;
}

export function botActionData(botId: string, action: string): string {
  return `b:${botId}:${action}`;
}

export function userSelectData(telegramId: number): string {
  return `u:${telegramId}`;
}

export function userActionData(telegramId: number, action: string, botId?: string): string {
  return botId ? `u:${telegramId}:${action}:${botId}` : `u:${telegramId}:${action}`;
}

export function mainMenuKeyboard(isAdmin: boolean) {
  const rows: ReturnType<typeof Markup.button.callback>[][] = [
    [Markup.button.callback("📋 Боты", "m:bots")],
  ];
  if (isAdmin) {
    rows.push([Markup.button.callback("👥 Пользователи", "m:users")]);
  }
  rows.push([Markup.button.callback("ℹ️ Помощь", "m:help")]);
  return Markup.inlineKeyboard(rows);
}

export function botListKeyboard(statuses: BotStatus[]) {
  const rows = statuses.map(({ bot, state }) => [
    Markup.button.callback(`${formatStatusEmoji(state)} ${bot.name}`, botSelectData(bot.id)),
  ]);
  rows.push([Markup.button.callback("« Главное меню", "m:main")]);
  return Markup.inlineKeyboard(rows);
}

export function botActionsKeyboard(botId: string, isAdmin: boolean) {
  const rows = [
    [
      Markup.button.callback("▶️ Запуск", botActionData(botId, "start")),
      Markup.button.callback("⏹ Стоп", botActionData(botId, "stop")),
    ],
    [Markup.button.callback("🔄 Перезапуск", botActionData(botId, "restart"))],
    [
      Markup.button.callback("📊 Статус", botActionData(botId, "status")),
      Markup.button.callback("📜 Логи", botActionData(botId, "logs")),
    ],
  ];
  if (isAdmin) {
    rows.push([Markup.button.callback("🗑 Удалить бота", botActionData(botId, "rm"))]);
  }
  rows.push([Markup.button.callback("« К списку ботов", "m:bots")]);
  return Markup.inlineKeyboard(rows);
}

export function botRemoveConfirmKeyboard(botId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Да, удалить", botActionData(botId, "rm:yes")),
      Markup.button.callback("❌ Отмена", botSelectData(botId)),
    ],
  ]);
}

export function userListKeyboard(users: UserPermission[]) {
  const rows = users.map((user) => {
    const label = user.label ? `${user.label}` : String(user.telegramId);
    const suffix = user.botIds.length > 0 ? ` (${user.botIds.length} бот.)` : "";
    return [Markup.button.callback(`👤 ${label}${suffix}`, userSelectData(user.telegramId))];
  });
  rows.push([Markup.button.callback("« Главное меню", "m:main")]);
  return Markup.inlineKeyboard(rows);
}

export function userActionsKeyboard(telegramId: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("➕ Выдать доступ к боту", userActionData(telegramId, "grant"))],
    [Markup.button.callback("➖ Забрать доступ", userActionData(telegramId, "revoke"))],
    [Markup.button.callback("🗑 Удалить пользователя", userActionData(telegramId, "rm"))],
    [Markup.button.callback("« К списку", "m:users")],
  ]);
}

export function userRemoveConfirmKeyboard(telegramId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Да, удалить", userActionData(telegramId, "rm:yes")),
      Markup.button.callback("❌ Отмена", userSelectData(telegramId)),
    ],
  ]);
}

export function botPickerKeyboard(
  telegramId: number,
  botIds: string[],
  registryBots: { id: string; name: string }[],
  mode: "grant" | "revoke",
) {
  const rows = registryBots
    .filter((bot) => (mode === "grant" ? !botIds.includes(bot.id) : botIds.includes(bot.id)))
    .map((bot) => [
      Markup.button.callback(bot.name, userActionData(telegramId, mode, bot.id)),
    ]);

  if (rows.length === 0) {
    rows.push([Markup.button.callback("(нет доступных ботов)", userSelectData(telegramId))]);
  }
  rows.push([Markup.button.callback("« Назад", userSelectData(telegramId))]);
  return Markup.inlineKeyboard(rows);
}

export function backToMainKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback("« Главное меню", "m:main")]]);
}
