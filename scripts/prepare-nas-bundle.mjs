#!/usr/bin/env node
import { runCli } from "./build-nas-bundle.mjs";

const result = runCli(["--write", "--clean", ...process.argv.slice(2)]);
if (!result.ok) {
  process.exitCode = 1;
}
