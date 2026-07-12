import { describe, expect, it } from "vitest";
import {
  escapeMarkdown,
  formatDockerHint,
  isCallbackQueryExpiredError,
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

  it("detects docker permission errors", () => {
    expect(
      formatDockerHint("Got permission denied while trying to connect to the Docker daemon"),
    ).toMatch(/DOCKER_GID/);
    expect(formatDockerHint("No container found for crea-x/bot")).toMatch(/Контейнер не найден/);
    expect(formatDockerHint("active")).toBeNull();
  });

  it("detects expired callback query errors", () => {
    expect(
      isCallbackQueryExpiredError(new Error("400: Bad Request: query is too old and response timeout expired")),
    ).toBe(true);
    expect(isCallbackQueryExpiredError(new Error("other"))).toBe(false);
  });

  it("detects message-not-modified errors", () => {
    expect(isMessageNotModifiedError(new Error("400: Bad Request: message is not modified"))).toBe(true);
    expect(isMessageNotModifiedError(new Error("other"))).toBe(false);
  });
});
