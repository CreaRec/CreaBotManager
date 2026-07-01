import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatHumanServiceStatus,
  formatServiceStateLabel,
  parseSystemctlShow,
  stateFromServiceProps,
} from "./service-status-format";

describe("service-status-format", () => {
  it("parses systemctl show output", () => {
    const props = parseSystemctlShow(
      "ActiveState=active\nSubState=running\nMainPID=1234\nMemoryCurrent=1048576\n",
    );
    expect(props.ActiveState).toBe("active");
    expect(props.MainPID).toBe("1234");
  });

  it("formats active service status in Russian", () => {
    const text = formatHumanServiceStatus({
      bot: { id: "flibusta", name: "FlibustaBot", serviceName: "telegram-flibusta" },
      state: "active",
      props: {
        ActiveState: "active",
        SubState: "running",
        UnitFileState: "enabled",
        MainPID: "4242",
        ActiveEnterTimestamp: "Wed 2026-07-01 14:15:24 CEST",
        MemoryCurrent: "52428800",
      },
    });

    expect(text).toContain("FlibustaBot");
    expect(text).toContain("работает");
    expect(text).toContain("автозапуск: включён");
    expect(text).toContain("PID: 4242");
    expect(text).toContain("запущен:");
    expect(text).toContain("50.0 MB");
    expect(text).not.toContain("```");
  });

  it("formats inactive service status", () => {
    const text = formatHumanServiceStatus({
      bot: { id: "flibusta", name: "FlibustaBot", serviceName: "telegram-flibusta" },
      state: "inactive",
      props: {
        ActiveState: "inactive",
        SubState: "dead",
        UnitFileState: "enabled",
        MainPID: "0",
        InactiveEnterTimestamp: "Wed 2026-07-01 14:20:00 CEST",
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

  it("shows limited-details hint when show is denied but is-active works", () => {
    const text = formatHumanServiceStatus({
      bot: { id: "flibusta", name: "FlibustaBot", serviceName: "telegram-flibusta" },
      state: "active",
      props: { ActiveState: "active" },
      limitedDetails: true,
    });

    expect(text).toContain("работает");
    expect(text).toContain("systemctl show");
    expect(text).not.toContain("Нет доступа к systemctl");
  });
});
