import type { Telegraf } from "telegraf";
import type { BotManager } from "../services/bot-manager";
import {
  formatActionResult,
  formatBotList,
  formatDetailedStatus,
  formatLogs,
  unknownBotMessage,
} from "../services/bot-manager";
import type { BotRegistry } from "../services/bot-registry";

function extractArg(text: string): string {
  const parts = text.trim().split(/\s+/);
  return parts[1] ?? "";
}

function extractArgAndNumber(text: string): { id: string; lines: number } {
  const parts = text.trim().split(/\s+/);
  const id = parts[1] ?? "";
  const lines = parts[2] ? Number(parts[2]) : 30;
  return { id, lines: Number.isFinite(lines) ? lines : 30 };
}

export function registerManagementCommands(
  bot: Telegraf,
  manager: BotManager,
  registry: BotRegistry,
): void {
  bot.command("bots", async (ctx) => {
    const statuses = await manager.listStatuses();
    await ctx.reply(formatBotList(statuses), { parse_mode: "Markdown" });
  });

  bot.command("botstart", async (ctx) => {
    const id = extractArg(ctx.message.text);
    if (!id) {
      await ctx.reply("Usage: /botstart <id>");
      return;
    }
    const result = await manager.runAction(id, "start");
    if (!result) {
      await ctx.reply(unknownBotMessage(id, registry), { parse_mode: "Markdown" });
      return;
    }
    await ctx.reply(formatActionResult(result), { parse_mode: "Markdown" });
  });

  bot.command("botstop", async (ctx) => {
    const id = extractArg(ctx.message.text);
    if (!id) {
      await ctx.reply("Usage: /botstop <id>");
      return;
    }
    const result = await manager.runAction(id, "stop");
    if (!result) {
      await ctx.reply(unknownBotMessage(id, registry), { parse_mode: "Markdown" });
      return;
    }
    await ctx.reply(formatActionResult(result), { parse_mode: "Markdown" });
  });

  bot.command("botrestart", async (ctx) => {
    const id = extractArg(ctx.message.text);
    if (!id) {
      await ctx.reply("Usage: /botrestart <id>");
      return;
    }
    const result = await manager.runAction(id, "restart");
    if (!result) {
      await ctx.reply(unknownBotMessage(id, registry), { parse_mode: "Markdown" });
      return;
    }
    await ctx.reply(formatActionResult(result), { parse_mode: "Markdown" });
  });

  bot.command("botstatus", async (ctx) => {
    const id = extractArg(ctx.message.text);
    if (!id) {
      await ctx.reply("Usage: /botstatus <id>");
      return;
    }
    const result = await manager.getDetailedStatus(id);
    if (!result) {
      await ctx.reply(unknownBotMessage(id, registry), { parse_mode: "Markdown" });
      return;
    }
    await ctx.reply(formatDetailedStatus(result.bot, result.command));
  });

  bot.command("botlogs", async (ctx) => {
    const { id, lines } = extractArgAndNumber(ctx.message.text);
    if (!id) {
      await ctx.reply("Usage: /botlogs <id> [lines]");
      return;
    }
    const result = await manager.getLogs(id, lines);
    if (!result) {
      await ctx.reply(unknownBotMessage(id, registry), { parse_mode: "Markdown" });
      return;
    }
    await ctx.reply(formatLogs(result.bot, result.command));
  });
}
