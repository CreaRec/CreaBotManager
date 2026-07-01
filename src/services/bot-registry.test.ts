import { describe, expect, it } from "vitest";
import { parseBotRegistryJson } from "./bot-registry";

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
});
