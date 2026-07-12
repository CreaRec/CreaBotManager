import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatHumanServiceStatus,
  formatServiceStateLabel,
  parseSystemctlShow,
  stateFromServiceProps,
} from "./service-status-format";

describe("service-status-format", () => {
  it("parses key=value props", () => {
    const props = parseSystemctlShow(
      "ActiveState=active\nSubState=running\nMainPID=1234\nMemoryCurrent=1048576\n",
    );
    expect(props.ActiveState).toBe("active");
    expect(props.MainPID).toBe("1234");
  });

  it("formats active container status in Russian", () => {
    const text = formatHumanServiceStatus({
      bot: {
        id: "flibusta",
        name: "FlibustaBot",
        composeProject: "crea-flibusta-bot",
        composeService: "bot",
      },
      state: "active",
      props: {
        ActiveState: "active",
        SubState: "running",
        UnitFileState: "unless-stopped",
        MainPID: "4242",
        ActiveEnterTimestamp: "2026-07-01T14:15:24Z",
        ContainerName: "crea-flibusta-bot-bot-1",
        ContainerId: "abc123def456",
        MemoryCurrent: "52428800",
      },
    });

    expect(text).toContain("FlibustaBot");
    expect(text).toContain("работает");
    expect(text).toContain("crea-flibusta-bot/bot");
    expect(text).toContain("restart: unless-stopped");
    expect(text).toContain("PID: 4242");
    expect(text).toContain("запущен:");
    expect(text).toContain("50.0 MB");
    expect(text).not.toContain("```");
  });

  it("formats inactive container status", () => {
    const text = formatHumanServiceStatus({
      bot: {
        id: "flibusta",
        name: "FlibustaBot",
        composeProject: "crea-flibusta-bot",
        composeService: "bot",
      },
      state: "inactive",
      props: {
        ActiveState: "inactive",
        SubState: "exited",
        UnitFileState: "unless-stopped",
        MainPID: "0",
        InactiveEnterTimestamp: "2026-07-01T14:20:00Z",
      },
    });

    expect(text).toContain("остановлен");
    expect(text).toContain("остановлен:");
    expect(text).not.toContain("PID:");
  });

  it("maps service props to state", () => {
    expect(stateFromServiceProps({ ActiveState: "active", SubState: "running" })).toBe("active");
    expect(stateFromServiceProps({ ActiveState: "failed" })).toBe("failed");
    expect(formatServiceStateLabel("active", "running")).toBe("работает");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("shows limited-details hint when inspect is denied", () => {
    const text = formatHumanServiceStatus({
      bot: {
        id: "flibusta",
        name: "FlibustaBot",
        composeProject: "crea-flibusta-bot",
        composeService: "bot",
      },
      state: "active",
      props: { ActiveState: "active" },
      limitedDetails: true,
    });

    expect(text).toContain("работает");
    expect(text).toContain("DOCKER_GID");
  });
});
