import type { BotStatus } from "./bot-manager";
import type { UserPermissionsStore } from "./user-permissions";

export class AccessControl {
  constructor(
    private readonly adminIds: number[],
    private readonly permissionsStore: UserPermissionsStore,
  ) {}

  isOpenMode(): boolean {
    return this.adminIds.length === 0 && this.permissionsStore.listUsers().length === 0;
  }

  isAdmin(userId: number): boolean {
    return this.adminIds.includes(userId);
  }

  isKnownUser(userId: number): boolean {
    return this.isAdmin(userId) || this.permissionsStore.hasUser(userId);
  }

  canAccessBot(userId: number, botId: string): boolean {
    if (this.isOpenMode() || this.isAdmin(userId)) return true;
    const user = this.permissionsStore.getUser(userId);
    if (!user) return false;
    return user.botIds.includes(botId.trim().toLowerCase());
  }

  canManageUsers(userId: number): boolean {
    return this.isAdmin(userId);
  }

  canManageRegistry(userId: number): boolean {
    return this.isAdmin(userId);
  }

  getAccessibleBotIds(userId: number): string[] | "all" {
    if (this.isOpenMode() || this.isAdmin(userId)) return "all";
    return this.permissionsStore.getUser(userId)?.botIds ?? [];
  }

  filterStatuses(userId: number, statuses: BotStatus[]): BotStatus[] {
    const access = this.getAccessibleBotIds(userId);
    if (access === "all") return statuses;
    const allowed = new Set(access);
    return statuses.filter((status) => allowed.has(status.bot.id));
  }
}

export function formatAccessDenied(botId: string): string {
  return `⛔ No access to bot \`${botId}\`. Ask an admin to run /usergrant.`;
}

export function formatAdminOnly(): string {
  return "⛔ This command is available to admins only.";
}

export function formatUserList(
  adminIds: number[],
  users: ReturnType<UserPermissionsStore["listUsers"]>,
): string {
  const lines = ["Users and bot access:", ""];
  if (adminIds.length === 0) {
    lines.push("Admins: (none in ADMIN_TELEGRAM_IDS)");
  } else {
    lines.push("Admins (full access):");
    for (const id of adminIds) {
      lines.push(`👑 ${id}`);
    }
  }

  if (users.length === 0) {
    lines.push("", "Operators: (none)");
  } else {
    lines.push("", "Operators:");
    for (const user of users) {
      const label = user.label ? ` ${user.label}` : "";
      const bots = user.botIds.length > 0 ? user.botIds.join(", ") : "(no bots)";
      lines.push(`• ${user.telegramId}${label} — ${bots}`);
    }
  }

  lines.push(
    "",
    "Admin commands:",
    "/useradd <telegramId> [label]",
    "/userremove <telegramId>",
    "/usergrant <telegramId> <botId>",
    "/userrevoke <telegramId> <botId>",
  );
  return lines.join("\n");
}

export function formatMyBots(
  userId: number,
  isAdmin: boolean,
  botIds: string[],
  allBotIds: string[],
): string {
  if (isAdmin) {
    return ["You are an admin with access to all bots.", `Registered bots: ${allBotIds.join(", ") || "(none)"}`].join(
      "\n",
    );
  }
  if (botIds.length === 0) {
    return "You have no assigned bots yet. Ask an admin to run /usergrant.";
  }
  return ["Your bots:", botIds.join(", ")].join("\n");
}

export function formatUserAdded(telegramId: number, label?: string): string {
  const suffix = label ? ` (${label})` : "";
  return `✅ User added: ${telegramId}${suffix}\nGrant bots: /usergrant ${telegramId} <botId>`;
}

export function formatUserRemoved(telegramId: number): string {
  return `✅ User removed: ${telegramId}`;
}

export function formatUserGrant(telegramId: number, botId: string): string {
  return `✅ Granted \`${botId}\` to user ${telegramId}`;
}

export function formatUserRevoke(telegramId: number, botId: string): string {
  return `✅ Revoked \`${botId}\` from user ${telegramId}`;
}
