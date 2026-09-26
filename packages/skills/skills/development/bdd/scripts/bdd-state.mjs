#!/usr/bin/env node
// Record the phase of the current /bdd run so hooks and a later session know where it stands.
// The file (.claude/bdd-run.json or .agents/bdd-run.json) is local state; keep it gitignored.
//
//   node <dir>/bdd-state.mjs plan [--track S|M|L]
//   node <dir>/bdd-state.mjs implement --track M --feature <path> [--feature <path>] --scenario "<title>" [...]
//   node <dir>/bdd-state.mjs done        remove the state (run finished or abandoned)
//   node <dir>/bdd-state.mjs show        print the state (null when absent or older than 12 h)
import fs from "node:fs";
import { readState, statePath } from "./bdd-lib.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const values = (flag) => rest.flatMap((a, i) => (a === flag && rest[i + 1] !== undefined ? [rest[i + 1]] : []));

if (cmd === "show") {
  process.stdout.write(JSON.stringify(readState(), null, 2) + "\n");
  process.exit(0);
}
if (cmd === "done") {
  fs.rmSync(statePath(), { force: true });
  process.stdout.write("[bdd:state] cleared\n");
  process.exit(0);
}
if (cmd !== "plan" && cmd !== "implement") {
  process.stderr.write("usage: bdd-state.mjs plan|implement|done|show [--track S|M|L] [--feature <path>]... [--scenario <title>]...\n");
  process.exit(2);
}

const previous = readState() ?? {};
const state = {
  phase: cmd,
  track: values("--track")[0] ?? previous.track ?? null,
  features: values("--feature").length ? values("--feature") : previous.features ?? [],
  scenarios: values("--scenario").length ? values("--scenario") : previous.scenarios ?? [],
  updatedAt: new Date().toISOString(),
};
if (cmd === "implement" && state.scenarios.length === 0) {
  process.stderr.write("[bdd:state] implement needs the approved --scenario titles\n");
  process.exit(2);
}
fs.writeFileSync(statePath(), JSON.stringify(state, null, 2) + "\n");
process.stdout.write(`[bdd:state] ${state.phase}${state.track ? ` · track ${state.track}` : ""} · ${state.scenarios.length} scenario(s)\n`);
