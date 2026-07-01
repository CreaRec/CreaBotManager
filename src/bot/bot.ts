import { Telegraf, type Context } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "../config";
import { AccessControl, formatMyBots } from "../services/access-control";
import { BotManager } from "../services/bot-manager";
import { BotRegistryStore } from "../services/bot-registry";
import { UserPermissionsStore } from "../services/user-permissions";
import { registerManagementCommands } from "./management-commands";
import {
  registerMenuHandlers,
  showBotList,
  showHelp,
  showMainMenu,
  showUserList,
  type MenuContext,
} from "./menu-handlers";
import { parseReplyAction, replyMainKeyboard, welcomeMessage } from "./reply-keyboard";
import { registerUserCommands } from "./user-commands";

export interface BotRuntime {
  bot: Telegraf;
  botStore: BotRegistryStore;
  permissionsStore: UserPermissionsStore;
  access: AccessControl;
}

const BOT_LIST_TRIGGERS = ["боты", "список ботов", "list bots", "bots"];
const USER_LIST_TRIGGERS = ["пользователи", "список пользователей", "users"];

function matchesTrigger(text: string, triggers: string[]): boolean {
  const normalized = text.trim().toLowerCase();
  return triggers.some((t) => normalized === t || normalized.includes(t));
}

async function sendWelcome(ctx: Context, access: AccessControl): Promise<void> {
  const isAdmin = access.isAdmin(ctx.from?.id ?? -1);
  await ctx.reply(welcomeMessage(isAdmin), {
    parse_mode: "Markdown",
    ...replyMainKeyboard(isAdmin),
  });
}

export function createBot(
  botStore: BotRegistryStore,
  permissionsStore: UserPermissionsStore,
  access: AccessControl,
): BotRuntime {
  const manager = new BotManager(botStore, {
    systemctlPath: config.systemctlPath,
    journalctlPath: config.journalctlPath,
    useSudo: config.useSudoForSystemctl,
  });

  const menuDeps: MenuContext = {
    manager,
    botStore,
    permissionsStore,
    access,
    adminIds: config.adminTelegramIds,
  };

  const bot = new Telegraf(config.telegramBotToken, {
    handlerTimeout: config.botHandlerTimeoutMs,
  });

  bot.catch((err, ctx) => {
    console.error("[bot] unhandled error:", err);
    const reply =
      err instanceof Error && err.name === "TimeoutError"
        ? "Request timed out. Please try again."
        : "Something went wrong. Please try again.";
    void ctx.reply(reply).catch((replyErr) => {
      console.error("[bot] failed to send error reply:", replyErr);
    });
  });

  bot.use(async (ctx, next) => {
    const from = ctx.from;
    if (!from) return;
    if (!access.isKnownUser(from.id) && !access.isOpenMode()) {
      await ctx.reply("Sorry, you are not authorized to use this bot.");
      return;
    }
    return next();
  });

  bot.start(async (ctx) => {
    await sendWelcome(ctx, access);
  });

  bot.help(async (ctx) => {
    await sendWelcome(ctx, access);
    await showHelp(ctx, menuDeps);
  });

  bot.command("menu", async (ctx) => {
    await sendWelcome(ctx, access);
    await showMainMenu(ctx, access);
  });

  registerMenuHandlers(bot, menuDeps);
  registerManagementCommands(bot, menuDeps);
  registerUserCommands(bot, menuDeps);

  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text;
    const userId = ctx.from?.id ?? -1;
    const isAdmin = access.isAdmin(userId);

    if (text.startsWith("/")) {
      await ctx.reply("Неизвестная команда. Используйте /menu или /help.", replyMainKeyboard(isAdmin));
      return;
    }

    const replyAction = parseReplyAction(text, isAdmin);
    if (replyAction === "bots") {
      await showBotList(ctx, menuDeps);
      return;
    }
    if (replyAction === "users") {
      await showUserList(ctx, menuDeps);
      return;
    }
    if (replyAction === "menu") {
      await showMainMenu(ctx, access);
      return;
    }
    if (replyAction === "help") {
      await showHelp(ctx, menuDeps);
      return;
    }
    if (replyAction === "mybots") {
      const registry = botStore.getRegistry();
      const accessIds = access.getAccessibleBotIds(userId);
      const botIds = accessIds === "all" ? registry.bots.map((b) => b.id) : accessIds;
      await ctx.reply(
        formatMyBots(userId, isAdmin, botIds, registry.bots.map((b) => b.id)),
        replyMainKeyboard(isAdmin),
      );
      return;
    }

    if (matchesTrigger(text, BOT_LIST_TRIGGERS)) {
      await showBotList(ctx, menuDeps);
      return;
    }
    if (isAdmin && matchesTrigger(text, USER_LIST_TRIGGERS)) {
      await showUserList(ctx, menuDeps);
      return;
    }

    await ctx.reply("Используйте кнопки на клавиатуре внизу.", replyMainKeyboard(isAdmin));
  });

  return { bot, botStore, permissionsStore, access };
}
