import type { Telegraf } from "telegraf";
import { ZodError } from "zod";
import {
  formatMyBots,
  formatUserAdded,
  formatUserGrant,
  formatUserRemoved,
  formatUserRevoke,
} from "../services/access-control";
import { PermissionsError } from "../services/user-permissions";
import { showUserList, type MenuContext } from "./menu-handlers";

function extractArgs(text: string): string[] {
  return text.trim().split(/\s+/).slice(1);
}

function parseTelegramId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new PermissionsError(`Invalid telegram id: ${raw}`);
  }
  return id;
}

function formatPermissionsError(err: unknown): string {
  if (err instanceof PermissionsError) return `❌ ${err.message}`;
  if (err instanceof ZodError) {
    return `❌ Invalid data: ${err.issues.map((issue) => issue.message).join("; ")}`;
  }
  if (err instanceof Error) return `❌ ${err.message}`;
  return "❌ Failed to update user permissions.";
}

export function registerUserCommands(bot: Telegraf, deps: MenuContext): void {
  const { access, permissionsStore, botStore, adminIds } = deps;

  bot.command("users", async (ctx) => {
    await showUserList(ctx, deps);
  });

  bot.command("useradd", async (ctx) => {
    const userId = ctx.from?.id;
    if (!access.canManageUsers(userId ?? -1)) {
      await ctx.reply("⛔ This command is available to admins only.");
      return;
    }

    const args = extractArgs(ctx.message.text);
    if (args.length < 1) {
      await ctx.reply("Usage: /useradd <telegramId> [label]");
      return;
    }

    try {
      const telegramId = parseTelegramId(args[0]!);
      if (adminIds.includes(telegramId)) {
        await ctx.reply(`User ${telegramId} is already an admin.`);
        return;
      }
      const label = args.slice(1).join(" ").trim() || undefined;
      permissionsStore.addUser(telegramId, label);
      await ctx.reply(formatUserAdded(telegramId, label));
    } catch (err) {
      await ctx.reply(formatPermissionsError(err));
    }
  });

  bot.command("userremove", async (ctx) => {
    const userId = ctx.from?.id;
    if (!access.canManageUsers(userId ?? -1)) {
      await ctx.reply("⛔ This command is available to admins only.");
      return;
    }

    const args = extractArgs(ctx.message.text);
    const telegramIdRaw = ctx.args[0] ?? args[0];
    if (!telegramIdRaw) {
      await ctx.reply("Usage: /userremove <telegramId> — или откройте /menu → Пользователи");
      return;
    }

    try {
      const telegramId = parseTelegramId(telegramIdRaw);
      permissionsStore.removeUser(telegramId);
      console.log(`[permissions] admin ${userId} removed user ${telegramId}`);
      await ctx.reply(formatUserRemoved(telegramId));
    } catch (err) {
      await ctx.reply(formatPermissionsError(err));
    }
  });

  bot.command("usergrant", async (ctx) => {
    const userId = ctx.from?.id;
    if (!access.canManageUsers(userId ?? -1)) {
      await ctx.reply("⛔ This command is available to admins only.");
      return;
    }

    const args = extractArgs(ctx.message.text);
    if (args.length < 2) {
      await ctx.reply("Usage: /usergrant <telegramId> <botId> — или /menu → Пользователи");
      return;
    }

    try {
      const telegramId = parseTelegramId(args[0]!);
      const botId = args[1]!.toLowerCase();
      if (!botStore.getRegistry().byId.has(botId)) {
        await ctx.reply(`Unknown bot id: \`${botId}\`. Add it first with /botadd.`, { parse_mode: "Markdown" });
        return;
      }
      permissionsStore.grantBot(telegramId, botId);
      await ctx.reply(formatUserGrant(telegramId, botId), { parse_mode: "Markdown" });
    } catch (err) {
      await ctx.reply(formatPermissionsError(err));
    }
  });

  bot.command("userrevoke", async (ctx) => {
    const userId = ctx.from?.id;
    if (!access.canManageUsers(userId ?? -1)) {
      await ctx.reply("⛔ This command is available to admins only.");
      return;
    }

    const args = extractArgs(ctx.message.text);
    if (args.length < 2) {
      await ctx.reply("Usage: /userrevoke <telegramId> <botId>");
      return;
    }

    try {
      const telegramId = parseTelegramId(args[0]!);
      const botId = args[1]!.toLowerCase();
      permissionsStore.revokeBot(telegramId, botId);
      await ctx.reply(formatUserRevoke(telegramId, botId), { parse_mode: "Markdown" });
    } catch (err) {
      await ctx.reply(formatPermissionsError(err));
    }
  });

  bot.command("mybots", async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const registry = botStore.getRegistry();
    const accessIds = access.getAccessibleBotIds(userId);
    const botIds = accessIds === "all" ? registry.bots.map((bot) => bot.id) : accessIds;
    await ctx.reply(
      formatMyBots(userId, access.isAdmin(userId), botIds, registry.bots.map((bot) => bot.id)),
    );
  });
}
