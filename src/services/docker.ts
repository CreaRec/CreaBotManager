import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ServiceState = "active" | "inactive" | "failed" | "unknown";

export type ContainerAction = "start" | "stop" | "restart";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface DockerConfig {
  dockerPath: string;
  dockerHost?: string;
}

export interface ComposeTarget {
  composeProject: string;
  composeService: string;
}

export interface ContainerRef {
  id: string;
  name: string;
  status: string;
  state: string;
}

function trimOutput(value: string | Buffer): string {
  return value.toString().trim();
}

function dockerEnv(cfg: DockerConfig): NodeJS.ProcessEnv | undefined {
  if (!cfg.dockerHost) return undefined;
  return { ...process.env, DOCKER_HOST: cfg.dockerHost };
}

async function runDocker(cfg: DockerConfig, args: string[]): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(cfg.dockerPath, args, {
      maxBuffer: 1024 * 1024,
      env: dockerEnv(cfg),
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

function projectFilter(project: string): string {
  return `label=com.docker.compose.project=${project}`;
}

function serviceFilter(service: string): string {
  return `label=com.docker.compose.service=${service}`;
}

export async function listComposeContainers(
  cfg: DockerConfig,
  target: ComposeTarget,
): Promise<{ containers: ContainerRef[]; command: CommandResult }> {
  const format = "{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.State}}";
  const command = await runDocker(cfg, [
    "ps",
    "-a",
    "--filter",
    projectFilter(target.composeProject),
    "--filter",
    serviceFilter(target.composeService),
    "--format",
    format,
  ]);

  if (command.exitCode !== 0 || !command.stdout) {
    return { containers: [], command };
  }

  const containers = command.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id = "", name = "", status = "", state = ""] = line.split("\t");
      return { id, name, status, state };
    })
    .filter((c) => c.id);

  return { containers, command };
}

export async function resolveContainer(
  cfg: DockerConfig,
  target: ComposeTarget,
): Promise<{ container?: ContainerRef; command: CommandResult }> {
  const { containers, command } = await listComposeContainers(cfg, target);
  if (command.exitCode !== 0) {
    return { command };
  }
  if (containers.length === 0) {
    return {
      command: {
        stdout: "",
        stderr: `No container found for ${target.composeProject}/${target.composeService}`,
        exitCode: 1,
      },
    };
  }
  return { container: containers[0], command };
}

export async function runContainerAction(
  cfg: DockerConfig,
  target: ComposeTarget,
  action: ContainerAction,
): Promise<CommandResult> {
  const { container, command: resolveCommand } = await resolveContainer(cfg, target);
  if (!container) {
    return resolveCommand;
  }
  return runDocker(cfg, [action, container.id]);
}

export async function inspectContainer(
  cfg: DockerConfig,
  target: ComposeTarget,
): Promise<{ props: Record<string, string>; command: CommandResult; limitedDetails?: boolean }> {
  const { container, command: resolveCommand } = await resolveContainer(cfg, target);
  if (!container) {
    return { props: {}, command: resolveCommand, limitedDetails: true };
  }

  const format = [
    "{{.State.Status}}",
    "{{.State.Running}}",
    "{{.State.ExitCode}}",
    "{{.State.StartedAt}}",
    "{{.State.FinishedAt}}",
    "{{.State.Pid}}",
    "{{.Name}}",
    "{{.Id}}",
    "{{.HostConfig.RestartPolicy.Name}}",
  ].join("\t");

  const command = await runDocker(cfg, ["inspect", "--format", format, container.id]);
  if (command.exitCode !== 0 || !command.stdout) {
    return {
      props: {
        ActiveState: stateFromDockerState(container.state),
        SubState: container.state,
        Status: container.status,
      },
      command: resolveCommand.exitCode === 0 ? command : resolveCommand,
      limitedDetails: true,
    };
  }

  const [
    status = "",
    running = "",
    exitCode = "",
    startedAt = "",
    finishedAt = "",
    pid = "",
    name = "",
    id = "",
    restartPolicy = "",
  ] = command.stdout.split("\t");

  const activeState = running === "true" ? "active" : status === "exited" && exitCode !== "0" ? "failed" : "inactive";

  return {
    props: {
      ActiveState: activeState,
      SubState: status || container.state,
      Status: container.status,
      MainPID: pid,
      ActiveEnterTimestamp: startedAt,
      InactiveEnterTimestamp: finishedAt,
      Result: exitCode === "0" ? "success" : exitCode,
      UnitFileState: restartPolicy || "n/a",
      ContainerName: name.replace(/^\//, ""),
      ContainerId: id.slice(0, 12),
    },
    command,
  };
}

export async function fetchContainerLogs(
  cfg: DockerConfig,
  target: ComposeTarget,
  lines: number,
): Promise<CommandResult> {
  const safeLines = Math.min(Math.max(1, Math.floor(lines)), 200);
  const { container, command: resolveCommand } = await resolveContainer(cfg, target);
  if (!container) {
    return resolveCommand;
  }
  return runDocker(cfg, ["logs", "--tail", String(safeLines), container.id]);
}

export function stateFromDockerState(state: string): ServiceState {
  const value = state.trim().toLowerCase();
  if (value === "running") return "active";
  if (value === "exited" || value === "created" || value === "paused" || value === "dead") {
    return "inactive";
  }
  if (value === "restarting" || value === "removing") return "unknown";
  return "unknown";
}

export function parseIsActive(stdout: string): ServiceState {
  const value = stdout.trim().toLowerCase();
  if (value === "active" || value === "running") return "active";
  if (value === "inactive" || value === "exited" || value === "created" || value === "paused") {
    return "inactive";
  }
  if (value === "failed" || value === "dead") return "failed";
  return "unknown";
}

export function formatStatusEmoji(state: ServiceState): string {
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
