import { beforeEach, describe, expect, it, vi } from "vitest";

const { FakeTelegraf, runSystemctlMock } = vi.hoisted(() => {
  class FakeTelegraf {
    handlers: {
      use: Array<(ctx: unknown, next: () => unknown) => unknown>;
      start?: (ctx: unknown) => unknown;
      help?: (ctx: unknown) => unknown;
      command: Map<string, (ctx: unknown) => unknown>;
      on: Array<{ filter: unknown; fn: (ctx: unknown) => unknown }>;
    } = { use: [], command: new Map(), on: [] };
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
    on(filter: unknown, fn: (ctx: unknown) => unknown) {
      this.handlers.on.push({ filter, fn });
    }
    launch() {
      return new Promise(() => {});
    }
    stop() {}
  }
  return { FakeTelegraf, runSystemctlMock: vi.fn() };
});

vi.mock("telegraf", () => ({ Telegraf: FakeTelegraf }));
vi.mock("telegraf/filters", () => ({ message: (kind: string) => `${kind}-filter` }));
vi.mock("../config", () => ({
  config: {
    telegramBotToken: "test-token",
    adminTelegramIds: [111],
    botHandlerTimeoutMs: 180_000,
    managedBotsConfigPath: "data/managed-bots.json",
    userPermissionsConfigPath: "data/user-permissions.json",
    systemctlPath: "/bin/systemctl",
    journalctlPath: "/bin/journalctl",
    useSudoForSystemctl: true,
  },
}));

const mockBotStore = {
  getRegistry: () => ({
    bots: [{ id: "trip-planner", name: "Trip Planner", serviceName: "telegram-trip-planner" }],
    byId: new Map([["trip-planner", { id: "trip-planner", name: "Trip Planner", serviceName: "telegram-trip-planner" }]]),
    byServiceName: new Map(),
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

vi.mock("../services/systemd", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/systemd")>();
  return {
    ...actual,
    runSystemctl: runSystemctlMock,
    fetchServiceLogs: vi.fn(),
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
    runSystemctlMock.mockResolvedValue({ stdout: "active", stderr: "", exitCode: 0 });
  });

  it("registers user and management commands", () => {
    const runtime = createBot(mockBotStore as never, mockPermissionsStore as never, access);
    const bot = runtime.bot as unknown as InstanceType<typeof FakeTelegraf>;
    expect(bot.handlers.command.has("users")).toBe(true);
    expect(bot.handlers.command.has("usergrant")).toBe(true);
    expect(bot.handlers.command.has("mybots")).toBe(true);
    expect(bot.handlers.command.has("botadd")).toBe(true);
  });

  it("rejects unauthorized users when access control is configured", async () => {
    const runtime = createBot(mockBotStore as never, mockPermissionsStore as never, access);
    const bot = runtime.bot as unknown as InstanceType<typeof FakeTelegraf>;
    const ctx = makeCtx({ from: { id: 999 } });
    await runMiddleware(bot, ctx);
    expect(ctx.reply).toHaveBeenCalledWith("Sorry, you are not authorized to use this bot.");
  });

  it("shows admin commands in /start for admins", async () => {
    const runtime = createBot(mockBotStore as never, mockPermissionsStore as never, access);
    const bot = runtime.bot as unknown as InstanceType<typeof FakeTelegraf>;
    const ctx = makeCtx();
    await bot.handlers.start!(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("/usergrant"));
  });

  it("replies to unknown slash commands", async () => {
    const runtime = createBot(mockBotStore as never, mockPermissionsStore as never, access);
    const bot = runtime.bot as unknown as InstanceType<typeof FakeTelegraf>;
    const ctx = makeCtx({ message: { text: "/unknowncmd" } });
    const textHandler = bot.handlers.on.find((h) => h.filter === "text-filter")!.fn;
    await textHandler(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Неизвестная команда"));
  });
});
