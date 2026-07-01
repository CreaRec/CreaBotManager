import { createBot } from "./bot/bot";
import { config } from "./config";
import { AccessControl } from "./services/access-control";
import { BotRegistryStore } from "./services/bot-registry";
import { ensureRuntimeJsonFile } from "./services/runtime-data";
import { UserPermissionsStore } from "./services/user-permissions";

async function main(): Promise<void> {
  const managedBotsPath = ensureRuntimeJsonFile(
    config.managedBotsConfigPath,
    "config/managed-bots.json",
    '{"bots":[]}\n',
  );
  const userPermissionsPath = ensureRuntimeJsonFile(
    config.userPermissionsConfigPath,
    "config/user-permissions.json",
    '{"users":[]}\n',
  );

  const botStore = new BotRegistryStore(managedBotsPath);
  const permissionsStore = new UserPermissionsStore(userPermissionsPath);
  const access = new AccessControl(config.adminTelegramIds, permissionsStore);

  if (access.isOpenMode()) {
    console.warn(
      "[startup] WARNING: ADMIN_TELEGRAM_IDS is empty and no users configured — the bot is open to EVERYONE.",
    );
  } else if (config.adminTelegramIds.length === 0) {
    console.warn("[startup] WARNING: ADMIN_TELEGRAM_IDS is empty — only operators from user-permissions can access.");
  }

  const registry = botStore.getRegistry();
  if (registry.bots.length === 0) {
    console.warn(`[startup] No bots in ${managedBotsPath}. Admins can add bots via /botadd.`);
  } else {
    console.log(`[startup] managing ${registry.bots.length} bot service(s).`);
  }

  console.log(`[startup] ${permissionsStore.listUsers().length} operator(s) in permissions file.`);

  const { bot } = createBot(botStore, permissionsStore, access);

  const shutdown = async (signal: string) => {
    console.log(`[shutdown] received ${signal}, stopping...`);
    await bot.stop(signal);
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
