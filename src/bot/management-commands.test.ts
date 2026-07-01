import { describe, expect, it, vi } from "vitest";
import { AccessControl } from "../services/access-control";
import { parseBotRegistryJson } from "../services/bot-registry";
import { UserPermissionsStore, parseUserPermissionsJson } from "../services/user-permissions";
import { registerManagementCommands } from "./management-commands";

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

  it("denies botadd for non-admin", async () => {
    const handlers = new Map<string, (ctx: unknown) => Promise<void>>();
    registerManagementCommands(
      { command: (n, fn) => handlers.set(n, fn) } as never,
      { listStatuses: vi.fn() } as never,
      store as never,
      permissionsStore,
      access,
    );

    const ctx = {
      from: { id: 222 },
      message: { text: "/botadd x y" },
      reply: vi.fn().mockResolvedValue(undefined),
    };
    await handlers.get("botadd")!(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("admins only"));
  });

  it("denies service control without bot access", async () => {
    const handlers = new Map<string, (ctx: unknown) => Promise<void>>();
    registerManagementCommands(
      { command: (n, fn) => handlers.set(n, fn) } as never,
      { runAction: vi.fn(), listStatuses: vi.fn() } as never,
      store as never,
      permissionsStore,
      access,
    );

    const ctx = {
      from: { id: 222 },
      message: { text: "/botstart weather" },
      reply: vi.fn().mockResolvedValue(undefined),
    };
    await handlers.get("botstart")!(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("No access"), { parse_mode: "Markdown" });
  });

  it("allows operator to start assigned bot", async () => {
    const handlers = new Map<string, (ctx: unknown) => Promise<void>>();
    const runAction = vi.fn().mockResolvedValue({
      bot: registry.bots[0],
      action: "start",
      command: { stdout: "ok", stderr: "", exitCode: 0 },
      success: true,
    });
    registerManagementCommands(
      { command: (n, fn) => handlers.set(n, fn) } as never,
      { runAction, listStatuses: vi.fn() } as never,
      store as never,
      permissionsStore,
      access,
    );

    const ctx = {
      from: { id: 222 },
      message: { text: "/botstart trip-planner" },
      reply: vi.fn().mockResolvedValue(undefined),
    };
    await handlers.get("botstart")!(ctx);
    expect(runAction).toHaveBeenCalledWith("trip-planner", "start");
  });
});
