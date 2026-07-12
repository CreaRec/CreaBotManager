import { beforeEach, describe, expect, it, vi } from "vitest";

const { FakeTelegraf, listComposeContainersMock } = vi.hoisted(() => {
  class FakeTelegraf {
    handlers: {
      use: Array<(ctx: unknown, next: () => unknown) => unknown>;
      start?: (ctx: unknown) => unknown;
      help?: (ctx: unknown) => unknown;
      command: Map<string, (ctx: unknown) => unknown>;
      action: Array<{ pattern: RegExp | string; fn: (ctx: unknown) => unknown }>;
      on: Array<{ filter: unknown; fn: (ctx: unknown) => unknown }>;
    } = { use: [], command: new Map(), action: [], on: [] };
    constructor(
      public token: string,
      public options?: unknown,
    ) {}
    catch(_fn: unknown) {}
    use(fn: (ctx: unknown, next: () => unknown) => unknown) {
      this.handlers.use.push(fn);
    }
    start(fn: (ctx: unknown) => unknown) {
      this.handlers.start = fn;
    }
    help(fn: (ctx: unknown) => unknown) {
      this.handlers.help = fn;
    }
    command(name: string, fn: (ctx: unknown) => unknown) {
      this.handlers.command.set(name, fn);
    }
    action(pattern: RegExp | string, fn: (ctx: unknown) => unknown) {
      this.handlers.action.push({ pattern, fn });
    }
    on(filter: unknown, fn: (ctx: unknown) => unknown) {
      this.handlers.on.push({ filter, fn });
    }
    launch() {
      return new Promise(() => {});
    }
    stop() {}
  }
  return { FakeTelegraf, listComposeContainersMock: vi.fn() };
});

vi.mock("telegraf", () => ({
  Telegraf: FakeTelegraf,
  Markup: {
    button: { callback: (t: string, d: string) => ({ text: t, callback_data: d }) },
    inlineKeyboard: (r: unknown) => ({ reply_markup: { inline_keyboard: r } }),
    keyboard: (rows: unknown) => ({
      resize: () => ({
        persistent: () => ({
          reply_markup: { keyboard: rows, resize_keyboard: true, is_persistent: true },
        }),
      }),
    }),
  },
}));
vi.mock("telegraf/filters", () => ({ message: (kind: string) => `${kind}-filter` }));
vi.mock("../config", () => ({
  config: {
    telegramBotToken: "test-token",
    adminTelegramIds: [111],
    botHandlerTimeoutMs: 180_000,
    managedBotsConfigPath: "data/managed-bots.json",
    userPermissionsConfigPath: "data/user-permissions.json",
    dockerPath: "/usr/bin/docker",
  },
}));

const tripBot = {
  id: "trip-planner",
  name: "Trip Planner",
  composeProject: "crea-trip-planner",
  composeService: "bot",
};

const mockBotStore = {
  getRegistry: () => ({
    bots: [tripBot],
    byId: new Map([["trip-planner", tripBot]]),
    byComposeTarget: new Map([["crea-trip-planner/bot", tripBot]]),
  }),
};

const mockPermissionsStore = {
  listUsers: () => [{ telegramId: 222, botIds: ["trip-planner"] }],
  hasUser: (id: number) => id === 222,
  getUser: (id: number) => (id === 222 ? { telegramId: 222, botIds: ["trip-planner"] } : undefined),
  addUser: vi.fn(),
  removeUser: vi.fn(),
  grantBot: vi.fn(),
  revokeBot: vi.fn(),
  removeBotFromAllUsers: vi.fn(),
};

vi.mock("../services/docker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/docker")>();
  return {
    ...actual,
    listComposeContainers: listComposeContainersMock,
    runContainerAction: vi.fn(),
    fetchContainerLogs: vi.fn(),
    inspectContainer: vi.fn(),
  };
});

import { createBot } from "./bot";
import { AccessControl } from "../services/access-control";

interface FakeCtx {
  from?: { id: number };
  message?: { text: string };
  reply: ReturnType<typeof vi.fn>;
}

function makeCtx(overrides: Partial<FakeCtx> = {}): FakeCtx {
  return {
    from: { id: 111 },
    reply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function runMiddleware(bot: InstanceType<typeof FakeTelegraf>, ctx: FakeCtx): Promise<void> {
  for (const mw of bot.handlers.use) {
    let called = false;
    await mw(ctx, () => {
      called = true;
    });
    if (!called) return;
  }
}

describe("createBot", () => {
  const access = new AccessControl([111], mockPermissionsStore as never);

  beforeEach(() => {
    vi.clearAllMocks();
    listComposeContainersMock.mockResolvedValue({
      containers: [{ id: "1", name: "bot", status: "Up", state: "running" }],
      command: { stdout: "", stderr: "", exitCode: 0 },
    });
  });

  it("registers menu action handlers", () => {
    const runtime = createBot(mockBotStore as never, mockPermissionsStore as never, access);
    const bot = runtime.bot as unknown as InstanceType<typeof FakeTelegraf>;
    expect(bot.handlers.action.length).toBeGreaterThan(5);
    expect(bot.handlers.command.has("menu")).toBe(true);
  });

  it("/start shows welcome with reply keyboard", async () => {
    const runtime = createBot(mockBotStore as never, mockPermissionsStore as never, access);
    const bot = runtime.bot as unknown as InstanceType<typeof FakeTelegraf>;
    const ctx = makeCtx();
    await bot.handlers.start!(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("CreaBotManager"),
      expect.objectContaining({
        reply_markup: expect.objectContaining({ keyboard: expect.any(Array) }),
      }),
    );
  });

  it("reply keyboard label opens bot list", async () => {
    const runtime = createBot(mockBotStore as never, mockPermissionsStore as never, access);
    const bot = runtime.bot as unknown as InstanceType<typeof FakeTelegraf>;
    const ctx = makeCtx({ message: { text: "📋 Боты" } });
    const textHandler = bot.handlers.on.find((h) => h.filter === "text-filter")!.fn;
    await textHandler(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("Выберите бота"),
      expect.objectContaining({ reply_markup: expect.any(Object) }),
    );
  });

  it("rejects unauthorized users", async () => {
    const runtime = createBot(mockBotStore as never, mockPermissionsStore as never, access);
    const bot = runtime.bot as unknown as InstanceType<typeof FakeTelegraf>;
    const ctx = makeCtx({ from: { id: 999 } });
    await runMiddleware(bot, ctx);
    expect(ctx.reply).toHaveBeenCalledWith("Sorry, you are not authorized to use this bot.");
  });
});
