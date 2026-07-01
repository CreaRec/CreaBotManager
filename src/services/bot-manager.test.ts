import { beforeEach, describe, expect, it, vi } from "vitest";
import { BotRegistryStore, parseBotRegistryJson } from "./bot-registry";
import { BotManager, formatActionResult, formatBotAdded, formatBotList } from "./bot-manager";

const { runSystemctlMock, fetchServiceLogsMock } = vi.hoisted(() => ({
  runSystemctlMock: vi.fn(),
  fetchServiceLogsMock: vi.fn(),
}));

vi.mock("./systemd", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./systemd")>();
  return {
    ...actual,
    runSystemctl: runSystemctlMock,
    fetchServiceLogs: fetchServiceLogsMock,
  };
});

const registry = parseBotRegistryJson(
  JSON.stringify({
    bots: [
      { id: "trip-planner", name: "Trip Planner", serviceName: "telegram-trip-planner" },
      { id: "weather", name: "Weather", serviceName: "telegram-weather" },
    ],
  }),
);

const store = new BotRegistryStore("config/managed-bots.json", registry);

const systemdCfg = {
  systemctlPath: "/bin/systemctl",
  journalctlPath: "/bin/journalctl",
  useSudo: true,
};

describe("BotManager", () => {
  beforeEach(() => {
    runSystemctlMock.mockReset();
    fetchServiceLogsMock.mockReset();
  });

  it("lists bot statuses", async () => {
    runSystemctlMock
      .mockResolvedValueOnce({ stdout: "active", stderr: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "inactive", stderr: "", exitCode: 3 });

    const manager = new BotManager(store, systemdCfg);
    const statuses = await manager.listStatuses();

    expect(statuses).toHaveLength(2);
    expect(statuses[0]?.state).toBe("active");
    expect(statuses[1]?.state).toBe("inactive");
    expect(runSystemctlMock).toHaveBeenCalledWith(systemdCfg, "is-active", "telegram-trip-planner");
  });

  it("runs start only for known bot ids", async () => {
    runSystemctlMock.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
    const manager = new BotManager(store, systemdCfg);

    const ok = await manager.runAction("trip-planner", "start");
    const missing = await manager.runAction("unknown", "start");

    expect(ok?.success).toBe(true);
    expect(missing).toBeUndefined();
    expect(runSystemctlMock).toHaveBeenCalledWith(systemdCfg, "start", "telegram-trip-planner");
  });

  it("formats list and action messages", async () => {
    const manager = new BotManager(store, systemdCfg);
    runSystemctlMock.mockResolvedValue({ stdout: "active", stderr: "", exitCode: 0 });
    const statuses = await manager.listStatuses();
    expect(formatBotList(statuses)).toContain("Trip Planner");
    expect(formatBotAdded(registry.bots[0]!)).toContain("trip-planner");
  });

  it("formats action result with sudo hint", () => {
    const message = formatActionResult({
      bot: registry.bots[0]!,
      action: "stop",
      command: { stdout: "", stderr: "sudo: a password is required", exitCode: 1 },
      success: false,
    });
    expect(message).toContain("Остановка");
    expect(message).toContain("sudo: a password is required");
    expect(message).toContain("sudoers");
  });

  it("fetches logs for a bot", async () => {
    fetchServiceLogsMock.mockResolvedValue({ stdout: "log", stderr: "", exitCode: 0 });
    const manager = new BotManager(store, systemdCfg);
    const result = await manager.getLogs("weather", 20);
    expect(result?.command.stdout).toBe("log");
    expect(fetchServiceLogsMock).toHaveBeenCalledWith(systemdCfg, "telegram-weather", 20);
  });
});
