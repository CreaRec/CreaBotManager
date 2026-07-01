/** Escape characters that break Telegram legacy Markdown in user-controlled text. */
export function escapeMarkdown(text: string): string {
  return text.replace(/([_*`[\]])/g, "\\$1");
}

export function wrapCodeBlock(text: string): string {
  const safe = text.replace(/```/g, "'''");
  return `\`\`\`\n${safe}\n\`\`\``;
}

export function isMessageNotModifiedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("message is not modified");
}

export function formatSudoHint(output: string): string | null {
  const lower = output.toLowerCase();
  if (
    lower.includes("password is required") ||
    lower.includes("not allowed to execute") ||
    lower.includes("a terminal is required")
  ) {
    return (
      "Нет прав sudo для systemctl. Установите `/etc/sudoers.d/crea-bot-manager` " +
      "(см. `deploy/sudoers-crea-bot-manager.example`) и проверьте: " +
      "`sudo -n systemctl is-active telegram-trip-planner`"
    );
  }
  return null;
}
