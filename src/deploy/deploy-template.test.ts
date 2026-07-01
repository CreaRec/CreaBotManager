import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../..");

describe("deploy templates", () => {
  it("systemd unit template exposes deploy placeholders", async () => {
    const unitPath = path.join(repoRoot, "deploy", "telegram-bot-manager.service");
    const unit = await readFile(unitPath, "utf8");

    expect(unit).toMatch(/__USER__/);
    expect(unit).toMatch(/__APP_DIR__/);
    expect(unit).not.toMatch(/\/opt\/crea-bot-manager/);
  });

  it("deploy-remote.sh substitutes systemd template placeholders", async () => {
    const remotePath = path.join(repoRoot, "scripts", "deploy-remote.sh");
    const remote = await readFile(remotePath, "utf8");

    expect(remote).toMatch(/deploy\/telegram-bot-manager\.service/);
    expect(remote).toMatch(/s#__USER__#/);
    expect(remote).toMatch(/s#__APP_DIR__#/);
  });

  it("deploy-remote.sh probes passwordless sudo via systemctl, not true", async () => {
    const remotePath = path.join(repoRoot, "scripts", "deploy-remote.sh");
    const remote = await readFile(remotePath, "utf8");

    expect(remote).toMatch(/sudo_probe\(\)/);
    expect(remote).toMatch(/sudo -n systemctl --version/);
    expect(remote).toMatch(/is_interactive_deploy\(\)/);
    expect(remote).toMatch(/GITHUB_ACTIONS/);
    expect(remote).not.toMatch(/\bsudo -n true\b/);
  });

  it("deploy.sh forwards CI env and uses -tt only with DEPLOY_PASSWORD", async () => {
    const deployPath = path.join(repoRoot, "scripts", "deploy.sh");
    const deploy = await readFile(deployPath, "utf8");

    expect(deploy).toMatch(/REMOTE_ENV\+=\("CI=true"\)/);
    expect(deploy).toMatch(/REMOTE_ENV\+=\("GITHUB_ACTIONS=true"\)/);
    expect(deploy).toMatch(
      /if \[ -n "\$\{DEPLOY_PASSWORD:-\}" \]; then[\s\S]*ssh_cmd -tt/,
    );
    expect(deploy).toMatch(/else[\s\S]*ssh_cmd "\$SSH_TARGET"/);
  });

  it("ci-cd workflow runs tests and deploys on main push", async () => {
    const workflowPath = path.join(repoRoot, ".github", "workflows", "ci-cd.yml");
    const workflow = await readFile(workflowPath, "utf8");

    expect(workflow).toMatch(/npm test/);
    expect(workflow).toMatch(/DEPLOY_SSH_KEY/);
    expect(workflow).toMatch(/\.\/scripts\/deploy\.sh --remote/);
    expect(workflow).toMatch(/refs\/heads\/main/);
  });
});
