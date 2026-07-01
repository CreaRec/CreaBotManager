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
    allowedTelegramIds: [111],
    botHandlerTimeoutMs: 180_000,
    managedBotsConfigPath: "config/managed-bots.json",
    systemctlPath: "/bin/systemctl",
    journalctlPath: "/bin/journalctl",
    useSudoForSystemctl: true,
  },
}));

vi.mock("../services/bot-registry", () => ({
  loadBotRegistry: () => ({
    bots: [{ id: "trip-planner", name: "Trip Planner", serviceName: "telegram-trip-planner" }],
    byId: new Map([["trip-planner", { id: "trip-planner", name: "Trip Planner", serviceName: "telegram-trip-planner" }]]),
    byServiceName: new Map([["telegram-trip-planner", { id: "trip-planner", name: "Trip Planner", serviceName: "telegram-trip-planner" }]]),
  }),
}));

vi.mock("../services/systemd", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/systemd")>();
  return {
    ...actual,
    runSystemctl: runSystemctlMock,
    fetchServiceLogs: vi.fn(),
  };
});

import { createBot } from "./bot";

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
  beforeEach(() => {
    vi.clearAllMocks();
    runSystemctlMock.mockResolvedValue({ stdout: "active", stderr: "", exitCode: 0 });
  });

  it("registers management commands", () => {
    const bot = createBot() as unknown as InstanceType<typeof FakeTelegraf>;
    expect(bot.handlers.start).toBeTypeOf("function");
    expect(bot.handlers.command.has("bots")).toBe(true);
    expect(bot.handlers.command.has("botstart")).toBe(true);
    expect(bot.handlers.command.has("botrestart")).toBe(true);
  });

  it("rejects unauthorized users", async () => {
    const bot = createBot() as unknown as InstanceType<typeof FakeTelegraf>;
    const ctx = makeCtx({ from: { id: 999 } });
    await runMiddleware(bot, ctx);
    expect(ctx.reply).toHaveBeenCalledWith("Sorry, you are not authorized to use this bot.");
  });

  it("replies to /start with manager help", async () => {
    const bot = createBot() as unknown as InstanceType<typeof FakeTelegraf>;
    const ctx = makeCtx();
    await bot.handlers.start!(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("CreaBotManager"));
  });

  it("lists bots via /bots", async () => {
    const bot = createBot() as unknown as InstanceType<typeof FakeTelegraf>;
    const ctx = makeCtx();
    await bot.handlers.command.get("bots")!(ctx);
    expect(runSystemctlMock).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Trip Planner"), { parse_mode: "Markdown" });
  });

  it("starts a bot via /botstart", async () => {
    const bot = createBot() as unknown as InstanceType<typeof FakeTelegraf>;
    const ctx = makeCtx({ message: { text: "/botstart trip-planner" } });
    runSystemctlMock.mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });
    await bot.handlers.command.get("botstart")!(ctx);
    expect(runSystemctlMock).toHaveBeenCalledWith(
      expect.objectContaining({ systemctlPath: "/bin/systemctl" }),
      "start",
      "telegram-trip-planner",
    );
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("start"), { parse_mode: "Markdown" });
  });

  it("replies to plain text with help hint", async () => {
    const bot = createBot() as unknown as InstanceType<typeof FakeTelegraf>;
    const ctx = makeCtx({ message: { text: "hello" } });
    const textHandler = bot.handlers.on.find((h) => h.filter === "text-filter")!.fn;
    await textHandler(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("/help"));
  });
});
