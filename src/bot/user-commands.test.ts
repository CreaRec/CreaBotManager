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
          bots: [
            {
              id: "trip-planner",
              name: "Trip",
              composeProject: "crea-trip-planner",
              composeService: "bot",
            },
          ],
        }),
      ),
  };
  const permissionsStore = new UserPermissionsStore(
    "config/user-permissions.json",
    parseUserPermissionsJson(JSON.stringify({ users: [] })),
  );
  const access = new AccessControl([111], permissionsStore);
  const deps = {
    manager: {} as never,
    botStore: botStore as never,
    permissionsStore,
    access,
    adminIds: [111],
  };

  it("/users opens interactive user list for admin", async () => {
    const handlers = new Map<string, (ctx: unknown) => Promise<void>>();
    registerUserCommands({ command: (n, fn) => handlers.set(n, fn) } as never, deps);

    const ctx = {
      from: { id: 111 },
      reply: vi.fn().mockResolvedValue(undefined),
      editMessageText: vi.fn().mockResolvedValue(undefined),
    };
    await handlers.get("users")!(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("Пользователи"),
      expect.objectContaining({ reply_markup: expect.any(Object) }),
    );
  });
});
