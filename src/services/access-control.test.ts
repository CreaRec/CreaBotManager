import { describe, expect, it } from "vitest";
import { AccessControl } from "./access-control";
import { parseBotRegistryJson } from "./bot-registry";
import { UserPermissionsStore, parseUserPermissionsJson } from "./user-permissions";

const permissionsStore = new UserPermissionsStore(
  "config/user-permissions.json",
  parseUserPermissionsJson(
    JSON.stringify({
      users: [{ telegramId: 222, label: "Operator", botIds: ["trip-planner"] }],
    }),
  ),
);

describe("AccessControl", () => {
  it("allows admins full access", () => {
    const access = new AccessControl([111], permissionsStore);
    expect(access.isAdmin(111)).toBe(true);
    expect(access.canAccessBot(111, "weather")).toBe(true);
    expect(access.canManageUsers(111)).toBe(true);
  });

  it("limits operators to assigned bots", () => {
    const access = new AccessControl([111], permissionsStore);
    expect(access.canAccessBot(222, "trip-planner")).toBe(true);
    expect(access.canAccessBot(222, "weather")).toBe(false);
    expect(access.canManageUsers(222)).toBe(false);
  });

  it("filters bot statuses for operators", () => {
    const access = new AccessControl([111], permissionsStore);
    const statuses = [
      {
        bot: {
          id: "trip-planner",
          name: "Trip",
          composeProject: "crea-trip-planner",
          composeService: "bot",
        },
        state: "active" as const,
        raw: "active",
      },
      {
        bot: {
          id: "weather",
          name: "Weather",
          composeProject: "crea-weather",
          composeService: "bot",
        },
        state: "inactive" as const,
        raw: "inactive",
      },
    ];
    const filtered = access.filterStatuses(222, statuses);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.bot.id).toBe("trip-planner");
  });

  it("uses open mode when nothing configured", () => {
    const emptyStore = new UserPermissionsStore(
      "config/user-permissions.json",
      parseUserPermissionsJson(JSON.stringify({ users: [] })),
    );
    const access = new AccessControl([], emptyStore);
    expect(access.isOpenMode()).toBe(true);
    expect(access.canAccessBot(999, "anything")).toBe(true);
  });

  it("denies unknown users when permissions are configured", () => {
    const access = new AccessControl([111], permissionsStore);
    expect(access.isKnownUser(999)).toBe(false);
    expect(access.isKnownUser(222)).toBe(true);
  });
});
