import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "../config";
import { AccessControl } from "../services/access-control";
import { BotManager } from "../services/bot-manager";
import { BotRegistryStore } from "../services/bot-registry";
import { UserPermissionsStore } from "../services/user-permissions";
import { registerManagementCommands } from "./management-commands";
import { registerMenuHandlers, showBotList, showMainMenu, showUserList, type MenuContext } from "./menu-handlers";
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
    await showMainMenu(ctx, access);
  });

  bot.help(async (ctx) => {
    await showMainMenu(ctx, access);
  });

  bot.command("menu", async (ctx) => {
    await showMainMenu(ctx, access);
  });

  registerMenuHandlers(bot, menuDeps);
  registerManagementCommands(bot, menuDeps);
  registerUserCommands(bot, menuDeps);

  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) {
      await ctx.reply("Неизвестная команда. Используйте /menu или /help.");
      return;
    }
    if (matchesTrigger(text, BOT_LIST_TRIGGERS)) {
      await showBotList(ctx, menuDeps);
      return;
    }
    if (access.isAdmin(ctx.from?.id ?? -1) && matchesTrigger(text, USER_LIST_TRIGGERS)) {
      await showUserList(ctx, menuDeps);
      return;
    }
    await ctx.reply("Используйте /menu — главное меню с кнопками.");
  });

  return { bot, botStore, permissionsStore, access };
}
