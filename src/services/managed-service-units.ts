import { readFileSync } from "node:fs";

export function collectManagedServiceUnits(
  managedBotsConfigPath: string,
  managerServiceName: string,
): string[] {
  const units = new Set<string>();
  const manager = managerServiceName.trim();
  if (manager) units.add(manager);

  try {
    const data = JSON.parse(readFileSync(managedBotsConfigPath, "utf8")) as {
      bots?: { serviceName?: string }[];
    };
    for (const bot of data.bots ?? []) {
      if (typeof bot.serviceName === "string" && bot.serviceName.trim()) {
        units.add(bot.serviceName.trim());
      }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }

  return [...units];
}
