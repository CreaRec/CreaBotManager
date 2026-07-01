import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureRuntimeJsonFile } from "./runtime-data";

describe("runtime-data", () => {
  it("migrates legacy config file into data directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "runtime-data-"));
    const legacy = join(dir, "config", "user-permissions.json");
    const target = join(dir, "data", "user-permissions.json");
    mkdirSync(join(dir, "config"), { recursive: true });
    writeFileSync(legacy, '{"users":[{"telegramId":222,"botIds":[]}]}\n', "utf8");

    ensureRuntimeJsonFile(target, legacy, '{"users":[]}\n');

    expect(readFileSync(target, "utf8")).toContain("222");
    rmSync(dir, { recursive: true, force: true });
  });
});
