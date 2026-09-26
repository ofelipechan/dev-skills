#!/usr/bin/env node
// Single entry point for the Write|Edit hooks: one Node process per event instead of one per check.
//
//   node <dir>/bdd-hook.mjs --pre  --hook   PreToolUse  → bdd-gate
//   node <dir>/bdd-hook.mjs --post --hook   PostToolUse → check-feature (.feature) or check-test (test files)
//
// Reads stdin once (cached in bdd-lib), routes by file type, and imports the matching script,
// which then runs exactly as it would standalone. Files that match nothing exit immediately.
import { loadConfig, readStdinJson, toRel, isTestFile, isFeatureFile } from "./bdd-lib.mjs";

const args = process.argv.slice(2);
if (!args.includes("--hook")) process.exit(0);
const fp = readStdinJson()?.tool_input?.file_path;
if (!fp) process.exit(0);

if (args.includes("--pre")) {
  await import("./bdd-gate.mjs");
} else if (args.includes("--post")) {
  const cfg = loadConfig();
  const rel = toRel(fp);
  if (isFeatureFile(rel, cfg)) await import("./check-feature.mjs");
  else if (isTestFile(rel, cfg)) await import("./check-test.mjs");
}
