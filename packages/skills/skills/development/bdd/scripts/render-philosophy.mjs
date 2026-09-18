#!/usr/bin/env node
// Render docs/TESTING_PHILOSOPHY.md from the template, keeping only sections
// that match the project's traits.
//
//   node render-philosophy.mjs --detect                 print detected traits + language, exit
//   node render-philosophy.mjs --traits a,b --lang X    render to stdout
//   node render-philosophy.mjs --traits a,b --lang X --out docs/TESTING_PHILOSOPHY.md
//   (no --traits → auto-detect)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, "..", "references", "TESTING_PHILOSOPHY.template.md");
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const ALL_TRAITS = ["frontend", "http-api", "database", "e2e", "llm", "observability"];

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function collectPackageJsons(dir, depth = 0, acc = []) {
  if (depth > 3 || !fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collectPackageJsons(full, depth + 1, acc);
    else if (e.name === "package.json") acc.push(full);
  }
  return acc;
}

export function detect() {
  const pkgs = collectPackageJsons(ROOT).map(readJsonSafe).filter(Boolean);
  const deps = new Set(pkgs.flatMap((p) => Object.keys({ ...p.dependencies, ...p.devDependencies })));
  const has = (...names) => names.some((n) => deps.has(n));
  const exists = (...rels) => rels.some((r) => fs.existsSync(path.join(ROOT, r)));

  const traits = new Set();
  if (has("react", "vue", "svelte", "@angular/core", "next", "solid-js", "@testing-library/react", "jsdom")) traits.add("frontend");
  if (has("fastify", "express", "koa", "hono", "@nestjs/core", "next", "h3", "elysia")) traits.add("http-api");
  if (has("drizzle-orm", "prisma", "@prisma/client", "pg", "mysql2", "better-sqlite3", "typeorm", "knex", "mongoose", "sequelize") || exists("drizzle.config.ts", "prisma/schema.prisma")) traits.add("database");
  if (has("@playwright/test", "cypress", "puppeteer", "webdriverio") || exists("playwright.config.ts", "cypress.config.ts")) traits.add("e2e");
  if (has("openai", "@anthropic-ai/sdk", "@openrouter/sdk", "ai", "langchain", "@langchain/core", "ollama", "@google/generative-ai")) traits.add("llm");
  if (has("@langfuse/tracing", "langfuse", "@opentelemetry/api", "@opentelemetry/sdk-node", "@sentry/node", "pino", "winston", "@axiomhq/js")) traits.add("observability");

  let lang = "TypeScript";
  if (!pkgs.length) {
    if (exists("pyproject.toml", "requirements.txt")) lang = "Python";
    else if (exists("go.mod")) lang = "Go";
    else if (exists("Cargo.toml")) lang = "Rust";
    else if (exists("pom.xml", "build.gradle", "build.gradle.kts")) lang = "Java/Kotlin";
    else if (exists("Gemfile")) lang = "Ruby";
    else if (exists("*.csproj")) lang = "C#";
  } else if (!has("typescript") && !exists("tsconfig.json")) lang = "JavaScript";

  // Test levels already present vs. levels the stack could reasonably support.
  const scripts = new Set(pkgs.flatMap((p) => Object.keys(p.scripts ?? {})));
  const hasScript = (re) => [...scripts].some((s) => re.test(s));
  const testFiles = collectTestFiles(ROOT);
  const present = {
    unit: has("vitest", "jest", "mocha", "ava", "node:test", "tap", "uvu") || testFiles.length > 0,
    integration:
      hasScript(/integration|int$/) ||
      testFiles.some((f) => /\.(integration|int)\.(test|spec)\./.test(f)) ||
      has("supertest", "testcontainers", "@testcontainers/postgresql", "pg-mem", "msw", "nock", "light-my-request"),
    e2e: traits.has("e2e") || hasScript(/e2e/) || testFiles.some((f) => /\.e2e\./.test(f) || /(^|\/)e2e\//.test(f)),
  };
  const applicable = {
    unit: true,
    integration: traits.has("http-api") || traits.has("database") || traits.has("frontend"),
    e2e: traits.has("frontend") || traits.has("http-api"),
  };
  const suggested = Object.keys(applicable).filter((l) => applicable[l] && !present[l]);

  return { traits: [...traits], lang, levels: { present, applicable, suggested } };
}

function collectTestFiles(dir, depth = 0, acc = []) {
  if (depth > 6 || !fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collectTestFiles(full, depth + 1, acc);
    else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(e.name) || /_test\.(py|go)$/.test(e.name) || /^test_.*\.py$/.test(e.name)) {
      acc.push(path.relative(ROOT, full).split(path.sep).join("/"));
    }
  }
  return acc;
}

export function render(template, traits, lang) {
  const on = new Set(traits);
  let out = template.replace(/\r\n/g, "\n");

  // Strip the template header comment.
  out = out.replace(/^<!--\n[\s\S]*?\n-->\n/, "");

  // Block markers: keep content when trait is on, else drop the block (and the
  // line break that preceded the marker, so no blank line is left behind).
  out = out.replace(/(\n?)<!-- IF:([\w-]+) -->\n?([\s\S]*?)\n?<!-- ENDIF:\2 -->/g, (_, lead, trait, body) =>
    on.has(trait) ? lead + body : "",
  );

  // Line markers.
  out = out
    .split(/\r?\n/)
    .filter((line) => {
      const m = line.match(/<!-- only:([\w-]+) -->\s*$/);
      return !m || on.has(m[1]);
    })
    .map((line) => line.replace(/\s*<!-- only:[\w-]+ -->\s*$/, ""))
    .join("\n");

  out = out.replace(/\{\{EXAMPLE_LANGUAGE\}\}/g, lang);

  // Collapse 3+ blank lines left behind by removed blocks.
  out = out.replace(/\n{3,}/g, "\n\n");
  // No blank line right after a fence opener (openers carry a language; closers do not).
  out = out.replace(/(```\w+\n)\n+/g, "$1");
  return out.trimEnd() + "\n";
}

const detected = detect();
if (args.includes("--detect")) {
  process.stdout.write(JSON.stringify(detected, null, 2) + "\n");
  process.exit(0);
}

const traits = flag("--traits") !== undefined ? flag("--traits").split(",").map((s) => s.trim()).filter(Boolean) : detected.traits;
const unknown = traits.filter((t) => !ALL_TRAITS.includes(t));
if (unknown.length) {
  process.stderr.write(`unknown trait(s): ${unknown.join(", ")}; known: ${ALL_TRAITS.join(", ")}\n`);
  process.exit(1);
}
const lang = flag("--lang") ?? detected.lang;
const rendered = render(fs.readFileSync(TEMPLATE, "utf8"), traits, lang);

const outPath = flag("--out");
if (outPath) {
  fs.mkdirSync(path.dirname(path.resolve(ROOT, outPath)), { recursive: true });
  fs.writeFileSync(path.resolve(ROOT, outPath), rendered);
  process.stderr.write(`rendered ${outPath} (traits: ${traits.join(", ") || "none"}; language: ${lang})\n`);
} else {
  process.stdout.write(rendered);
}
