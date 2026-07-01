import { describe, expect, it } from "vitest";
import { REPLY, parseReplyAction, replyMainKeyboard } from "./reply-keyboard";

describe("reply-keyboard", () => {
  it("builds admin keyboard with users row", () => {
    const kb = replyMainKeyboard(true);
    const flat = kb.reply_markup.keyboard.flat();
    expect(flat).toContain(REPLY.BOTS);
    expect(flat).toContain(REPLY.USERS);
    expect(kb.reply_markup.resize_keyboard).toBe(true);
  });

  it("omits users row for non-admin", () => {
    const kb = replyMainKeyboard(false);
    const flat = kb.reply_markup.keyboard.flat();
    expect(flat).not.toContain(REPLY.USERS);
  });

  it("parses reply labels", () => {
    expect(parseReplyAction(REPLY.BOTS, true)).toBe("bots");
    expect(parseReplyAction(REPLY.USERS, false)).toBeNull();
    expect(parseReplyAction(REPLY.MENU, false)).toBe("menu");
  });
});
