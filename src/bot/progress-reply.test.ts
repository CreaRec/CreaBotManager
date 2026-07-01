import { describe, expect, it, vi } from "vitest";
import {
  ACTION_PROGRESS_LABELS,
  formatProgressText,
  runWithProgress,
} from "./progress-reply";

describe("progress-reply", () => {
  it("formats pending text", () => {
    expect(formatProgressText(ACTION_PROGRESS_LABELS.stop!, "FlibustaBot")).toBe(
      "⏳ Останавливаю FlibustaBot…",
    );
  });

  it("edits callback message when preferEdit is enabled", async () => {
    const editMessageText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const ctx = {
      callbackQuery: { message: { message_id: 1 } },
      editMessageText,
      reply: vi.fn(),
      chat: { id: 42 },
      telegram: { editMessageText: vi.fn() },
    };

    await runWithProgress(
      ctx as never,
      "⏳ Останавливаю FlibustaBot…",
      async () => ({ text: "✅ Готово" }),
      { preferEdit: true },
    );

    expect(editMessageText).toHaveBeenCalledTimes(2);
    expect(editMessageText.mock.calls[0]?.[0]).toBe("⏳ Останавливаю FlibustaBot…");
    expect(editMessageText.mock.calls[1]?.[0]).toBe("✅ Готово");
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("uses a new progress reply when not editing", async () => {
    const reply = vi.fn().mockResolvedValue({ message_id: 99 });
    const editMessageText = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      reply,
      chat: { id: 42 },
      telegram: { editMessageText },
    };

    await runWithProgress(ctx as never, "⏳ Запускаю bot…", async () => ({
      text: "✅ Готово",
      extras: { parse_mode: "Markdown" },
    }));

    expect(reply).toHaveBeenCalledWith("⏳ Запускаю bot…");
    expect(editMessageText).toHaveBeenCalledWith(42, 99, undefined, "✅ Готово", {
      parse_mode: "Markdown",
    });
  });
});
