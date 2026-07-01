import type { Context } from "telegraf";
import type { InlineKeyboardMarkup } from "telegraf/types";
import { isMessageNotModifiedError } from "../utils/telegram-format";

export type ProgressExtras = {
  parse_mode?: "Markdown";
  reply_markup?: InlineKeyboardMarkup;
};

export const ACTION_PROGRESS_LABELS: Record<string, string> = {
  start: "Запускаю",
  stop: "Останавливаю",
  restart: "Перезапускаю",
  status: "Получаю статус",
  logs: "Загружаю логи",
  list: "Обновляю список ботов",
  detail: "Загружаю данные бота",
};

export function formatProgressText(label: string, subject?: string): string {
  return subject ? `⏳ ${label} ${subject}…` : `⏳ ${label}…`;
}

function hasCallbackMessage(ctx: Context): boolean {
  return Boolean(
    ctx.callbackQuery && "message" in ctx.callbackQuery && ctx.callbackQuery.message,
  );
}

async function showPendingOnMessage(
  ctx: Context,
  pendingText: string,
  preferEdit: boolean,
): Promise<{ mode: "edit" } | { mode: "reply"; chatId: number; messageId: number } | null> {
  if (preferEdit && hasCallbackMessage(ctx)) {
    try {
      await ctx.editMessageText(pendingText);
      return { mode: "edit" };
    } catch (err) {
      if (!isMessageNotModifiedError(err)) {
        // Fall through to a new progress message.
      }
    }
  }

  const chatId = ctx.chat?.id;
  if (!chatId) return null;

  const message = await ctx.reply(pendingText);
  return { mode: "reply", chatId, messageId: message.message_id };
}

async function finalizeMessage(
  ctx: Context,
  target: { mode: "edit" } | { mode: "reply"; chatId: number; messageId: number } | null,
  text: string,
  extras?: ProgressExtras,
): Promise<void> {
  if (target?.mode === "edit") {
    try {
      await ctx.editMessageText(text, extras);
      return;
    } catch (err) {
      if (isMessageNotModifiedError(err)) return;
    }
  }

  if (target?.mode === "reply") {
    try {
      await ctx.telegram.editMessageText(
        target.chatId,
        target.messageId,
        undefined,
        text,
        extras,
      );
      return;
    } catch (err) {
      if (isMessageNotModifiedError(err)) return;
    }
  }

  await ctx.reply(text, extras);
}

/** Show pending text immediately, run slow work, then update the same message with the result. */
export async function runWithProgress(
  ctx: Context,
  pendingText: string,
  work: () => Promise<{ text: string; extras?: ProgressExtras }>,
  options?: { preferEdit?: boolean },
): Promise<void> {
  const preferEdit = options?.preferEdit ?? hasCallbackMessage(ctx);
  const target = await showPendingOnMessage(ctx, pendingText, preferEdit);
  const result = await work();
  await finalizeMessage(ctx, target, result.text, result.extras);
}
