import type { Context, Telegraf } from "telegraf";
import {
  ACTION_PROGRESS_LABELS,
  formatProgressText,
  runWithProgress,
} from "./progress-reply";
import { executeServiceAction } from "./service-actions";
import {
  AccessControl,
  formatAdminOnly,
  formatUserGrant,
  formatUserRemoved,
  formatUserRevoke,
} from "../services/access-control";
import type { BotRegistryStore } from "../services/bot-registry";
import { RegistryError } from "../services/bot-registry";
import type { UserPermissionsStore } from "../services/user-permissions";
import { PermissionsError } from "../services/user-permissions";
import {
  backToMainKeyboard,
  botActionsKeyboard,
  botListKeyboard,
  botRemoveConfirmKeyboard,
  botPickerKeyboard,
  isValidBotId,
  mainMenuKeyboard,
  userActionsKeyboard,
  userListKeyboard,
  userRemoveConfirmKeyboard,
} from "./keyboards";
import { formatBotRemoved, type BotManager } from "../services/bot-manager";
import { formatServiceStateLabel } from "../services/service-status-format";
import { formatStatusEmoji } from "../services/systemd";
import { isCallbackQueryExpiredError, isMessageNotModifiedError } from "../utils/telegram-format";

export interface MenuContext {
  manager: BotManager;
  botStore: BotRegistryStore;
  permissionsStore: UserPermissionsStore;
  access: AccessControl;
  adminIds: number[];
}

type MenuCtx = Context;

async function ackCallback(
  ctx: MenuCtx,
  text?: string,
  options?: { show_alert?: boolean },
): Promise<void> {
  if (!ctx.callbackQuery) return;
  try {
    await ctx.answerCbQuery(text, options);
  } catch (err) {
    if (!isCallbackQueryExpiredError(err)) throw err;
  }
}

async function editOrReply(ctx: MenuCtx, text: string, opts?: object): Promise<void> {
  if (ctx.callbackQuery && "message" in ctx.callbackQuery && ctx.callbackQuery.message) {
    try {
      await ctx.editMessageText(text, opts);
    } catch (err) {
      if (!isMessageNotModifiedError(err)) {
        await ctx.reply(text, opts);
      }
    }
    return;
  }
  await ctx.reply(text, opts);
}

async function present(
  ctx: MenuCtx,
  text: string,
  keyboard?: ReturnType<typeof mainMenuKeyboard>,
): Promise<void> {
  const opts = keyboard
    ? { parse_mode: "Markdown" as const, ...keyboard }
    : { parse_mode: "Markdown" as const };
  await editOrReply(ctx, text, opts);
}

async function respond(ctx: MenuCtx, text: string, keyboard: ReturnType<typeof mainMenuKeyboard>): Promise<void> {
  await ackCallback(ctx);
  await present(ctx, text, keyboard);
}

async function respondPlain(ctx: MenuCtx, text: string): Promise<void> {
  await ackCallback(ctx);
  await present(ctx, text);
}

export async function showMainMenu(ctx: MenuCtx, access: AccessControl): Promise<void> {
  const userId = ctx.from?.id ?? -1;
  const isAdmin = access.isAdmin(userId);
  const text = [
    "CreaBotManager",
    "",
    "Выберите раздел:",
    "• Боты — управление сервисами",
    isAdmin ? "• Пользователи — доступ операторов" : "",
  ]
    .filter(Boolean)
    .join("\n");
  await respond(ctx, text, mainMenuKeyboard(isAdmin));
}

