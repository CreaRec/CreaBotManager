import { beforeEach, describe, expect, it, vi } from "vitest";
import { BotRegistryStore, parseBotRegistryJson } from "./bot-registry";
import { BotManager, formatActionResult, formatBotAdded, formatBotList } from "./bot-manager";

const {
  listComposeContainersMock,
  runContainerActionMock,
  fetchContainerLogsMock,
} = vi.hoisted(() => ({
  listComposeContainersMock: vi.fn(),
  runContainerActionMock: vi.fn(),
  fetchContainerLogsMock: vi.fn(),
}));

vi.mock("./docker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./docker")>();
  return {
    ...actual,
    listComposeContainers: listComposeContainersMock,
    runContainerAction: runContainerActionMock,
    fetchContainerLogs: fetchContainerLogsMock,
  };
});

const registry = parseBotRegistryJson(
  JSON.stringify({
    bots: [
      {
        id: "trip-planner",
        name: "Trip Planner",
        composeProject: "crea-trip-planner",
        composeService: "bot",
      },
      {
        id: "weather",
        name: "Weather",
        composeProject: "crea-weather",
        composeService: "bot",
      },
    ],
  }),
);

const store = new BotRegistryStore("config/managed-bots.json", registry);

const dockerCfg = {
  dockerPath: "/usr/bin/docker",
};

describe("BotManager", () => {
  beforeEach(() => {
    listComposeContainersMock.mockReset();
    runContainerActionMock.mockReset();
    fetchContainerLogsMock.mockReset();
  });

  it("lists bot statuses", async () => {
    listComposeContainersMock
      .mockResolvedValueOnce({
        containers: [{ id: "1", name: "a", status: "Up", state: "running" }],
        command: { stdout: "", stderr: "", exitCode: 0 },
      })
      .mockResolvedValueOnce({
        containers: [{ id: "2", name: "b", status: "Exited", state: "exited" }],
        command: { stdout: "", stderr: "", exitCode: 0 },
      });

    const manager = new BotManager(store, dockerCfg);
    const statuses = await manager.listStatuses();

    expect(statuses).toHaveLength(2);
    expect(statuses[0]?.state).toBe("active");
    expect(statuses[1]?.state).toBe("inactive");
    expect(listComposeContainersMock).toHaveBeenCalledWith(dockerCfg, {
      composeProject: "crea-trip-planner",
      composeService: "bot",
    });
  });

  it("runs start only for known bot ids", async () => {
    runContainerActionMock.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
    const manager = new BotManager(store, dockerCfg);

    const ok = await manager.runAction("trip-planner", "start");
    const missing = await manager.runAction("unknown", "start");

    expect(ok?.success).toBe(true);
    expect(missing).toBeUndefined();
    expect(runContainerActionMock).toHaveBeenCalledWith(
      dockerCfg,
      { composeProject: "crea-trip-planner", composeService: "bot" },
      "start",
    );
  });

  it("formats list and action messages", async () => {
    const manager = new BotManager(store, dockerCfg);
    listComposeContainersMock.mockResolvedValue({
      containers: [{ id: "1", name: "a", status: "Up", state: "running" }],
      command: { stdout: "", stderr: "", exitCode: 0 },
    });
    const statuses = await manager.listStatuses();
    expect(formatBotList(statuses)).toContain("Trip Planner");
    expect(formatBotAdded(registry.bots[0]!)).toContain("trip-planner");
    expect(formatBotAdded(registry.bots[0]!)).toContain("crea-trip-planner/bot");
  });

  it("formats action result with docker hint", () => {
    const message = formatActionResult({
      bot: registry.bots[0]!,
      action: "stop",
      command: {
        stdout: "",
        stderr: "Got permission denied while trying to connect to the Docker daemon",
        exitCode: 1,
      },
      success: false,
    });
    expect(message).toContain("Остановка");
    expect(message).toContain("permission denied");
    expect(message).toContain("DOCKER_GID");
  });

  it("fetches logs for a bot", async () => {
    fetchContainerLogsMock.mockResolvedValue({ stdout: "log", stderr: "", exitCode: 0 });
    const manager = new BotManager(store, dockerCfg);
    const result = await manager.getLogs("weather", 20);
    expect(result?.command.stdout).toBe("log");
    expect(fetchContainerLogsMock).toHaveBeenCalledWith(
      dockerCfg,
      { composeProject: "crea-weather", composeService: "bot" },
      20,
    );
  });
});
