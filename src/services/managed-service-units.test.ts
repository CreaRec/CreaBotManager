import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectManagedServiceUnits } from "./managed-service-units";

describe("collectManagedServiceUnits", () => {
  it("returns manager unit and registered bot services", () => {
    const dir = mkdtempSync(join(tmpdir(), "crea-units-"));
    const configPath = join(dir, "managed-bots.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        bots: [
          { id: "a", serviceName: "telegram-a" },
          { id: "b", serviceName: "telegram-b" },
        ],
      }),
    );

    const units = collectManagedServiceUnits(configPath, "telegram-bot-manager");
    expect(units.sort()).toEqual(["telegram-a", "telegram-b", "telegram-bot-manager"]);
  });

  it("returns only manager when config file is missing", () => {
    const units = collectManagedServiceUnits("/tmp/does-not-exist-managed-bots.json", "telegram-bot-manager");
    expect(units).toEqual(["telegram-bot-manager"]);
  });
});