export async function showBotList(ctx: MenuCtx, deps: MenuContext): Promise<void> {
  const userId = ctx.from?.id;
  if (userId === undefined) return;

  await ackCallback(ctx, "Обновляю список…");
  await runWithProgress(
    ctx,
    formatProgressText(ACTION_PROGRESS_LABELS.list!),
    async () => {
      const statuses = await deps.manager.listStatuses();
      const visible = deps.access.filterStatuses(userId, statuses);

      if (visible.length === 0) {
        const hint = deps.access.isAdmin(userId)
          ? "Ботов пока нет. Добавьте: `/botadd <id> <service> [name]`"
          : "Вам не назначено ни одного бота.";
        return {
          text: hint,
          extras: { parse_mode: "Markdown" as const, ...backToMainKeyboard() },
        };
      }

      const lines = ["Выберите бота:", ""];
      for (const { bot, state } of visible) {
        lines.push(`• ${bot.name} (\`${bot.id}\`) — ${state}`);
      }
      return {
        text: lines.join("\n"),
        extras: { parse_mode: "Markdown" as const, ...botListKeyboard(visible) },
      };
    },
    { preferEdit: true },
  );
}

export async function showBotDetail(
  ctx: MenuCtx,
  deps: MenuContext,
  botId: string,
): Promise<void> {
  const userId = ctx.from?.id;
  if (userId === undefined || !isValidBotId(botId)) return;

  if (!deps.access.canAccessBot(userId, botId)) {
    await respondPlain(ctx, `⛔ Нет доступа к боту \`${botId}\`.`);
    return;
  }

  await ackCallback(ctx);
  const bot = deps.manager.getBot(botId);
  await runWithProgress(
    ctx,
    formatProgressText(ACTION_PROGRESS_LABELS.detail!, bot?.name ?? botId),
    async () => {
      const status = await deps.manager.getStatus(botId);
      if (!status) {
        return { text: `Бот \`${botId}\` не найден.`, extras: { parse_mode: "Markdown" as const } };
      }

      const subState =
        status.state === "active" ? "running" : status.state === "inactive" ? "dead" : undefined;
      const stateLabel = formatServiceStateLabel(status.state, subState);

      const text = [
        `*${status.bot.name}*`,
        `id: \`${status.bot.id}\``,
        `service: ${status.bot.serviceName}`,
        `статус: ${formatStatusEmoji(status.state)} ${stateLabel}`,
        "",
        "Выберите действие:",
      ].join("\n");

      return {
        text,
        extras: {
          parse_mode: "Markdown" as const,
          ...botActionsKeyboard(botId, deps.access.isAdmin(userId)),
        },
      };
    },
    { preferEdit: true },
  );
}

export async function runBotAction(
  ctx: MenuCtx,
  deps: MenuContext,
  botId: string,
  action: "start" | "stop" | "restart" | "status" | "logs",
): Promise<void> {
  const userId = ctx.from?.id;
  if (userId === undefined) return;

  if (!deps.access.canAccessBot(userId, botId)) {
    await ackCallback(ctx, "Нет доступа", { show_alert: true });
    return;
  }

  await ackCallback(ctx, "Выполняю…");
  await executeServiceAction(ctx, deps.manager, botId, action, {
    isAdmin: deps.access.isAdmin(userId),
  });
}

export async function showUserList(ctx: MenuCtx, deps: MenuContext): Promise<void> {
  const userId = ctx.from?.id;
  if (!deps.access.canManageUsers(userId ?? -1)) {
    await respondPlain(ctx, formatAdminOnly());
    return;
  }

  const users = deps.permissionsStore.listUsers();
  const lines = ["Пользователи:", ""];
  lines.push("*Админы:* " + (deps.adminIds.join(", ") || "(нет)"));
  if (users.length === 0) {
    lines.push("", "Операторов нет. Добавьте: `/useradd <telegramId> [имя]`");
  } else {
    lines.push("", "*Операторы:*");
    for (const user of users) {
      const label = user.label ? ` (${user.label})` : "";
      const bots = user.botIds.length > 0 ? user.botIds.join(", ") : "нет ботов";
      lines.push(`• ${user.telegramId}${label} — ${bots}`);
    }
  }
  lines.push("", "Выберите оператора:");

  await respond(ctx, lines.join("\n"), userListKeyboard(users));
}

