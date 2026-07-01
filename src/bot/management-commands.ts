import type { Telegraf } from "telegraf";
import { ZodError } from "zod";
import {
  formatBotAdded,
  formatBotRemoved,
} from "../services/bot-manager";
import { formatAccessDenied, formatAdminOnly } from "../services/access-control";
import { RegistryError } from "../services/bot-registry";
import { showBotList, type MenuContext } from "./menu-handlers";
import { executeServiceAction } from "./service-actions";

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

export function registerManagementCommands(bot: Telegraf, deps: MenuContext): void {
  const { manager, botStore: store, permissionsStore, access } = deps;

  bot.command("bots", async (ctx) => {
    await showBotList(ctx, deps);
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
      await ctx.reply("Usage: /botstart <id> — или откройте /menu");
      return;
    }
    if (!access.canAccessBot(userId ?? -1, id)) {
      await ctx.reply(formatAccessDenied(id), { parse_mode: "Markdown" });
      return;
    }
    await executeServiceAction(ctx, manager, id, "start", {
      isAdmin: access.isAdmin(userId ?? -1),
    });
  });

  bot.command("botstop", async (ctx) => {
    const userId = ctx.from?.id;
    const id = extractArg(ctx.message.text);
    if (!id) {
      await ctx.reply("Usage: /botstop <id>");
      return;
    }
    if (!access.canAccessBot(userId ?? -1, id)) {
      await ctx.reply(formatAccessDenied(id), { parse_mode: "Markdown" });
      return;
    }
    await executeServiceAction(ctx, manager, id, "stop", {
      isAdmin: access.isAdmin(userId ?? -1),
    });
  });

  bot.command("botrestart", async (ctx) => {
    const userId = ctx.from?.id;
    const id = extractArg(ctx.message.text);
    if (!id) {
      await ctx.reply("Usage: /botrestart <id>");
      return;
    }
    if (!access.canAccessBot(userId ?? -1, id)) {
      await ctx.reply(formatAccessDenied(id), { parse_mode: "Markdown" });
      return;
    }
    await executeServiceAction(ctx, manager, id, "restart", {
      isAdmin: access.isAdmin(userId ?? -1),
    });
  });

  bot.command("botstatus", async (ctx) => {
    const userId = ctx.from?.id;
    const id = extractArg(ctx.message.text);
    if (!id) {
      await ctx.reply("Usage: /botstatus <id>");
      return;
    }
    if (!access.canAccessBot(userId ?? -1, id)) {
      await ctx.reply(formatAccessDenied(id), { parse_mode: "Markdown" });
      return;
    }
    await executeServiceAction(ctx, manager, id, "status");
  });

  bot.command("botlogs", async (ctx) => {
    const userId = ctx.from?.id;
    const { id, lines } = extractArgAndNumber(ctx.message.text);
    if (!id) {
      await ctx.reply("Usage: /botlogs <id> [lines]");
      return;
    }
    if (!access.canAccessBot(userId ?? -1, id)) {
      await ctx.reply(formatAccessDenied(id), { parse_mode: "Markdown" });
      return;
    }
    await executeServiceAction(ctx, manager, id, "logs", { logLines: lines });
  });
}
