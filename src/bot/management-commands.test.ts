import { describe, expect, it, vi } from "vitest";
import { parseBotRegistryJson } from "../services/bot-registry";
import { registerManagementCommands } from "./management-commands";

describe("management-commands", () => {
  const registry = parseBotRegistryJson(
    JSON.stringify({
      bots: [{ id: "trip-planner", name: "Trip Planner", serviceName: "telegram-trip-planner" }],
    }),
  );

  it("registers handlers and reports unknown ids", async () => {
    const commandHandlers = new Map<string, (ctx: unknown) => Promise<void>>();
    const bot = {
      command: (name: string, fn: (ctx: unknown) => Promise<void>) => {
        commandHandlers.set(name, fn);
      },
    };

    const manager = {
      listStatuses: vi.fn().mockResolvedValue([
        { bot: registry.bots[0], state: "active", raw: "active" },
      ]),
      runAction: vi.fn().mockResolvedValue(undefined),
      getDetailedStatus: vi.fn(),
      getLogs: vi.fn(),
    };

    registerManagementCommands(bot as never, manager as never, registry);

    const ctx = {
      message: { text: "/botstart missing" },
      reply: vi.fn().mockResolvedValue(undefined),
    };
    await commandHandlers.get("botstart")!(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Unknown bot id"), {
      parse_mode: "Markdown",
    });
  });
});
