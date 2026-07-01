import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "../config";

export function createBot(): Telegraf {
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
        "Hi! This bot is a template — add your handlers in src/bot/bot.ts.",
        "",
        "Try /help for available commands.",
      ].join("\n"),
    );
  });

  bot.help(async (ctx) => {
    await ctx.reply(["Available commands:", "/start — welcome message", "/help — this message"].join("\n"));
  });

  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return;
    await ctx.reply("Bot template is running. Implement your logic in src/bot/bot.ts.");
  });

  return bot;
}
