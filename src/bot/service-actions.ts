import type { Context } from "telegraf";
import type { BotManager } from "../services/bot-manager";
import {
  formatActionResult,
  formatDetailedStatus,
  formatLogs,
} from "../services/bot-manager";
import { botActionsKeyboard } from "./keyboards";
import { ACTION_PROGRESS_LABELS, formatProgressText, runWithProgress } from "./progress-reply";

type ServiceAction = "start" | "stop" | "restart";
type BotOperation = ServiceAction | "status" | "logs";

export interface ExecuteServiceActionOptions {
  logLines?: number;
  isAdmin?: boolean;
  preferEdit?: boolean;
}

export async function executeServiceAction(
  ctx: Context,
  manager: BotManager,
  botId: string,
  action: BotOperation,
  options: ExecuteServiceActionOptions = {},
): Promise<void> {
  const bot = manager.getBot(botId);
  const subject = bot?.name ?? botId;
  const label = ACTION_PROGRESS_LABELS[action] ?? "Выполняю команду";
  const pendingText = formatProgressText(label, subject);

  await runWithProgress(
    ctx,
    pendingText,
    async () => {
      if (action === "status") {
        const result = await manager.getDetailedStatus(botId);
        if (!result) return { text: "Бот не найден." };
        return {
          text: formatDetailedStatus(result),
          extras: { parse_mode: "Markdown" as const },
        };
      }

      if (action === "logs") {
        const result = await manager.getLogs(botId, options.logLines ?? 30);
        if (!result) return { text: "Бот не найден." };
        return {
          text: formatLogs(result.bot, result.command),
          extras: { parse_mode: "Markdown" as const },
        };
      }

      const result = await manager.runAction(botId, action);
      if (!result) return { text: "Бот не найден." };

      return {
        text: formatActionResult(result),
        extras: {
          parse_mode: "Markdown" as const,
          ...botActionsKeyboard(botId, options.isAdmin ?? false),
        },
      };
    },
    { preferEdit: options.preferEdit ?? false },
  );
}
