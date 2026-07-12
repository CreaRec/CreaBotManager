import { describe, expect, it } from "vitest";
import {
  botActionData,
  botListKeyboard,
  botSelectData,
  isValidBotId,
  mainMenuKeyboard,
  userActionData,
} from "./keyboards";

describe("keyboards", () => {
  it("validates bot ids", () => {
    expect(isValidBotId("trip-planner")).toBe(true);
    expect(isValidBotId("INVALID")).toBe(false);
    expect(isValidBotId("a;rm")).toBe(false);
  });

  it("keeps callback data under 64 bytes", () => {
    const longId = "a".repeat(40);
    expect(botSelectData(longId).length).toBeLessThanOrEqual(64);
    expect(botActionData("trip-planner", "restart").length).toBeLessThanOrEqual(64);
    expect(userActionData(165484160, "grant", "trip-planner").length).toBeLessThanOrEqual(64);
  });

  it("builds admin main menu with users button", () => {
    const kb = mainMenuKeyboard(true);
    expect(kb.reply_markup.inline_keyboard).toHaveLength(3);
  });

  it("builds operator main menu without users button", () => {
    const kb = mainMenuKeyboard(false);
    expect(kb.reply_markup.inline_keyboard).toHaveLength(2);
  });

  it("builds bot list with status buttons", () => {
    const kb = botListKeyboard([
      {
        bot: {
          id: "trip-planner",
          name: "Trip",
          composeProject: "crea-trip-planner",
          composeService: "bot",
        },
        state: "active",
        raw: "active",
      },
    ]);
    expect(kb.reply_markup.inline_keyboard[0]![0]!.text).toContain("Trip");
    expect(kb.reply_markup.inline_keyboard[0]![0]!.callback_data).toBe("b:trip-planner");
  });
});
