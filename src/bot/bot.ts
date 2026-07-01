import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "../config";
import { BotManager } from "../services/bot-manager";
import { BotRegistryStore } from "../services/bot-registry";
import { registerManagementCommands } from "./management-commands";

export function createBot(store: BotRegistryStore): Telegraf {
  const manager = new BotManager(store, {
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
    const allowed = config.allowedTelegramIds;
    if (allowed.length > 0 && !allowed.includes(from.id)) {
      await ctx.reply("Sorry, you are not authorized to use this bot.");
      return;
    }
    return next();
  });

  bot.start(async (ctx) => {
    await ctx.reply(
      [
        "CreaBotManager — управление Telegram-ботами на сервере.",
        "",
        "Реестр:",
        "/botadd <id> <service> [name] — добавить бота",
        "/botremove <id> — удалить из реестра",
        "/bots — список ботов и статус",
        "",
        "Сервисы:",
        "/botstart <id> — запустить",
        "/botstop <id> — остановить",
        "/botrestart <id> — перезапустить",
        "/botstatus <id> — статус systemd",
        "/botlogs <id> [строк] — логи",
        "",
        "Зарегистрировано ботов: " + store.getRegistry().bots.length,
      ].join("\n"),
    );
  });

  bot.help(async (ctx) => {
    await ctx.reply(
      [
        "Реестр ботов:",
        "/botadd <id> <service> [name]",
        "/botremove <id>",
        "/bots",
        "",
        "Управление сервисами:",
        "/botstart <id>",
        "/botstop <id>",
        "/botrestart <id>",
        "/botstatus <id>",
        "/botlogs <id> [lines]",
      ].join("\n"),
    );
  });

  registerManagementCommands(bot, manager, store);

  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return;
    await ctx.reply("Используйте /help для списка команд.");
  });

  return bot;
}
