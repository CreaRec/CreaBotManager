/** Escape characters that break Telegram legacy Markdown in user-controlled text. */
export function escapeMarkdown(text: string): string {
  return text.replace(/([_*`[\]])/g, "\\$1");
}

export function wrapCodeBlock(text: string): string {
  const safe = text.replace(/```/g, "'''");
  return `\`\`\`\n${safe}\n\`\`\``;
}

export function isCallbackQueryExpiredError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("query is too old") || msg.includes("response timeout expired");
}

export function isMessageNotModifiedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("message is not modified");
}

export function isDockerDenied(output: string): boolean {
  return formatDockerHint(output) !== null;
}

export function formatDockerHint(output: string): string | null {
  const lower = output.toLowerCase();
  if (
    lower.includes("permission denied") ||
    lower.includes("cannot connect to the docker daemon") ||
    lower.includes("error while dialing") ||
    lower.includes("connect: no such file") ||
    lower.includes("got permission denied while trying to connect")
  ) {
    return (
      "Нет доступа к Docker. Смонтируйте `/var/run/docker.sock` и задайте `DOCKER_GID` " +
      "(GID группы `docker` на хосте). Проверьте: `docker ps`"
    );
  }
  if (lower.includes("no container found")) {
    return "Контейнер не найден. Проверьте `composeProject` / `composeService` и что стек запущен.";
  }
  return null;
}
