import { describe, expect, it } from "vitest";
import {
  escapeMarkdown,
  formatSudoHint,
  isMessageNotModifiedError,
  wrapCodeBlock,
} from "./telegram-format";

describe("telegram-format", () => {
  it("escapes markdown metacharacters", () => {
    expect(escapeMarkdown("permission_denied *bold*")).toBe("permission\\_denied \\*bold\\*");
  });

  it("wraps output in a code block", () => {
    expect(wrapCodeBlock("active")).toBe("```\nactive\n```");
  });

  it("detects sudo permission errors", () => {
    expect(formatSudoHint("sudo: a password is required")).toMatch(/sudoers/);
    expect(formatSudoHint("active")).toBeNull();
  });

  it("detects message-not-modified errors", () => {
    expect(isMessageNotModifiedError(new Error("400: Bad Request: message is not modified"))).toBe(true);
    expect(isMessageNotModifiedError(new Error("other"))).toBe(false);
  });
});