export async function showUserDetail(
  ctx: MenuCtx,
  deps: MenuContext,
  telegramId: number,
): Promise<void> {
  const userId = ctx.from?.id;
  if (!deps.access.canManageUsers(userId ?? -1)) {
    await respondPlain(ctx, formatAdminOnly());
    return;
  }

  const user = deps.permissionsStore.getUser(telegramId);
  if (!user) {
    await respondPlain(ctx, `Пользователь ${telegramId} не найден.`);
    return;
  }

  const label = user.label ? ` (${user.label})` : "";
  const bots = user.botIds.length > 0 ? user.botIds.map((id) => `\`${id}\``).join(", ") : "нет";
  const text = [`*Оператор* ${telegramId}${label}`, "", `Боты: ${bots}`, "", "Выберите действие:"].join(
    "\n",
  );

  await respond(ctx, text, userActionsKeyboard(telegramId));
}

export async function showUserGrantPicker(
  ctx: MenuCtx,
  deps: MenuContext,
  telegramId: number,
): Promise<void> {
  const user = deps.permissionsStore.getUser(telegramId);
  if (!user) {
    await ctx.answerCbQuery("Пользователь не найден", { show_alert: true });
    return;
  }
  const registry = deps.botStore.getRegistry();
  await respond(
    ctx,
    `Выберите бота для выдачи доступа пользователю ${telegramId}:`,
    botPickerKeyboard(telegramId, user.botIds, registry.bots, "grant"),
  );
}

export async function showUserRevokePicker(
  ctx: MenuCtx,
  deps: MenuContext,
  telegramId: number,
): Promise<void> {
  const user = deps.permissionsStore.getUser(telegramId);
  if (!user) {
    await ctx.answerCbQuery("Пользователь не найден", { show_alert: true });
    return;
  }
  const registry = deps.botStore.getRegistry();
  await respond(
    ctx,
    `Выберите бота для отзыва доступа у ${telegramId}:`,
    botPickerKeyboard(telegramId, user.botIds, registry.bots, "revoke"),
  );
}

export async function showHelp(ctx: MenuCtx, deps: MenuContext): Promise<void> {
  const isAdmin = deps.access.isAdmin(ctx.from?.id ?? -1);
  const lines = [
    "*Клавиатура внизу:*",
    "📋 Боты — список и управление",
    "🏠 Меню — inline-меню",
    "📌 Мои боты — ваши назначенные боты",
    isAdmin ? "👥 Пользователи — операторы и доступ" : "",
    "",
    "*Добавление (текст):*",
    isAdmin ? "`/botadd <id> <service> [name]`" : "",
    isAdmin ? "`/useradd <telegramId> [имя]`" : "",
  ].filter(Boolean);
  await respond(ctx, lines.join("\n"), backToMainKeyboard());
}

