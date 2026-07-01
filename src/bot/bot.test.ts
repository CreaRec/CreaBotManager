import { beforeEach, describe, expect, it, vi } from "vitest";

const { FakeTelegraf } = vi.hoisted(() => {
  class FakeTelegraf {
    handlers: {
      use: Array<(ctx: unknown, next: () => unknown) => unknown>;
      start?: (ctx: unknown) => unknown;
      help?: (ctx: unknown) => unknown;
      on: Array<{ filter: unknown; fn: (ctx: unknown) => unknown }>;
    } = { use: [], on: [] };
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
    on(filter: unknown, fn: (ctx: unknown) => unknown) {
      this.handlers.on.push({ filter, fn });
    }
    launch() {
      return new Promise(() => {});
    }
    stop() {}
  }
  return { FakeTelegraf };
});

vi.mock("telegraf", () => ({ Telegraf: FakeTelegraf }));
vi.mock("telegraf/filters", () => ({ message: (kind: string) => `${kind}-filter` }));
vi.mock("../config", () => ({
  config: { telegramBotToken: "test-token", allowedTelegramIds: [111], botHandlerTimeoutMs: 180_000 },
}));

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

async function runMiddleware(bot: FakeTelegraf, ctx: FakeCtx): Promise<void> {
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
  });

  it("registers start and help handlers", () => {
    const bot = createBot() as unknown as InstanceType<typeof FakeTelegraf>;
    expect(bot.handlers.start).toBeTypeOf("function");
    expect(bot.handlers.help).toBeTypeOf("function");
    expect(bot.handlers.on).toHaveLength(1);
  });

  it("rejects unauthorized users", async () => {
    const bot = createBot() as unknown as InstanceType<typeof FakeTelegraf>;
    const ctx = makeCtx({ from: { id: 999 } });
    await runMiddleware(bot, ctx);
    expect(ctx.reply).toHaveBeenCalledWith("Sorry, you are not authorized to use this bot.");
  });

  it("replies to /start", async () => {
    const bot = createBot() as unknown as InstanceType<typeof FakeTelegraf>;
    const ctx = makeCtx();
    await bot.handlers.start!(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("template"));
  });

  it("replies to plain text", async () => {
    const bot = createBot() as unknown as InstanceType<typeof FakeTelegraf>;
    const ctx = makeCtx({ message: { text: "hello" } });
    const textHandler = bot.handlers.on.find((h) => h.filter === "text-filter")!.fn;
    await textHandler(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Bot template is running"));
  });
});
