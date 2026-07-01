import type { Telegraf } from "telegraf";
import type { BotManager } from "../services/bot-manager";
import {
  formatActionResult,
  formatBotAdded,
  formatBotList,
  formatBotRemoved,
  formatDetailedStatus,
  formatLogs,
  unknownBotMessage,
} from "../services/bot-manager";
import {
  AccessControl,
  formatAccessDenied,
  formatAdminOnly,
} from "../services/access-control";
import { RegistryError, type BotRegistryStore } from "../services/bot-registry";
import type { UserPermissionsStore } from "../services/user-permissions";
import { ZodError } from "zod";

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

function parseBotAddArgs(text: string): { id: string; serviceName: string; name: string } | null {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const id = parts[1] ?? "";
  const serviceName = parts[2] ?? "";
  const name = parts.slice(3).join(" ").trim() || id;
  return { id, serviceName, name };
}

function formatRegistryError(err: unknown): string {
  if (err instanceof RegistryError) return `❌ ${err.message}`;
  if (err instanceof ZodError) {
    const detail = err.issues.map((issue) => issue.message).join("; ");
    return `❌ Invalid bot data: ${detail}`;
  }
  if (err instanceof Error) return `❌ ${err.message}`;
  return "❌ Failed to update bot registry.";
}

function canUseBot(access: AccessControl, userId: number | undefined, botId: string): userId is number {
  return userId !== undefined && access.canAccessBot(userId, botId);
}

export function registerManagementCommands(
  bot: Telegraf,
  manager: BotManager,
  store: BotRegistryStore,
  permissionsStore: UserPermissionsStore,
  access: AccessControl,
): void {
  bot.command("bots", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const statuses = await manager.listStatuses();
    const visible = access.filterStatuses(userId, statuses);
    const isAdmin = access.isAdmin(userId);
    await ctx.reply(formatBotList(visible, { isAdmin }), { parse_mode: "Markdown" });
  });

  bot.command("botadd", async (ctx) => {
    const userId = ctx.from?.id;
    if (!access.canManageRegistry(userId ?? -1)) {
      await ctx.reply(formatAdminOnly());
      return;
    }

    const args = parseBotAddArgs(ctx.message.text);
    if (!args) {
      await ctx.reply(
        [
          "Usage: /botadd <id> <service> [name]",
          "",
          "Example:",
          "/botadd trip-planner telegram-trip-planner Crea Trip Planner",
        ].join("\n"),
      );
      return;
    }

    try {
      const botEntry = store.addBot(args);
      await ctx.reply(formatBotAdded(botEntry), { parse_mode: "Markdown" });
    } catch (err) {
      await ctx.reply(formatRegistryError(err));
    }
  });

  bot.command("botremove", async (ctx) => {
    const userId = ctx.from?.id;
    if (!access.canManageRegistry(userId ?? -1)) {
      await ctx.reply(formatAdminOnly());
      return;
    }

    const id = extractArg(ctx.message.text);
    if (!id) {
      await ctx.reply("Usage: /botremove <id>");
      return;
    }

    try {
      const botEntry = store.removeBot(id);
      permissionsStore.removeBotFromAllUsers(botEntry.id);
      await ctx.reply(formatBotRemoved(botEntry), { parse_mode: "Markdown" });
    } catch (err) {
      await ctx.reply(formatRegistryError(err));
    }
  });

  bot.command("botstart", async (ctx) => {
    const userId = ctx.from?.id;
    const id = extractArg(ctx.message.text);
    if (!id) {
      await ctx.reply("Usage: /botstart <id>");
      return;
    }
    if (!canUseBot(access, userId, id)) {
      await ctx.reply(formatAccessDenied(id), { parse_mode: "Markdown" });
      return;
    }
    const result = await manager.runAction(id, "start");
    if (!result) {
      await ctx.reply(unknownBotMessage(id, store.getRegistry()), { parse_mode: "Markdown" });
      return;
    }
    await ctx.reply(formatActionResult(result), { parse_mode: "Markdown" });
  });

  bot.command("botstop", async (ctx) => {
    const userId = ctx.from?.id;
    const id = extractArg(ctx.message.text);
    if (!id) {
      await ctx.reply("Usage: /botstop <id>");
      return;
    }
    if (!canUseBot(access, userId, id)) {
      await ctx.reply(formatAccessDenied(id), { parse_mode: "Markdown" });
      return;
    }
    const result = await manager.runAction(id, "stop");
    if (!result) {
      await ctx.reply(unknownBotMessage(id, store.getRegistry()), { parse_mode: "Markdown" });
      return;
    }
    await ctx.reply(formatActionResult(result), { parse_mode: "Markdown" });
  });

  bot.command("botrestart", async (ctx) => {
    const userId = ctx.from?.id;
    const id = extractArg(ctx.message.text);
    if (!id) {
      await ctx.reply("Usage: /botrestart <id>");
      return;
    }
    if (!canUseBot(access, userId, id)) {
      await ctx.reply(formatAccessDenied(id), { parse_mode: "Markdown" });
      return;
    }
    const result = await manager.runAction(id, "restart");
    if (!result) {
      await ctx.reply(unknownBotMessage(id, store.getRegistry()), { parse_mode: "Markdown" });
      return;
    }
    await ctx.reply(formatActionResult(result), { parse_mode: "Markdown" });
  });

  bot.command("botstatus", async (ctx) => {
    const userId = ctx.from?.id;
    const id = extractArg(ctx.message.text);
    if (!id) {
      await ctx.reply("Usage: /botstatus <id>");
      return;
    }
    if (!canUseBot(access, userId, id)) {
      await ctx.reply(formatAccessDenied(id), { parse_mode: "Markdown" });
      return;
    }
    const result = await manager.getDetailedStatus(id);
    if (!result) {
      await ctx.reply(unknownBotMessage(id, store.getRegistry()), { parse_mode: "Markdown" });
      return;
    }
    await ctx.reply(formatDetailedStatus(result.bot, result.command));
  });

  bot.command("botlogs", async (ctx) => {
    const userId = ctx.from?.id;
    const { id, lines } = extractArgAndNumber(ctx.message.text);
    if (!id) {
      await ctx.reply("Usage: /botlogs <id> [lines]");
      return;
    }
    if (!canUseBot(access, userId, id)) {
      await ctx.reply(formatAccessDenied(id), { parse_mode: "Markdown" });
      return;
    }
    const result = await manager.getLogs(id, lines);
    if (!result) {
      await ctx.reply(unknownBotMessage(id, store.getRegistry()), { parse_mode: "Markdown" });
      return;
    }
    await ctx.reply(formatLogs(result.bot, result.command));
  });
}
