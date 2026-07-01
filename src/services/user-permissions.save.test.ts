import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PermissionsError, UserPermissionsStore, parseUserPermissionsJson } from "./user-permissions";

vi.mock("./persist-json", () => ({
  persistJsonFile: vi.fn(() => {
    throw new Error("EACCES: permission denied");
  }),
}));

describe("user-permissions save failures", () => {
  it("rolls back removeUser when save fails", () => {
    const dir = mkdtempSync(join(tmpdir(), "user-perms-"));
    const configPath = join(dir, "user-permissions.json");
    const store = new UserPermissionsStore(
      configPath,
      parseUserPermissionsJson(JSON.stringify({ users: [{ telegramId: 222, botIds: ["trip-planner"] }] })),
    );

    expect(() => store.removeUser(222)).toThrow(PermissionsError);
    expect(store.hasUser(222)).toBe(true);

    rmSync(dir, { recursive: true, force: true });
  });
});
