import { describe, expect, it, vi } from "vitest";
import { BotRegistryStore, parseBotRegistryJson } from "../services/bot-registry";
import { registerManagementCommands } from "./management-commands";

describe("management-commands", () => {
  const registry = parseBotRegistryJson(
    JSON.stringify({
      bots: [{ id: "trip-planner", name: "Trip Planner", serviceName: "telegram-trip-planner" }],
    }),
  );
  const store = new BotRegistryStore("config/managed-bots.json", registry);

  it("registers handlers and reports unknown ids", async () => {
    const commandHandlers = new Map<string, (ctx: unknown) => Promise<void>>();
    const bot = {
      command: (name: string, fn: (ctx: unknown) => Promise<void>) => {
        commandHandlers.set(name, fn);
      },
    };

    const manager = {
      listStatuses: vi.fn().mockResolvedValue([{ bot: registry.bots[0], state: "active", raw: "active" }]),
      runAction: vi.fn().mockResolvedValue(undefined),
      getDetailedStatus: vi.fn(),
      getLogs: vi.fn(),
    };

    registerManagementCommands(bot as never, manager as never, store);

    const ctx = {
      message: { text: "/botstart missing" },
      reply: vi.fn().mockResolvedValue(undefined),
    };
    await commandHandlers.get("botstart")!(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Unknown bot id"), {
      parse_mode: "Markdown",
    });
  });

  it("adds a bot via /botadd", async () => {
    const emptyRegistry = parseBotRegistryJson(JSON.stringify({ bots: [] }));
    const mutableStore = new BotRegistryStore("config/managed-bots.json", emptyRegistry);
    const commandHandlers = new Map<string, (ctx: unknown) => Promise<void>>();
    const bot = {
      command: (name: string, fn: (ctx: unknown) => Promise<void>) => {
        commandHandlers.set(name, fn);
      },
    };

    const addSpy = vi.spyOn(mutableStore, "addBot").mockReturnValue({
      id: "weather",
      name: "Weather Bot",
      serviceName: "telegram-weather",
    });

    registerManagementCommands(bot as never, { listStatuses: vi.fn() } as never, mutableStore);

    const ctx = {
      message: { text: "/botadd weather telegram-weather Weather Bot" },
      reply: vi.fn().mockResolvedValue(undefined),
    };
    await commandHandlers.get("botadd")!(ctx);

    expect(addSpy).toHaveBeenCalledWith({
      id: "weather",
      serviceName: "telegram-weather",
      name: "Weather Bot",
    });
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Bot registered"), {
      parse_mode: "Markdown",
    });
  });

  it("removes a bot via /botremove", async () => {
    const commandHandlers = new Map<string, (ctx: unknown) => Promise<void>>();
    const bot = {
      command: (name: string, fn: (ctx: unknown) => Promise<void>) => {
        commandHandlers.set(name, fn);
      },
    };

    const removeSpy = vi.spyOn(store, "removeBot").mockReturnValue(registry.bots[0]!);

    registerManagementCommands(bot as never, { listStatuses: vi.fn() } as never, store);

    const ctx = {
      message: { text: "/botremove trip-planner" },
      reply: vi.fn().mockResolvedValue(undefined),
    };
    await commandHandlers.get("botremove")!(ctx);

    expect(removeSpy).toHaveBeenCalledWith("trip-planner");
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Bot removed"), {
      parse_mode: "Markdown",
    });
  });
});
