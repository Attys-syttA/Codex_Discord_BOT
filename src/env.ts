import { existsSync, readFileSync } from "node:fs";

export function loadEnvFile(envPath = ".env", env: NodeJS.ProcessEnv = process.env): void {
  if (!existsSync(envPath)) {
    return;
  }

  const contents = readFileSync(envPath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    if (!key || env[key] !== undefined) {
      continue;
    }

    env[key] = unquoteEnvValue(normalized.slice(separatorIndex + 1).trim());
  }
}

export function loadDefaultEnvFiles(env: NodeJS.ProcessEnv = process.env): void {
  const configuredPath = env.CODEX_DISCORD_ENV_FILE?.trim();
  if (configuredPath) {
    loadEnvFile(configuredPath, env);
    return;
  }

  for (const candidate of [".env", ".env.nas"]) {
    if (existsSync(candidate)) {
      loadEnvFile(candidate, env);
      return;
    }
  }
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replace(/\\n/g, "\n");
  }
  return value;
}
