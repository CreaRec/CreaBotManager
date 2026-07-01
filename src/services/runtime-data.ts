import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function ensureRuntimeJsonFile(targetPath: string, legacyPath: string, emptyContent: string): string {
  const absoluteTarget = resolve(targetPath);
  if (existsSync(absoluteTarget)) {
    return targetPath;
  }

  mkdirSync(dirname(absoluteTarget), { recursive: true });
  const absoluteLegacy = resolve(legacyPath);
  if (existsSync(absoluteLegacy)) {
    copyFileSync(absoluteLegacy, absoluteTarget);
    console.log(`[startup] migrated ${absoluteLegacy} -> ${absoluteTarget}`);
    return targetPath;
  }

  writeFileSync(absoluteTarget, emptyContent, "utf8");
  return targetPath;
}
