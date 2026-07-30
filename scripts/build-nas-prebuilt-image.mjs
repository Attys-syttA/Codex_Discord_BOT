import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const bridgeDir = path.join(repoRoot, "discord_nas_bridge");
const dockerfile = path.join(bridgeDir, "Dockerfile");
const outputDir = path.join(repoRoot, "dist", "nas-images");
const outputTar = path.join(outputDir, "codex-discord-bridge-nas-arm64.tar");
const imageTag = "codex-discord-bridge:nas-arm64";

mkdirSync(outputDir, { recursive: true });

run("docker", [
  "buildx",
  "build",
  "--platform",
  "linux/arm64",
  "--pull",
  "--provenance=false",
  "--tag",
  imageTag,
  "--load",
  "-f",
  dockerfile,
  bridgeDir,
]);

run("docker", ["save", "-o", outputTar, imageTag]);

console.log(`NAS ARM64 image exported to: ${outputTar}`);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
