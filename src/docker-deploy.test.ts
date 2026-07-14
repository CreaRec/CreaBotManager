import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("docker deploy contracts", () => {
  it("docker-compose.yml pulls GHCR image and mounts docker socket", async () => {
    const compose = await readFile(path.join(repoRoot, "docker-compose.yml"), "utf8");

    expect(compose).toMatch(/ghcr\.io\/crearec\/crea-bot-manager/);
    expect(compose).toMatch(/IMAGE_TAG/);
    expect(compose).toMatch(/\.\/data:\/app\/data/);
    expect(compose).toMatch(/\/var\/run\/docker\.sock:\/var\/run\/docker\.sock/);
    expect(compose).toMatch(/DOCKER_GID/);
    expect(compose).not.toMatch(/^\s*build:/m);
  });

  it("CI/CD workflow publishes to GHCR and deploys over SSH", async () => {
    const workflow = await readFile(path.join(repoRoot, ".github/workflows/ci-cd.yml"), "utf8");

    expect(workflow).toMatch(/packages:\s*write/);
    expect(workflow).toMatch(/ghcr\.io\/crearec\/crea-bot-manager/);
    expect(workflow).toMatch(/node-version:\s*"24"/);
    expect(workflow).toMatch(/docker compose pull/);
    expect(workflow).toMatch(/docker compose up -d/);
    expect(workflow).toMatch(/docker-compose\.yml/);
    expect(workflow).toMatch(/telegram-bot-manager/);
    expect(workflow).toMatch(/DOCKER_GID/);
    expect(workflow).not.toMatch(/scripts\/deploy\.sh/);
  });

  it("Dockerfile uses Node 24 bookworm-slim for build and runtime", async () => {
    const dockerfile = await readFile(path.join(repoRoot, "Dockerfile"), "utf8");

    expect(dockerfile).toMatch(/^FROM node:24-bookworm-slim AS build$/m);
    expect(dockerfile).toMatch(/^FROM node:24-bookworm-slim AS runtime$/m);
  });
});
