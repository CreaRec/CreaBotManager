import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "../config";
import { BotManager } from "../services/bot-manager";
import { loadBotRegistry } from "../services/bot-registry";
import { registerManagementCommands } from "./management-commands";

export function createBot(): Telegraf {
  const registry = loadBotRegistry(config.managedBotsConfigPath);
  const manager = new BotManager(registry, {
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
        "Команды:",
        "/bots — список зарегистрированных ботов и их статус",
        "/botstart <id> — запустить сервис",
        "/botstop <id> — остановить сервис",
        "/botrestart <id> — перезапустить сервис",
        "/botstatus <id> — подробный статус systemd",
        "/botlogs <id> [строк] — последние логи",
        "",
        "Зарегистрировано ботов: " + registry.bots.length,
      ].join("\n"),
    );
  });

  bot.help(async (ctx) => {
    await ctx.reply(
      [
        "Доступные команды:",
        "/bots — список ботов",
        "/botstart <id> — start",
        "/botstop <id> — stop",
        "/botrestart <id> — restart",
        "/botstatus <id> — status",
        "/botlogs <id> [lines] — logs",
        "",
        "Боты настраиваются в config/managed-bots.json",
      ].join("\n"),
    );
  });

  registerManagementCommands(bot, manager, registry);

  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return;
    await ctx.reply("Используйте /help для списка команд.");
  });

  return bot;
}
