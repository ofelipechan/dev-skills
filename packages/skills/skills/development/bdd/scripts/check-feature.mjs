#!/usr/bin/env node
// PostToolUse hook (Write|Edit) and CLI: lint a .feature file.
// Errors: scenario without exactly one pyramid tag, unknown tag, duplicate title.
// Warnings: phrasing violations (transport/implementation words in scenario text).
//
// CLI:   node <agent runtime dir>/check-feature.mjs [file ...]   (no args = all feature files)
// Hook:  --hook  reads {tool_input.file_path} from stdin.
import fs from "node:fs";
import path from "node:path";
import {
  loadConfig, readStdinJson, toRel, isFeatureFile, listFeatureFiles, parseFeature, phrasingViolations, finish,
} from "./bdd-lib.mjs";

const cfg = loadConfig();
const isHook = process.argv.includes("--hook");
let files;

if (isHook) {
  const input = readStdinJson();
  const fp = input?.tool_input?.file_path;
  if (!fp) process.exit(0);
  const rel = toRel(fp);
  if (!isFeatureFile(rel, cfg) || !fs.existsSync(fp)) process.exit(0);
  files = [rel];
} else {
  const cli = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  files = cli.length ? cli.map(toRel) : listFeatureFiles(cfg);
}

const errors = [];
const warnings = [];
const titleLocations = new Map();

for (const scenario of listFeatureFiles(cfg).flatMap(parseFeature)) {
  const loc = `${scenario.file}:${scenario.line}`;
  titleLocations.set(scenario.title, [...(titleLocations.get(scenario.title) ?? []), loc]);
}

for (const rel of files) {
  const scenarios = parseFeature(rel);
  const src = fs.readFileSync(path.resolve(rel), "utf8").split(/\r?\n/);

  for (const s of scenarios) {
    const loc = `${rel}:${s.line}`;
    const pyramid = s.tags.filter((t) => cfg.pyramidTags.includes(t));
    const unknown = s.tags.filter((t) => !cfg.pyramidTags.includes(t) && !cfg.modifierTags.includes(t));

    if (pyramid.length === 0) errors.push(`${loc} "${s.title}" has no pyramid tag (one of: ${cfg.pyramidTags.map((t) => "@" + t).join(" ")})`);
    if (pyramid.length > 1) errors.push(`${loc} "${s.title}" has ${pyramid.length} pyramid tags (${pyramid.map((t) => "@" + t).join(" ")}); exactly one allowed`);
    if (unknown.length) errors.push(`${loc} "${s.title}" has unknown tag(s): ${unknown.map((t) => "@" + t).join(" ")}`);

    const duplicateAt = (titleLocations.get(s.title) ?? []).find((other) => other !== loc);
    if (duplicateAt) errors.push(`${loc} duplicate scenario title "${s.title}" (also at ${duplicateAt})`);

    // Phrasing: title + steps until next blank/tag/scenario line.
    const body = [s.title];
    for (let i = s.line; i < src.length; i++) {
      const t = src[i].trim();
      if (t === "" || t.startsWith("@") || /^(Scenario|Examples|Rule|Background|Feature)/.test(t)) break;
      if (t.startsWith("#") || t.startsWith("|")) continue;
      body.push(t);
    }
    for (const line of body) {
      for (const v of phrasingViolations(line, cfg)) {
        warnings.push(`${loc} "${line}" -> "${v.match}": ${v.hint}`);
      }
    }
  }
}

if (!isHook && errors.length === 0) {
  const scenarioCount = files.flatMap(parseFeature).length;
  process.stdout.write(`[bdd:feature] ${files.length} file(s), ${scenarioCount} scenario(s), ${warnings.length} warning(s)\n`);
  for (const w of warnings) process.stdout.write("  - " + w + "\n");
  process.exit(0);
}
finish({ errors, warnings, label: "bdd:feature" });
