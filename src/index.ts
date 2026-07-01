import { createBot } from "./bot/bot";
import { config } from "./config";
import { BotRegistryStore } from "./services/bot-registry";

async function main(): Promise<void> {
  if (config.allowedTelegramIds.length === 0) {
    console.warn(
      "[startup] WARNING: ALLOWED_TELEGRAM_IDS is empty - the bot will respond to ANYONE. Set it in .env.",
    );
  }

  const store = new BotRegistryStore(config.managedBotsConfigPath);
  const registry = store.getRegistry();
  if (registry.bots.length === 0) {
    console.warn(
      `[startup] No bots in ${config.managedBotsConfigPath}. Add bots via /botadd in Telegram.`,
    );
  } else {
    console.log(`[startup] managing ${registry.bots.length} bot service(s).`);
  }

  const bot = createBot(store);

  const shutdown = async (signal: string) => {
    console.log(`[shutdown] received ${signal}, stopping...`);
    bot.stop(signal);
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  console.log("[startup] launching Telegram bot...");
  bot.launch().catch((err) => {
    console.error("[fatal] bot stopped with error:", err);
    process.exit(1);
  });
  console.log("[startup] bot is running.");
}

main().catch((err) => {
  console.error("[fatal] failed to start:", err);
  process.exit(1);
});
