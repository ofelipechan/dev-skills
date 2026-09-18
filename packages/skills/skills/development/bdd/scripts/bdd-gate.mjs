#!/usr/bin/env node
// PreToolUse hook (Write|Edit): advisory reminder when production source is edited.
// Never blocks. Fires only for code files that are neither tests nor specs nor config/docs.
import { loadConfig, readStdinJson, toRel, isTestFile, isFeatureFile } from "./bdd-lib.mjs";

if (!process.argv.includes("--hook")) process.exit(0);
const cfg = loadConfig();
const input = readStdinJson();
const fp = input?.tool_input?.file_path;
if (!fp) process.exit(0);

const rel = toRel(fp);
const isCode = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|cs|php)$/.test(rel);
const isSetup = /(^|\/)(\.claude|scripts?|config|docs?|specs?|migrations?|seeds?)\//.test(rel) || /\.(config|setup|d)\.[cm]?[jt]sx?$/.test(rel);
if (!isCode || isSetup || isTestFile(rel, cfg) || isFeatureFile(rel, cfg)) process.exit(0);

const out = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext:
      `[bdd:gate] Editing production code (${rel}). BDD order is interview -> feature file -> approval -> tests -> code. ` +
      `If this edit adds or changes behaviour, confirm the scenario is approved in ${cfg.specsDir}/ and its bound test already exists (Red) before continuing. ` +
      `Pure refactor with green tests: proceed.`,
  },
};
process.stdout.write(JSON.stringify(out) + "\n");
