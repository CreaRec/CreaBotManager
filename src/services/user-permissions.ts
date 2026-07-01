import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { persistJsonFile } from "./persist-json";

const userPermissionSchema = z.object({
  telegramId: z.number().int().positive(),
  label: z.string().min(1).optional(),
  botIds: z.array(
    z
      .string()
      .min(1)
      .regex(/^[a-z0-9][a-z0-9-]*$/, "bot id must be lowercase alphanumeric with optional hyphens"),
  ),
});

const permissionsFileSchema = z.object({
  users: z.array(userPermissionSchema),
});

export type UserPermission = z.infer<typeof userPermissionSchema>;

export interface UserPermissionsIndex {
  users: UserPermission[];
  byTelegramId: Map<number, UserPermission>;
}

function buildIndex(users: UserPermission[]): UserPermissionsIndex {
  const byTelegramId = new Map<number, UserPermission>();
  for (const user of users) {
    if (byTelegramId.has(user.telegramId)) {
      throw new Error(`Duplicate telegram user id: ${user.telegramId}`);
    }
    byTelegramId.set(user.telegramId, user);
  }
  return { users, byTelegramId };
}

function parsePermissionsJson(raw: string, source: string): UserPermissionsIndex {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in user permissions config (${source})`);
  }
  return buildIndex(permissionsFileSchema.parse(parsed).users);
}

export function loadUserPermissions(configPath: string): UserPermissionsIndex {
  const absolutePath = resolve(configPath);
  let raw: string;
  try {
    raw = readFileSync(absolutePath, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read user permissions at ${absolutePath}: ${message}`);
  }
  return parsePermissionsJson(raw, absolutePath);
}

export function parseUserPermissionsJson(raw: string): UserPermissionsIndex {
  return parsePermissionsJson(raw, "inline JSON");
}

export function serializeUserPermissions(users: UserPermission[]): string {
  return `${JSON.stringify({ users }, null, 2)}\n`;
}

export class PermissionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionsError";
  }
}

export class UserPermissionsStore {
  private index: UserPermissionsIndex;
  readonly configPath: string;

  constructor(configPath: string, initial?: UserPermissionsIndex) {
    this.configPath = resolve(configPath);
    this.index = initial ?? loadUserPermissions(configPath);
  }

  getIndex(): UserPermissionsIndex {
    return this.index;
  }

  hasUser(telegramId: number): boolean {
    return this.index.byTelegramId.has(telegramId);
  }

  getUser(telegramId: number): UserPermission | undefined {
    return this.index.byTelegramId.get(telegramId);
  }

  listUsers(): UserPermission[] {
    return this.index.users;
  }

  addUser(telegramId: number, label?: string): UserPermission {
    if (!Number.isInteger(telegramId) || telegramId <= 0) {
      throw new PermissionsError(`Invalid telegram id: ${telegramId}`);
    }
    if (this.hasUser(telegramId)) {
      throw new PermissionsError(`User already exists: ${telegramId}`);
    }

    const user: UserPermission = {
      telegramId,
      ...(label?.trim() ? { label: label.trim() } : {}),
      botIds: [],
    };
    const previous = this.index;
    this.index = buildIndex([...this.index.users, user]);
    try {
      this.save();
    } catch (err) {
      this.index = previous;
      throw this.toPermissionsError(err);
    }
    return user;
  }

  removeUser(telegramId: number): UserPermission {
    const user = this.getUser(telegramId);
    if (!user) {
      throw new PermissionsError(`Unknown user: ${telegramId}`);
    }
    const previous = this.index;
    this.index = buildIndex(this.index.users.filter((entry) => entry.telegramId !== telegramId));
    try {
      this.save();
    } catch (err) {
      this.index = previous;
      throw this.toPermissionsError(err);
    }
    return user;
  }

  grantBot(telegramId: number, botId: string): UserPermission {
    const normalizedBotId = botId.trim().toLowerCase();
    const user = this.getUser(telegramId);
    if (!user) {
      throw new PermissionsError(`Unknown user: ${telegramId}`);
    }
    if (user.botIds.includes(normalizedBotId)) {
      throw new PermissionsError(`User ${telegramId} already has access to ${normalizedBotId}`);
    }

    const updated: UserPermission = {
      ...user,
      botIds: [...user.botIds, normalizedBotId].sort(),
    };
    this.replaceUser(updated);
    return updated;
  }

  revokeBot(telegramId: number, botId: string): UserPermission {
    const normalizedBotId = botId.trim().toLowerCase();
    const user = this.getUser(telegramId);
    if (!user) {
      throw new PermissionsError(`Unknown user: ${telegramId}`);
    }
    if (!user.botIds.includes(normalizedBotId)) {
      throw new PermissionsError(`User ${telegramId} does not have access to ${normalizedBotId}`);
    }

    const updated: UserPermission = {
      ...user,
      botIds: user.botIds.filter((id) => id !== normalizedBotId),
    };
    this.replaceUser(updated);
    return updated;
  }

  removeBotFromAllUsers(botId: string): void {
    const normalizedBotId = botId.trim().toLowerCase();
    const users = this.index.users.map((user) => ({
      ...user,
      botIds: user.botIds.filter((id) => id !== normalizedBotId),
    }));
    const previous = this.index;
    this.index = buildIndex(users);
    try {
      this.save();
    } catch (err) {
      this.index = previous;
      throw this.toPermissionsError(err);
    }
  }

  private replaceUser(user: UserPermission): void {
    const previous = this.index;
    this.index = buildIndex(this.index.users.map((entry) => (entry.telegramId === user.telegramId ? user : entry)));
    try {
      this.save();
    } catch (err) {
      this.index = previous;
      throw this.toPermissionsError(err);
    }
  }

  private save(): void {
    persistJsonFile(this.configPath, serializeUserPermissions(this.index.users), "user permissions");
  }

  private toPermissionsError(err: unknown): PermissionsError {
    if (err instanceof PermissionsError) return err;
    const message = err instanceof Error ? err.message : String(err);
    return new PermissionsError(message);
  }
}
