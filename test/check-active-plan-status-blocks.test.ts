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

describe("check-active-plan-status-blocks", () => {
  it("passes when every active plan starts with the required status block", () => {
    const root = createTempRepo();
    const activeDir = join(root, "docs", "codex-tasks", "plans", "pending", "active");
    mkdirSync(activeDir, { recursive: true });
    writeFileSync(
      join(activeDir, "plan.md"),
      [
        "# Example Plan",
        "",
        "Allapot: pending / aktiv foirany",
        "",
        "Kapcsolodo jelenlegi helyzet:",
        "- A terv aktiv.",
        "",
        "Elkeszult reszek:",
        "- Elso resz kesz.",
        "",
        "Nyitott reszek:",
        "- Masodik resz hatravan.",
        "",
        "## Reszletek",
        "",
        "Tovabbi tartalom.",
        "",
      ].join("\n"),
      "utf8",
    );

    const output = runNodeScript("scripts/check-active-plan-status-blocks.mjs", root);

    expect(output).toContain("Active plan status block check passed");
  });

  it("fails when the active plan does not contain the required block", () => {
    const root = createTempRepo();
    const activeDir = join(root, "docs", "codex-tasks", "plans", "pending", "active");
    mkdirSync(activeDir, { recursive: true });
    writeFileSync(join(activeDir, "broken-plan.md"), "# Broken Plan\n\n## Missing block\n", "utf8");

    let failed = false;
    try {
      runNodeScript("scripts/check-active-plan-status-blocks.mjs", root);
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain("missing required header 'Allapot:'");
    }

    expect(failed).toBe(true);
  });
});

function createTempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "codex-discord-plan-check-"));
  tempDirs.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(
    join(root, "scripts", "check-active-plan-status-blocks.mjs"),
    readFileSync(join(process.cwd(), "scripts", "check-active-plan-status-blocks.mjs"), "utf8"),
    "utf8",
  );
  return root;
}

function runNodeScript(scriptPath: string, cwd: string): string {
  return execFileSync(process.execPath, [scriptPath], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}