export function registerMenuHandlers(bot: Telegraf, deps: MenuContext): void {
  bot.action("m:main", async (ctx) => {
    await showMainMenu(ctx, deps.access);
  });

  bot.action("m:bots", async (ctx) => {
    await showBotList(ctx, deps);
  });

  bot.action("m:users", async (ctx) => {
    await showUserList(ctx, deps);
  });

  bot.action("m:help", async (ctx) => {
    await showHelp(ctx, deps);
  });

  bot.action(/^b:([a-z0-9-]+)$/, async (ctx) => {
    const botId = ctx.match[1]!;
    await showBotDetail(ctx, deps, botId);
  });

  bot.action(/^b:([a-z0-9-]+):rm$/, async (ctx) => {
    if (!deps.access.canManageRegistry(ctx.from?.id ?? -1)) {
      await ctx.answerCbQuery("Только для админа", { show_alert: true });
      return;
    }
    const botId = ctx.match[1]!;
    await respond(
      ctx,
      `Удалить бота \`${botId}\` из реестра? Сервис на сервере не удаляется.`,
      botRemoveConfirmKeyboard(botId),
    );
  });

  bot.action(/^b:([a-z0-9-]+):rm:yes$/, async (ctx) => {
    if (!deps.access.canManageRegistry(ctx.from?.id ?? -1)) {
      await ctx.answerCbQuery("Только для админа", { show_alert: true });
      return;
    }
    const botId = ctx.match[1]!;
    try {
      const removed = deps.botStore.removeBot(botId);
      deps.permissionsStore.removeBotFromAllUsers(removed.id);
      await ctx.answerCbQuery("Удалён");
      await ctx.editMessageText(formatBotRemoved(removed), {
        parse_mode: "Markdown",
        ...backToMainKeyboard(),
      });
    } catch (err) {
      const msg = err instanceof RegistryError ? err.message : "Ошибка удаления";
      await ctx.answerCbQuery(msg, { show_alert: true });
    }
  });

  bot.action(/^b:([a-z0-9-]+):(start|stop|restart|status|logs)$/, async (ctx) => {
    const botId = ctx.match[1]!;
    const action = ctx.match[2] as "start" | "stop" | "restart" | "status" | "logs";
    await runBotAction(ctx, deps, botId, action);
  });

  bot.action(/^u:(\d+)$/, async (ctx) => {
    const telegramId = Number(ctx.match[1]);
    await showUserDetail(ctx, deps, telegramId);
  });

  bot.action(/^u:(\d+):rm$/, async (ctx) => {
    const telegramId = Number(ctx.match[1]);
    await respond(
      ctx,
      `Удалить пользователя ${telegramId}?`,
      userRemoveConfirmKeyboard(telegramId),
    );
  });

  bot.action(/^u:(\d+):rm:yes$/, async (ctx) => {
    const telegramId = Number(ctx.match[1]);
    try {
      deps.permissionsStore.removeUser(telegramId);
      await ctx.answerCbQuery("Удалён");
      await ctx.editMessageText(formatUserRemoved(telegramId), {
        parse_mode: "Markdown",
        ...backToMainKeyboard(),
      });
    } catch (err) {
      const msg = err instanceof PermissionsError ? err.message : "Ошибка";
      await ctx.answerCbQuery(msg, { show_alert: true });
    }
  });

  bot.action(/^u:(\d+):grant$/, async (ctx) => {
    await showUserGrantPicker(ctx, deps, Number(ctx.match[1]));
  });

  bot.action(/^u:(\d+):revoke$/, async (ctx) => {
    await showUserRevokePicker(ctx, deps, Number(ctx.match[1]));
  });

  bot.action(/^u:(\d+):grant:([a-z0-9-]+)$/, async (ctx) => {
    const telegramId = Number(ctx.match[1]);
    const botId = ctx.match[2]!;
    try {
      deps.permissionsStore.grantBot(telegramId, botId);
      await ctx.answerCbQuery("Доступ выдан");
      await ctx.editMessageText(formatUserGrant(telegramId, botId), {
        parse_mode: "Markdown",
        ...userActionsKeyboard(telegramId),
      });
    } catch (err) {
      const msg = err instanceof PermissionsError ? err.message : "Ошибка";
      await ctx.answerCbQuery(msg, { show_alert: true });
    }
  });

  bot.action(/^u:(\d+):revoke:([a-z0-9-]+)$/, async (ctx) => {
    const telegramId = Number(ctx.match[1]);
    const botId = ctx.match[2]!;
    try {
      deps.permissionsStore.revokeBot(telegramId, botId);
      await ctx.answerCbQuery("Доступ отозван");
      await ctx.editMessageText(formatUserRevoke(telegramId, botId), {
        parse_mode: "Markdown",
        ...userActionsKeyboard(telegramId),
      });
    } catch (err) {
      const msg = err instanceof PermissionsError ? err.message : "Ошибка";
      await ctx.answerCbQuery(msg, { show_alert: true });
    }
  });
}
