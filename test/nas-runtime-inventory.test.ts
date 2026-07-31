import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("nas-runtime-inventory-check", () => {
  it("writes inventory entries for repo source files and generated NAS staging stays out of source inventory", () => {
    const root = createTempRepo();
    writeFileSync(join(root, "package.json"), "{}\n", "utf8");
    writeFileSync(join(root, "package-lock.json"), "{}\n", "utf8");
    writeFileSync(join(root, "tsconfig.json"), "{}\n", "utf8");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "index.ts"), "export const x = 1;\n", "utf8");
    mkdirSync(join(root, "discord_nas_bridge", "app", "src"), { recursive: true });
    writeFileSync(join(root, "discord_nas_bridge", "app", "src", "index.ts"), "generated\n", "utf8");
    writeManifest(root);

    runNodeScript("scripts/nas-runtime-inventory-check.mjs", ["--root=.", "--write"], root);

    const inventory = JSON.parse(readFileSync(join(root, "nas-runtime-inventory.json"), "utf8")) as {
      files: Array<{ path: string; family: string }>;
    };
    const sourceEntry = inventory.files.find((entry) => entry.path === "src/index.ts");
    const generatedEntry = inventory.files.find((entry) => entry.path === "discord_nas_bridge/app/src/index.ts");

    expect(sourceEntry?.family).toBe("runtime-optional");
    expect(generatedEntry).toBeUndefined();
  });

  it("fails when a new file remains unclassified", () => {
    const root = createTempRepo();
    writeFileSync(join(root, "package.json"), "{}\n", "utf8");
    writeFileSync(join(root, "package-lock.json"), "{}\n", "utf8");
    writeFileSync(join(root, "tsconfig.json"), "{}\n", "utf8");
    writeFileSync(join(root, "mystery.bin"), "x\n", "utf8");
    writeManifest(root);

    let failed = false;
    try {
      runNodeScript("scripts/nas-runtime-inventory-check.mjs", ["--root=."], root);
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain("needs NAS bundle classification");
    }

    expect(failed).toBe(true);
  });

  it("keeps the optional NAS source-build compose file classified when regenerating inventory", () => {
    const root = createTempRepo();
    mkdirSync(join(root, "discord_nas_bridge"), { recursive: true });
    writeFileSync(join(root, "discord_nas_bridge", "docker-compose.build.yml"), "services: {}\n", "utf8");
    writeManifest(root);

    runNodeScript("scripts/nas-runtime-inventory-check.mjs", ["--root=.", "--write"], root);

    const inventory = JSON.parse(readFileSync(join(root, "nas-runtime-inventory.json"), "utf8")) as {
      files: Array<{ path: string; family: string; status: string }>;
    };
    const composeEntry = inventory.files.find((entry) => entry.path === "discord_nas_bridge/docker-compose.build.yml");

    expect(composeEntry).toMatchObject({
      family: "runtime-optional",
      status: "classified",
    });
  });
});

function createTempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "codex-discord-nas-inventory-"));
  tempDirs.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(
    join(root, "scripts", "nas-runtime-inventory-check.mjs"),
    readFileSync(join(process.cwd(), "scripts", "nas-runtime-inventory-check.mjs"), "utf8"),
    "utf8",
  );
  return root;
}

function writeManifest(root: string): void {
  writeFileSync(
    join(root, "nas-bundle.manifest.json"),
    `${JSON.stringify({
      packageName: "test-nas-bundle",
      include: ["package.json", "package-lock.json", "tsconfig.json", "src/**"],
      forbiddenPackageEntries: ["discord_nas_bridge/app"],
    }, null, 2)}\n`,
    "utf8",
  );
}

function runNodeScript(scriptPath: string, args: string[], cwd: string): string {
  return execFileSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}
