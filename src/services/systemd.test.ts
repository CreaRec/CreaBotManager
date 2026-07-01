import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseIsActive, formatStatusEmoji } from "./systemd";

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

vi.mock("node:util", () => ({
  promisify: () => execFileMock,
}));

import { runSystemctl, fetchServiceLogs } from "./systemd";

describe("systemd", () => {
  const cfg = {
    systemctlPath: "/bin/systemctl",
    journalctlPath: "/bin/journalctl",
    useSudo: true,
  };

  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("runs systemctl via sudo", async () => {
    execFileMock.mockResolvedValue({ stdout: "active\n", stderr: "" });
    const result = await runSystemctl(cfg, "is-active", "telegram-trip-planner");
    expect(execFileMock).toHaveBeenCalledWith(
      "sudo",
      ["-n", "/bin/systemctl", "is-active", "telegram-trip-planner"],
      expect.any(Object),
    );
    expect(result.stdout).toBe("active");
    expect(result.exitCode).toBe(0);
  });

  it("runs systemctl without sudo when disabled", async () => {
    execFileMock.mockResolvedValue({ stdout: "inactive\n", stderr: "" });
    await runSystemctl({ ...cfg, useSudo: false }, "stop", "telegram-weather");
    expect(execFileMock).toHaveBeenCalledWith(
      "/bin/systemctl",
      ["stop", "telegram-weather"],
      expect.any(Object),
    );
  });

  it("captures non-zero exit codes from systemctl", async () => {
    execFileMock.mockRejectedValue({
      stdout: "inactive\n",
      stderr: "",
      code: 3,
      message: "failed",
    });
    const result = await runSystemctl(cfg, "is-active", "telegram-trip-planner");
    expect(result.exitCode).toBe(3);
    expect(result.stdout).toBe("inactive");
  });

  it("fetches journal logs with line cap", async () => {
    execFileMock.mockResolvedValue({ stdout: "log line", stderr: "" });
    await fetchServiceLogs(cfg, "telegram-trip-planner", 500);
    expect(execFileMock).toHaveBeenCalledWith(
      "sudo",
      ["-n", "/bin/journalctl", "-u", "telegram-trip-planner", "-n", "200", "--no-pager"],
      expect.any(Object),
    );
  });

  it("parses is-active output", () => {
    expect(parseIsActive("active")).toBe("active");
    expect(parseIsActive("inactive")).toBe("inactive");
    expect(parseIsActive("failed")).toBe("failed");
    expect(formatStatusEmoji("active")).toBe("🟢");
  });
});
