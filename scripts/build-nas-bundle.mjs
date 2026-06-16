#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_INVENTORY,
  DEFAULT_MANIFEST,
  runCli as runInventoryCli,
  validateNasRuntimeInventory,
} from "./nas-runtime-inventory-check.mjs";

const scriptFile = fileURLToPath(import.meta.url);
const PACKAGE_BUILD_MANIFEST = "nas-bundle.resolved.json";

function normalizeRelativePath(value) {
  return String(value).replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\/+$/, "");
}

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    manifest: null,
    inventory: null,
    bundleRoot: null,
    write: false,
    clean: false,
    json: false,
  };

  for (const arg of argv) {
    if (arg === "--write") {
      options.write = true;
    } else if (arg === "--clean") {
      options.clean = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg.startsWith("--root=")) {
      options.root = arg.slice("--root=".length);
    } else if (arg.startsWith("--manifest=")) {
      options.manifest = arg.slice("--manifest=".length);
    } else if (arg.startsWith("--inventory=")) {
      options.inventory = arg.slice("--inventory=".length);
    } else if (arg.startsWith("--bundle-root=")) {
      options.bundleRoot = arg.slice("--bundle-root=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.root = path.resolve(options.root);
  options.manifest = path.resolve(options.root, options.manifest ?? DEFAULT_MANIFEST);
  options.inventory = path.resolve(options.root, options.inventory ?? DEFAULT_INVENTORY);
  options.bundleRoot = options.bundleRoot
    ? path.resolve(options.bundleRoot)
    : path.resolve(options.root, "discord_nas_bridge", "app");
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isWildcard(pattern) {
  return normalizeRelativePath(pattern).endsWith("/**");
}

function patternBase(pattern) {
  return normalizeRelativePath(pattern).replace(/\/\*\*$/, "");
}

function collectFiles(root) {
  const files = [];
  if (!fs.existsSync(root)) return files;
  const stack = [""];
  while (stack.length > 0) {
    const relativeDir = stack.pop();
    const absoluteDir = path.join(root, relativeDir);
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const relativePath = normalizeRelativePath(path.join(relativeDir, entry.name));
      if (entry.isDirectory()) {
        stack.push(relativePath);
      } else {
        files.push(relativePath);
      }
    }
  }
  return files.sort();
}

function matchesForbiddenPath(relativePath, forbiddenEntry) {
  const target = normalizeRelativePath(relativePath).toLowerCase();
  const forbidden = normalizeRelativePath(forbiddenEntry).toLowerCase();
  if (forbidden.includes("*")) {
    const regex = new RegExp(`^${forbidden.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*")}$`);
    return regex.test(target);
  }
  return target === forbidden || target.startsWith(`${forbidden}/`);
}

export function resolveCopyPlan(manifest, root) {
  const include = Array.isArray(manifest.include) ? manifest.include.map(normalizeRelativePath) : [];
  const forbidden = Array.isArray(manifest.forbiddenPackageEntries)
    ? manifest.forbiddenPackageEntries.map(normalizeRelativePath)
    : [];

  const sourceFiles = new Set();
  const skipped = [];

  function shouldSkip(relativePath) {
    const forbiddenMatch = forbidden.find((entry) => matchesForbiddenPath(relativePath, entry));
    if (forbiddenMatch) return `forbidden by manifest: ${forbiddenMatch}`;
    return null;
  }

  for (const item of include) {
    const base = patternBase(item);
    const absoluteBase = path.join(root, base);
    if (!fs.existsSync(absoluteBase)) {
      throw new Error(`Manifest include entry does not exist: ${item}`);
    }

    const candidates = isWildcard(item)
      ? collectFiles(absoluteBase).map((file) => normalizeRelativePath(path.join(base, file)))
      : [base];

    for (const candidate of candidates) {
      const reason = shouldSkip(candidate);
      if (reason) {
        skipped.push({ file: candidate, reason });
      } else {
        sourceFiles.add(candidate);
      }
    }
  }

  return {
    files: [...sourceFiles].sort(),
    skipped,
  };
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function removeChildren(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  for (const entry of fs.readdirSync(targetPath)) {
    fs.rmSync(path.join(targetPath, entry), { recursive: true, force: true });
  }
}

function assertSafeBundleRoot(bundleRoot, repoRoot) {
  const normalized = path.resolve(bundleRoot);
  const expected = path.resolve(repoRoot, "discord_nas_bridge", "app");
  if (normalized !== expected) {
    throw new Error(`Unsafe bundle root refused: ${bundleRoot}`);
  }
}

function copyPlanToBundle(plan, root, bundleRoot) {
  for (const relativePath of plan.files) {
    const source = path.join(root, relativePath);
    const target = path.join(bundleRoot, relativePath);
    ensureDir(path.dirname(target));
    fs.copyFileSync(source, target);
  }
}

function buildResolvedManifest(plan, inventory, manifest) {
  const inventoryByPath = new Map(
    Array.isArray(inventory.files) ? inventory.files.map((entry) => [normalizeRelativePath(entry.path), entry]) : [],
  );

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    packageName: manifest.packageName ?? "codex-discord-bot-nas-bridge",
    sources: {
      manifest: DEFAULT_MANIFEST,
      inventory: DEFAULT_INVENTORY,
    },
    files: plan.files.map((file) => {
      const entry = inventoryByPath.get(normalizeRelativePath(file));
      return {
        path: normalizeRelativePath(file),
        family: entry?.family ?? "unknown",
      };
    }),
    skipped: plan.skipped,
  };
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const manifest = readJson(options.manifest);

  const inventoryWrite = runInventoryCli([
    `--root=${options.root}`,
    `--manifest=${options.manifest}`,
    `--inventory=${options.inventory}`,
    ...(options.write ? ["--write"] : []),
  ]);
  if (!inventoryWrite.ok) {
    return inventoryWrite;
  }

  const inventory = readJson(options.inventory);
  const plan = resolveCopyPlan(manifest, options.root);
  const validation = validateNasRuntimeInventory({
    inventory,
    manifest,
    currentFiles: inventory.files.map((entry) => entry.path),
    packageFiles: plan.files,
  });

  if (!validation.ok) {
    if (options.json) {
      console.log(JSON.stringify(validation, null, 2));
    } else {
      for (const issue of validation.issues) {
        console.error(`${issue.id}: ${issue.message}`);
      }
    }
    return validation;
  }

  if (!options.write) {
    console.log(`NAS bundle preflight passed. ${plan.files.length} files would be packaged.`);
    return { ok: true, plan };
  }

  assertSafeBundleRoot(options.bundleRoot, options.root);
  ensureDir(options.bundleRoot);
  if (options.clean) {
    removeChildren(options.bundleRoot);
  }

  copyPlanToBundle(plan, options.root, options.bundleRoot);
  fs.writeFileSync(
    path.join(options.bundleRoot, ".bundle-generated.txt"),
    [
      "Generated by scripts/build-nas-bundle.mjs",
      `Generated at: ${new Date().toISOString()}`,
      `Manifest: ${path.relative(options.root, options.manifest)}`,
      `Inventory: ${path.relative(options.root, options.inventory)}`,
      "",
      "This app/ directory is a deploy bundle for Synology/NAS Docker builds.",
      "Do not edit it manually. Regenerate it from the repository root before upload.",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(options.bundleRoot, PACKAGE_BUILD_MANIFEST),
    `${JSON.stringify(buildResolvedManifest(plan, inventory, manifest), null, 2)}\n`,
    "utf8",
  );

  console.log(`NAS bundle updated at: ${options.bundleRoot}`);
  return { ok: true, plan, bundleRoot: options.bundleRoot };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptFile) {
  const result = runCli();
  if (!result.ok) {
    process.exitCode = 1;
  }
}
