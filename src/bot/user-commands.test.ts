import { describe, expect, it, vi } from "vitest";
import { AccessControl } from "../services/access-control";
import { parseBotRegistryJson } from "../services/bot-registry";
import { UserPermissionsStore, parseUserPermissionsJson } from "../services/user-permissions";
import { registerUserCommands } from "./user-commands";

describe("user-commands", () => {
  const botStore = {
    getRegistry: () =>
      parseBotRegistryJson(
        JSON.stringify({
          bots: [{ id: "trip-planner", name: "Trip", serviceName: "telegram-trip-planner" }],
        }),
      ),
  };
  const permissionsStore = new UserPermissionsStore(
    "config/user-permissions.json",
    parseUserPermissionsJson(JSON.stringify({ users: [] })),
  );
  const access = new AccessControl([111], permissionsStore);

  it("blocks non-admin from /users", async () => {
    const handlers = new Map<string, (ctx: unknown) => Promise<void>>();
    registerUserCommands({ command: (n, fn) => handlers.set(n, fn) } as never, access, permissionsStore, botStore as never, [111]);

    const ctx = { from: { id: 222 }, message: { text: "/users" }, reply: vi.fn().mockResolvedValue(undefined) };
    await handlers.get("users")!(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("admins only"));
  });

  it("grants bot access for admin", async () => {
    const handlers = new Map<string, (ctx: unknown) => Promise<void>>();
    const store = new UserPermissionsStore(
      "config/user-permissions.json",
      parseUserPermissionsJson(JSON.stringify({ users: [{ telegramId: 222, botIds: [] }] })),
    );
    const grantSpy = vi.spyOn(store, "grantBot");

    registerUserCommands({ command: (n, fn) => handlers.set(n, fn) } as never, access, store, botStore as never, [111]);

    const ctx = {
      from: { id: 111 },
      message: { text: "/usergrant 222 trip-planner" },
      reply: vi.fn().mockResolvedValue(undefined),
    };
    await handlers.get("usergrant")!(ctx);

    expect(grantSpy).toHaveBeenCalledWith(222, "trip-planner");
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Granted"), { parse_mode: "Markdown" });
  });
});
