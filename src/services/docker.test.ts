import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseIsActive, formatStatusEmoji } from "./docker";

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

vi.mock("node:util", () => ({
  promisify: () => execFileMock,
}));

import {
  fetchContainerLogs,
  listComposeContainers,
  runContainerAction,
} from "./docker";

describe("docker", () => {
  const cfg = {
    dockerPath: "/usr/bin/docker",
  };

  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("lists compose containers by project and service labels", async () => {
    execFileMock.mockResolvedValue({
      stdout: "abc123\tcrea-trip-planner-bot-1\tUp 2 hours\trunning\n",
      stderr: "",
    });
    const { containers } = await listComposeContainers(cfg, {
      composeProject: "crea-trip-planner",
      composeService: "bot",
    });
    expect(execFileMock).toHaveBeenCalledWith(
      "/usr/bin/docker",
      [
        "ps",
        "-a",
        "--filter",
        "label=com.docker.compose.project=crea-trip-planner",
        "--filter",
        "label=com.docker.compose.service=bot",
        "--format",
        "{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.State}}",
      ],
      expect.any(Object),
    );
    expect(containers).toEqual([
      {
        id: "abc123",
        name: "crea-trip-planner-bot-1",
        status: "Up 2 hours",
        state: "running",
      },
    ]);
  });

  it("runs container actions after resolving id", async () => {
    execFileMock
      .mockResolvedValueOnce({
        stdout: "abc123\tbot\tUp\trunning\n",
        stderr: "",
      })
      .mockResolvedValueOnce({ stdout: "abc123\n", stderr: "" });

    const result = await runContainerAction(
      cfg,
      { composeProject: "crea-trip-planner", composeService: "bot" },
      "restart",
    );
    expect(result.exitCode).toBe(0);
    expect(execFileMock).toHaveBeenLastCalledWith(
      "/usr/bin/docker",
      ["restart", "abc123"],
      expect.any(Object),
    );
  });

  it("captures non-zero exit codes", async () => {
    execFileMock.mockRejectedValue({
      stdout: "",
      stderr: "permission denied",
      code: 1,
      message: "failed",
    });
    const { command } = await listComposeContainers(cfg, {
      composeProject: "crea-trip-planner",
      composeService: "bot",
    });
    expect(command.exitCode).toBe(1);
    expect(command.stderr).toContain("permission denied");
  });

  it("fetches container logs with line cap", async () => {
    execFileMock
      .mockResolvedValueOnce({
        stdout: "abc123\tbot\tUp\trunning\n",
        stderr: "",
      })
      .mockResolvedValueOnce({ stdout: "log line", stderr: "" });

    await fetchContainerLogs(
      cfg,
      { composeProject: "crea-trip-planner", composeService: "bot" },
      500,
    );
    expect(execFileMock).toHaveBeenLastCalledWith(
      "/usr/bin/docker",
      ["logs", "--tail", "200", "abc123"],
      expect.any(Object),
    );
  });

  it("parses container state", () => {
    expect(parseIsActive("running")).toBe("active");
    expect(parseIsActive("exited")).toBe("inactive");
    expect(parseIsActive("failed")).toBe("failed");
    expect(formatStatusEmoji("active")).toBe("🟢");
  });
});
