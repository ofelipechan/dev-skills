#!/usr/bin/env node
// PreToolUse hook (Write|Edit): gate production and test edits on the BDD run state.
//   no run state      → advisory reminder on production edits, never blocks
//   phase "plan"      → denies production and test edits (Gate 1 not passed yet)
//   phase "implement" → silent (scenarios approved)
// Config, docs, specs and setup files always pass.
import { loadConfig, readStdinJson, readState, statePath, toRel, isTestFile, isFeatureFile } from "./bdd-lib.mjs";

if (!process.argv.includes("--hook")) process.exit(0);
const cfg = loadConfig();
const input = readStdinJson();
const fp = input?.tool_input?.file_path;
if (!fp) process.exit(0);

const rel = toRel(fp);
const isCode = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|cs|php)$/.test(rel);
const isSetup = /(^|\/)(\.claude|\.agents|scripts?|config|docs?|specs?|migrations?|seeds?)\//.test(rel) || /\.(config|setup|d)\.[cm]?[jt]sx?$/.test(rel);
if (!isCode || isSetup || isFeatureFile(rel, cfg)) process.exit(0);
const isTest = isTestFile(rel, cfg);

const state = readState();
if (state?.phase === "implement") process.exit(0);

let out;
if (state?.phase === "plan") {
  out = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `[bdd:gate] BDD run is in the plan phase: ${isTest ? "test" : "production"} files stay untouched until the user approves the scenarios (Gate 1). ` +
        `After approval run bdd-state.mjs implement; to abandon the run, bdd-state.mjs done (state: ${toRel(statePath())}).`,
    },
  };
} else {
  if (isTest) process.exit(0);
  out = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext:
        `[bdd:gate] Editing production code (${rel}). BDD order is interview -> feature file -> approval -> tests -> code. ` +
        `If this edit adds or changes behaviour, confirm the scenario is approved in ${cfg.specsDir}/ and its bound test already exists (Red) before continuing. ` +
        `Pure refactor with green tests: proceed.`,
    },
  };
}
process.stdout.write(JSON.stringify(out) + "\n");
