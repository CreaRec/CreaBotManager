import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type SystemctlAction = "start" | "stop" | "restart" | "is-active" | "status" | "show";

export type ServiceState = "active" | "inactive" | "failed" | "unknown";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SystemdConfig {
  systemctlPath: string;
  journalctlPath: string;
  useSudo: boolean;
}

function trimOutput(value: string | Buffer): string {
  return value.toString().trim();
}

async function runCommand(
  command: string,
  args: string[],
  useSudo: boolean,
): Promise<CommandResult> {
  const finalArgs = useSudo ? ["-n", command, ...args] : args;
  const executable = useSudo ? "sudo" : command;

  try {
    const { stdout, stderr } = await execFileAsync(executable, finalArgs, {
      maxBuffer: 1024 * 1024,
    });
    return { stdout: trimOutput(stdout), stderr: trimOutput(stderr), exitCode: 0 };
  } catch (err: unknown) {
    const execErr = err as NodeJS.ErrnoException & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      code?: number | string;
    };
    return {
      stdout: trimOutput(execErr.stdout ?? ""),
      stderr: trimOutput(execErr.stderr ?? execErr.message ?? ""),
      exitCode: typeof execErr.code === "number" ? execErr.code : 1,
    };
  }
}

export async function runSystemctl(
  cfg: SystemdConfig,
  action: SystemctlAction,
  serviceName: string,
  extraArgs: string[] = [],
): Promise<CommandResult> {
  return runCommand(cfg.systemctlPath, [action, serviceName, ...extraArgs], cfg.useSudo);
}

const SERVICE_SHOW_PROPERTIES = [
  "ActiveState",
  "SubState",
  "UnitFileState",
  "MainPID",
  "ActiveEnterTimestamp",
  "InactiveEnterTimestamp",
  "MemoryCurrent",
  "Result",
] as const;

export async function showServiceProperties(
  cfg: SystemdConfig,
  serviceName: string,
): Promise<CommandResult> {
  return runSystemctl(cfg, "show", serviceName, [
    `--property=${SERVICE_SHOW_PROPERTIES.join(",")}`,
    "--no-pager",
  ]);
}

export async function fetchServiceLogs(
  cfg: SystemdConfig,
  serviceName: string,
  lines: number,
): Promise<CommandResult> {
  const safeLines = Math.min(Math.max(1, Math.floor(lines)), 200);
  return runCommand(
    cfg.journalctlPath,
    ["-u", serviceName, "-n", String(safeLines), "--no-pager"],
    cfg.useSudo,
  );
}

export function parseIsActive(stdout: string): ServiceState {
  const value = stdout.trim().toLowerCase();
  if (value === "active") return "active";
  if (value === "inactive" || value === "deactivating") return "inactive";
  if (value === "failed") return "failed";
  return "unknown";
}

export function formatStatusEmoji(state: ReturnType<typeof parseIsActive>): string {
  switch (state) {
    case "active":
      return "🟢";
    case "inactive":
      return "⚪";
    case "failed":
      return "🔴";
    default:
      return "❓";
  }
}
