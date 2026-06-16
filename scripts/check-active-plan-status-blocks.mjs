import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ACTIVE_PLANS_DIR = join(process.cwd(), "docs", "codex-tasks", "plans", "pending", "active");
const REQUIRED_SECTIONS = [
  { label: "Allapot:", mode: "inline" },
  { label: "Kapcsolodo jelenlegi helyzet:", mode: "block" },
  { label: "Elkeszult reszek:", mode: "block" },
  { label: "Nyitott reszek:", mode: "block" },
];

main();

function main() {
  const issues = [];

  if (!exists(ACTIVE_PLANS_DIR)) {
    console.log("Active plan directory does not exist yet; skipping status block check.");
    return;
  }

  const files = collectMarkdownFiles(ACTIVE_PLANS_DIR).filter((filePath) => !filePath.endsWith(".gitkeep"));

  for (const filePath of files) {
    const content = readFileSync(filePath, "utf8");
    const relativePath = relative(process.cwd(), filePath).replaceAll("\\", "/");
    const blockIssues = validateActivePlan(content);

    for (const issue of blockIssues) {
      issues.push(`${relativePath}: ${issue}`);
    }
  }

  if (issues.length > 0) {
    console.error("Active plan status block check failed.");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Active plan status block check passed for ${files.length} file(s).`);
}

function validateActivePlan(content) {
  const issues = [];
  const lines = content.split(/\r?\n/);
  const trimmedLines = lines.map((line) => line.trim());
  let cursor = 0;

  if (!trimmedLines[0]?.startsWith("# ")) {
    issues.push("the file should start with a Markdown title line");
    return issues;
  }

  cursor = skipBlankLines(trimmedLines, 1);

  for (const section of REQUIRED_SECTIONS) {
    const headerIndex = trimmedLines.findIndex((line, index) => index >= cursor && line.startsWith(section.label));
    if (headerIndex === -1) {
      issues.push(`missing required header '${section.label}'`);
      return issues;
    }
    if (headerIndex !== cursor) {
      issues.push(`expected '${section.label}' immediately after the previous section`);
      return issues;
    }

    if (section.mode === "inline") {
      const value = trimmedLines[headerIndex].slice(section.label.length).trim();
      if (value.length === 0) {
        issues.push(`header '${section.label}' must contain an inline value`);
        return issues;
      }
      cursor = skipBlankLines(trimmedLines, headerIndex + 1);
      continue;
    }

    const nextCursor = findSectionEnd(trimmedLines, headerIndex + 1);
    if (nextCursor === headerIndex + 1) {
      issues.push(`header '${section.label}' must contain at least one content line`);
      return issues;
    }
    cursor = skipBlankLines(trimmedLines, nextCursor);
  }

  return issues;
}

function findSectionEnd(lines, startIndex) {
  let index = startIndex;
  while (index < lines.length && lines[index] !== "") {
    index += 1;
  }
  return index;
}

function skipBlankLines(lines, startIndex) {
  let index = startIndex;
  while (index < lines.length && lines[index] === "") {
    index += 1;
  }
  return index;
}

function collectMarkdownFiles(rootDir) {
  const entries = readdirSync(rootDir).sort((left, right) => left.localeCompare(right, "en"));
  const results = [];

  for (const entry of entries) {
    const fullPath = join(rootDir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      results.push(...collectMarkdownFiles(fullPath));
      continue;
    }
    if (entry.toLowerCase().endsWith(".md")) {
      results.push(fullPath);
    }
  }

  return results;
}

function exists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
