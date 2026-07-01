import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "../config";
import { AccessControl } from "../services/access-control";
import { BotManager } from "../services/bot-manager";
import { BotRegistryStore } from "../services/bot-registry";
import { UserPermissionsStore } from "../services/user-permissions";
import { registerManagementCommands } from "./management-commands";
import { registerUserCommands } from "./user-commands";

export interface BotRuntime {
  bot: Telegraf;
  botStore: BotRegistryStore;
  permissionsStore: UserPermissionsStore;
  access: AccessControl;
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
    const isAdmin = access.isAdmin(ctx.from?.id ?? -1);
    const lines = [
      "CreaBotManager — управление Telegram-ботами на сервере.",
      "",
      "Боты:",
      "/bots — список доступных ботов",
      "/mybots — мои назначенные боты",
      "/botstart <id> — запустить",
      "/botstop <id> — остановить",
      "/botrestart <id> — перезапустить",
      "/botstatus <id> — статус systemd",
      "/botlogs <id> [строк] — логи",
    ];

    if (isAdmin) {
      lines.push(
        "",
        "Админ — реестр ботов:",
        "/botadd <id> <service> [name]",
        "/botremove <id>",
        "",
        "Админ — пользователи:",
        "/users — список пользователей",
        "/useradd <telegramId> [label]",
        "/userremove <telegramId>",
        "/usergrant <telegramId> <botId>",
        "/userrevoke <telegramId> <botId>",
      );
    }

    lines.push("", "Зарегистрировано ботов: " + botStore.getRegistry().bots.length);
    await ctx.reply(lines.join("\n"));
  });

  bot.help(async (ctx) => {
    const isAdmin = access.isAdmin(ctx.from?.id ?? -1);
    const lines = [
      "Боты:",
      "/bots, /mybots",
      "/botstart <id>, /botstop <id>, /botrestart <id>",
      "/botstatus <id>, /botlogs <id> [lines]",
    ];
    if (isAdmin) {
      lines.push(
        "",
        "Админ:",
        "/botadd <id> <service> [name], /botremove <id>",
        "/users, /useradd, /userremove",
        "/usergrant <telegramId> <botId>, /userrevoke <telegramId> <botId>",
      );
    }
    await ctx.reply(lines.join("\n"));
  });

  registerManagementCommands(bot, manager, botStore, permissionsStore, access);
  registerUserCommands(bot, access, permissionsStore, botStore, config.adminTelegramIds);

  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return;
    await ctx.reply("Используйте /help для списка команд.");
  });

  return { bot, botStore, permissionsStore, access };
}
