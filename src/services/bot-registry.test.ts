import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BotRegistryStore,
  RegistryError,
  parseBotRegistryJson,
  parseManagedBot,
  serializeRegistry,
} from "./bot-registry";

describe("bot-registry", () => {
  it("loads object and array forms", () => {
    const registry = parseBotRegistryJson(
      JSON.stringify({
        bots: [
          {
            id: "trip-planner",
            name: "Trip Planner",
            composeProject: "crea-trip-planner",
            composeService: "bot",
          },
        ],
      }),
    );
    expect(registry.bots).toHaveLength(1);
    expect(registry.byId.get("trip-planner")?.composeProject).toBe("crea-trip-planner");

    const arrayRegistry = parseBotRegistryJson(
      JSON.stringify([
        { id: "weather", name: "Weather", composeProject: "crea-weather", composeService: "bot" },
      ]),
    );
    expect(arrayRegistry.byComposeTarget.get("crea-weather/bot")?.id).toBe("weather");
  });

  it("defaults composeService to bot", () => {
    const bot = parseManagedBot({
      id: "trip-planner",
      name: "Trip",
      composeProject: "crea-trip-planner",
    });
    expect(bot.composeService).toBe("bot");
  });

  it("rejects duplicate ids", () => {
    expect(() =>
      parseBotRegistryJson(
        JSON.stringify({
          bots: [
            { id: "a", name: "A", composeProject: "proj-a", composeService: "bot" },
            { id: "a", name: "B", composeProject: "proj-b", composeService: "bot" },
          ],
        }),
      ),
    ).toThrow(/Duplicate managed bot id/);
  });

  it("rejects unsafe compose names", () => {
    expect(() =>
      parseBotRegistryJson(
        JSON.stringify({
          bots: [{ id: "bad", name: "Bad", composeProject: "svc;rm -rf", composeService: "bot" }],
        }),
      ),
    ).toThrow();
  });

  it("normalizes id and serializes", () => {
    const bot = parseManagedBot({
      id: "Trip-Planner",
      name: "Trip",
      composeProject: "crea-trip-planner",
      composeService: "bot",
    });
    expect(bot.id).toBe("trip-planner");
    const json = serializeRegistry([
      { id: "a", name: "A", composeProject: "proj-a", composeService: "bot" },
    ]);
    expect(JSON.parse(json)).toEqual({
      bots: [{ id: "a", name: "A", composeProject: "proj-a", composeService: "bot" }],
    });
  });

  describe("BotRegistryStore", () => {
    function withTempStore(
      initial = {
        bots: [] as Array<{
          id: string;
          name: string;
          composeProject: string;
          composeService: string;
        }>,
      },
    ) {
      const dir = mkdtempSync(join(tmpdir(), "bot-registry-"));
      const path = join(dir, "managed-bots.json");
      writeFileSync(path, JSON.stringify(initial));
      const store = new BotRegistryStore(path);
      return {
        store,
        path,
        cleanup: () => rmSync(dir, { recursive: true, force: true }),
      };
    }

    it("adds and persists a bot", () => {
      const { store, path, cleanup } = withTempStore();
      try {
        store.addBot({
          id: "trip-planner",
          name: "Trip Planner",
          composeProject: "crea-trip-planner",
          composeService: "bot",
        });
        const saved = JSON.parse(readFileSync(path, "utf8"));
        expect(saved.bots).toHaveLength(1);
        expect(saved.bots[0].composeProject).toBe("crea-trip-planner");
      } finally {
        cleanup();
      }
    });

    it("removes a bot", () => {
      const { store, cleanup } = withTempStore({
        bots: [
          {
            id: "weather",
            name: "Weather",
            composeProject: "crea-weather",
            composeService: "bot",
          },
        ],
      });
      try {
        const removed = store.removeBot("weather");
        expect(removed.id).toBe("weather");
        expect(store.getRegistry().bots).toHaveLength(0);
      } finally {
        cleanup();
      }
    });

    it("rejects duplicate id on add", () => {
      const { store, cleanup } = withTempStore({
        bots: [{ id: "a", name: "A", composeProject: "proj-a", composeService: "bot" }],
      });
      try {
        expect(() =>
          store.addBot({ id: "a", name: "B", composeProject: "proj-b", composeService: "bot" }),
        ).toThrow(RegistryError);
      } finally {
        cleanup();
      }
    });
  });
});
