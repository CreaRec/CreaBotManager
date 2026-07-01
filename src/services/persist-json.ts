import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function persistJsonFile(configPath: string, content: string, label: string): void {
  const dir = dirname(configPath);
  mkdirSync(dir, { recursive: true });

  const tmpPath = `${configPath}.tmp.${process.pid}`;
  try {
    writeFileSync(tmpPath, content, "utf8");
    renameSync(tmpPath, configPath);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to save ${label} to ${configPath}: ${message}. Ensure the directory is writable by the service user.`,
    );
  }
}
