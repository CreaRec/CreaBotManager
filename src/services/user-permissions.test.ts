import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PermissionsError, UserPermissionsStore, parseUserPermissionsJson } from "./user-permissions";

describe("user-permissions", () => {
  function withTempStore(initial = { users: [] as Array<{ telegramId: number; label?: string; botIds: string[] }> }) {
    const dir = mkdtempSync(join(tmpdir(), "user-perms-"));
    const configPath = join(dir, "user-permissions.json");
    const store = new UserPermissionsStore(configPath, parseUserPermissionsJson(JSON.stringify(initial)));
    return { store, configPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
  }

  it("adds and persists a user", () => {
    const { store, configPath, cleanup } = withTempStore();
    try {
      store.addUser(123, "Alice");
      expect(store.hasUser(123)).toBe(true);
      expect(JSON.parse(readFileSync(configPath, "utf8")).users[0].label).toBe("Alice");
    } finally {
      cleanup();
    }
  });

  it("grants and revokes bot access", () => {
    const { store, cleanup } = withTempStore();
    try {
      store.addUser(123);
      store.grantBot(123, "trip-planner");
      expect(store.getUser(123)?.botIds).toEqual(["trip-planner"]);
      store.revokeBot(123, "trip-planner");
      expect(store.getUser(123)?.botIds).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("removes bot from all users", () => {
    const { store, cleanup } = withTempStore({
      users: [{ telegramId: 1, botIds: ["a", "b"] }, { telegramId: 2, botIds: ["b"] }],
    });
    try {
      store.removeBotFromAllUsers("b");
      expect(store.getUser(1)?.botIds).toEqual(["a"]);
      expect(store.getUser(2)?.botIds).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("rejects duplicate users", () => {
    const { store, cleanup } = withTempStore();
    try {
      store.addUser(123);
      expect(() => store.addUser(123)).toThrow(PermissionsError);
    } finally {
      cleanup();
    }
  });
});
