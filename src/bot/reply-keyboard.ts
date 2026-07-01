import { Markup } from "telegraf";

export const REPLY = {
  BOTS: "📋 Боты",
  USERS: "👥 Пользователи",
  MENU: "🏠 Меню",
  MY_BOTS: "📌 Мои боты",
  HELP: "ℹ️ Помощь",
} as const;

export type ReplyAction = "bots" | "users" | "menu" | "mybots" | "help";

const ALL_LABELS = new Set<string>(Object.values(REPLY));

export function replyMainKeyboard(isAdmin: boolean) {
  const rows: string[][] = [[REPLY.BOTS, REPLY.MENU]];
  if (isAdmin) {
    rows.push([REPLY.USERS]);
  }
  rows.push([REPLY.MY_BOTS, REPLY.HELP]);
  return Markup.keyboard(rows).resize().persistent();
}

export function parseReplyAction(text: string, isAdmin: boolean): ReplyAction | null {
  const label = text.trim();
  if (!ALL_LABELS.has(label)) return null;
  if (label === REPLY.USERS && !isAdmin) return null;

  switch (label) {
    case REPLY.BOTS:
      return "bots";
    case REPLY.USERS:
      return "users";
    case REPLY.MENU:
      return "menu";
    case REPLY.MY_BOTS:
      return "mybots";
    case REPLY.HELP:
      return "help";
    default:
      return null;
  }
}

export function welcomeMessage(isAdmin: boolean): string {
  const lines = [
    "CreaBotManager — управление ботами на сервере.",
    "",
    "Используйте клавиатуру ниже или inline-кнопки в сообщениях.",
  ];
  if (isAdmin) {
    lines.push("", "Добавление: `/botadd`, `/useradd`");
  }
  return lines.join("\n");
}
