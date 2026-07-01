import { describe, expect, it, vi } from "vitest";
import { AccessControl } from "../services/access-control";
import { parseBotRegistryJson } from "../services/bot-registry";
import { UserPermissionsStore, parseUserPermissionsJson } from "../services/user-permissions";
import { registerManagementCommands } from "./management-commands";
import { showBotList } from "./menu-handlers";

describe("management-commands", () => {
  const registry = parseBotRegistryJson(
    JSON.stringify({
      bots: [{ id: "trip-planner", name: "Trip Planner", serviceName: "telegram-trip-planner" }],
    }),
  );
  const store = {
    getRegistry: () => registry,
    addBot: vi.fn(),
    removeBot: vi.fn(),
  };
  const permissionsStore = new UserPermissionsStore(
    "config/user-permissions.json",
    parseUserPermissionsJson(JSON.stringify({ users: [{ telegramId: 222, botIds: ["trip-planner"] }] })),
  );
  const access = new AccessControl([111], permissionsStore);
  const manager = {
    listStatuses: vi.fn().mockResolvedValue([
      { bot: registry.bots[0], state: "active", raw: "active" },
    ]),
    runAction: vi.fn(),
  };

  const deps = {
    manager: manager as never,
    botStore: store as never,
    permissionsStore,
    access,
    adminIds: [111],
  };

  it("/bots opens interactive bot list", async () => {
    const handlers = new Map<string, (ctx: unknown) => Promise<void>>();
    registerManagementCommands({ command: (n, fn) => handlers.set(n, fn) } as never, deps);

    const ctx = {
      from: { id: 111 },
      reply: vi.fn().mockResolvedValue(undefined),
    };
    await handlers.get("bots")!(ctx);
    expect(manager.listStatuses).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("Выберите бота"),
      expect.objectContaining({ reply_markup: expect.any(Object) }),
    );
  });

  it("denies botadd for non-admin", async () => {
    const handlers = new Map<string, (ctx: unknown) => Promise<void>>();
    registerManagementCommands({ command: (n, fn) => handlers.set(n, fn) } as never, deps);

    const ctx = {
      from: { id: 222 },
      message: { text: "/botadd x y" },
      reply: vi.fn().mockResolvedValue(undefined),
    };
    await handlers.get("botadd")!(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("admins only"));
  });
});

describe("showBotList", () => {
  it("shows empty message for operator without bots", async () => {
    const permissionsStore = new UserPermissionsStore(
      "config/user-permissions.json",
      parseUserPermissionsJson(JSON.stringify({ users: [{ telegramId: 222, botIds: [] }] })),
    );
    const access = new AccessControl([111], permissionsStore);
    const ctx = {
      from: { id: 222 },
      reply: vi.fn().mockResolvedValue(undefined),
    };
    await showBotList(ctx, {
      manager: { listStatuses: vi.fn().mockResolvedValue([]) } as never,
      botStore: { getRegistry: () => ({ bots: [] }) } as never,
      permissionsStore,
      access,
      adminIds: [111],
    });
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("не назначено"), expect.any(Object));
  });
});
