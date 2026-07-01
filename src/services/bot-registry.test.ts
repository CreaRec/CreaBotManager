import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BotRegistryStore,
  RegistryError,
  parseBotRegistryJson,
  parseManagedBot,
  serializeRegistry,
} from "./bot-registry";

describe("bot-registry", () => {
  it("parses registry file shape", () => {
    const registry = parseBotRegistryJson(
      JSON.stringify({
        bots: [{ id: "trip-planner", name: "Trip Planner", serviceName: "telegram-trip-planner" }],
      }),
    );
    expect(registry.bots).toHaveLength(1);
    expect(registry.byId.get("trip-planner")?.serviceName).toBe("telegram-trip-planner");
  });

  it("parses bare array shape", () => {
    const registry = parseBotRegistryJson(
      JSON.stringify([{ id: "weather", name: "Weather", serviceName: "telegram-weather" }]),
    );
    expect(registry.byServiceName.get("telegram-weather")?.id).toBe("weather");
  });

  it("rejects duplicate ids", () => {
    expect(() =>
      parseBotRegistryJson(
        JSON.stringify({
          bots: [
            { id: "a", name: "A", serviceName: "svc-a" },
            { id: "a", name: "B", serviceName: "svc-b" },
          ],
        }),
      ),
    ).toThrow(/Duplicate managed bot id/);
  });

  it("rejects invalid service names", () => {
    expect(() =>
      parseBotRegistryJson(
        JSON.stringify({
          bots: [{ id: "bad", name: "Bad", serviceName: "svc;rm -rf" }],
        }),
      ),
    ).toThrow();
  });

  it("allows empty registry", () => {
    const registry = parseBotRegistryJson(JSON.stringify({ bots: [] }));
    expect(registry.bots).toHaveLength(0);
  });

  it("normalizes bot ids to lowercase", () => {
    const bot = parseManagedBot({ id: "Trip-Planner", name: "Trip", serviceName: "telegram-trip" });
    expect(bot.id).toBe("trip-planner");
  });

  it("serializes registry as JSON file", () => {
    const json = serializeRegistry([{ id: "a", name: "A", serviceName: "svc-a" }]);
    expect(JSON.parse(json)).toEqual({
      bots: [{ id: "a", name: "A", serviceName: "svc-a" }],
    });
  });
});

describe("BotRegistryStore", () => {
  function withTempStore(initial = { bots: [] as Array<{ id: string; name: string; serviceName: string }> }) {
    const dir = mkdtempSync(join(tmpdir(), "bot-registry-"));
    const configPath = join(dir, "managed-bots.json");
    const store = new BotRegistryStore(configPath, parseBotRegistryJson(JSON.stringify(initial)));
    return {
      store,
      configPath,
      cleanup: () => rmSync(dir, { recursive: true, force: true }),
    };
  }

  it("adds and persists a bot", () => {
    const { store, configPath, cleanup } = withTempStore();
    try {
      const bot = store.addBot({
        id: "trip-planner",
        name: "Trip Planner",
        serviceName: "telegram-trip-planner",
      });
      expect(bot.id).toBe("trip-planner");
      expect(store.getRegistry().bots).toHaveLength(1);

      const saved = JSON.parse(readFileSync(configPath, "utf8"));
      expect(saved.bots[0].serviceName).toBe("telegram-trip-planner");
    } finally {
      cleanup();
    }
  });

  it("removes a bot and persists changes", () => {
    const { store, configPath, cleanup } = withTempStore({
      bots: [{ id: "weather", name: "Weather", serviceName: "telegram-weather" }],
    });
    try {
      store.removeBot("weather");
      expect(store.getRegistry().bots).toHaveLength(0);
      expect(JSON.parse(readFileSync(configPath, "utf8")).bots).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("rejects duplicate ids on add", () => {
    const { store, cleanup } = withTempStore({
      bots: [{ id: "a", name: "A", serviceName: "svc-a" }],
    });
    try {
      expect(() => store.addBot({ id: "a", name: "B", serviceName: "svc-b" })).toThrow(RegistryError);
    } finally {
      cleanup();
    }
  });

  it("rejects unknown id on remove", () => {
    const { store, cleanup } = withTempStore();
    try {
      expect(() => store.removeBot("missing")).toThrow(RegistryError);
    } finally {
      cleanup();
    }
  });
});
