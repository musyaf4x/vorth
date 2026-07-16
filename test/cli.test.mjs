import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  countMarker,
  createTempRepo,
  installFakeCodeGraph,
  projectRoot,
  readJson,
  runCli
} from "./helpers.mjs";

test("init is a single deterministic CLI operation with compact JSON output", (t) => {
  const repo = createTempRepo(t);
  const fake = installFakeCodeGraph(t);
  const result = runCli(["init", "--repo", repo, "--json"], { env: fake.env });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.length < 3072, `init JSON is ${result.stdout.length} bytes`);
  const output = JSON.parse(result.stdout);
  assert.equal(output.command, "init");
  assert.equal(output.lifecycle, "active");
  assert.equal(output.codegraph.init.status, "initialized");

  assert.ok(fs.existsSync(path.join(repo, ".vorth", "vorth.config.json")));
  assert.ok(fs.existsSync(path.join(repo, ".vorth", "runtime.md")));
  assert.ok(fs.existsSync(path.join(repo, ".codegraph")));

  const calls = fs.readFileSync(fake.logPath, "utf8").split(/\r?\n/).filter(Boolean);
  assert.equal(calls.filter((line) => line.trim() === "init").length, 1);

  const agents = fs.readFileSync(path.join(repo, "AGENTS.md"), "utf8");
  const gemini = fs.readFileSync(path.join(repo, "GEMINI.md"), "utf8");
  assert.equal(countMarker(agents, "<!-- VORTH:START -->"), 1);
  assert.equal(countMarker(gemini, "<!-- VORTH:START -->"), 1);
});

test("partial re-init preserves every option that was not explicitly passed", (t) => {
  const repo = createTempRepo(t);
  let result = runCli([
    "init", "--repo", repo, "--json", "--bridge", "enabled",
    "--codegraph", "disabled", "--layers", "disabled", "--rtk", "disabled"
  ]);
  assert.equal(result.status, 0, result.stderr);

  result = runCli(["init", "--repo", repo, "--json", "--impeccable", "enabled"]);
  assert.equal(result.status, 0, result.stderr);

  const config = readJson(path.join(repo, ".vorth", "vorth.config.json"));
  assert.equal(config.bridge, "enabled");
  assert.equal(config.codegraph, "disabled");
  assert.equal(config.layers, "disabled");
  assert.equal(config.rtk, "disabled");
  assert.equal(config.impeccable, "enabled");
});

test("runtime is compact and omits disabled stack instructions", (t) => {
  const repo = createTempRepo(t);
  const result = runCli([
    "init", "--repo", repo, "--json", "--bridge", "disabled",
    "--codegraph", "disabled", "--impeccable", "disabled",
    "--layers", "disabled", "--ponytail", "disabled",
    "--rtk", "disabled", "--caveman", "disabled"
  ]);
  assert.equal(result.status, 0, result.stderr);

  const runtime = fs.readFileSync(path.join(repo, ".vorth", "runtime.md"), "utf8");
  assert.ok(Buffer.byteLength(runtime) < 5120);
  assert.doesNotMatch(runtime, /instructions[\\/]codegraph\.md/i);
  assert.doesNotMatch(runtime, /instructions[\\/]impeccable\.md/i);
  assert.doesNotMatch(runtime, /instructions[\\/]rtk\.md/i);
  assert.match(runtime, /configuration is authoritative/i);
});

test("status reports an uninitialized repository as inactive without implied defaults", (t) => {
  const repo = createTempRepo(t);
  const result = runCli(["status", "--repo", repo, "--json"]);
  assert.equal(result.status, 0, result.stderr);

  const status = JSON.parse(result.stdout);
  assert.ok(result.stdout.length < 4096, `inactive status JSON is ${result.stdout.length} bytes`);
  assert.equal(status.lifecycle, "inactive");
  assert.equal(status.guardStacks, null);
  assert.equal(status.conditionalStacks, null);
  assert.equal(status.agyNativeBridge.selfTest.status, "not_requested");
});

test("init refuses malformed managed markers before writing Vorth files", (t) => {
  const repo = createTempRepo(t);
  fs.writeFileSync(path.join(repo, "AGENTS.md"), "user content\n<!-- VORTH:START -->\nbroken\n", "utf8");
  const result = runCli(["init", "--repo", repo, "--json", "--codegraph", "disabled"]);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).message, /malformed.*marker/i);
  assert.equal(fs.existsSync(path.join(repo, ".vorth")), false);
  assert.equal(countMarker(fs.readFileSync(path.join(repo, "AGENTS.md"), "utf8"), "<!-- VORTH:START -->"), 1);
});

test("reset removes Vorth activation but preserves project and external stack assets", (t) => {
  const repo = createTempRepo(t);
  fs.writeFileSync(path.join(repo, "AGENTS.md"), "# User instructions\n", "utf8");
  fs.mkdirSync(path.join(repo, ".codegraph"));
  fs.writeFileSync(path.join(repo, ".codegraph", "keep"), "yes", "utf8");

  let result = runCli(["init", "--repo", repo, "--json", "--codegraph", "disabled"]);
  assert.equal(result.status, 0, result.stderr);
  result = runCli(["reset", "--repo", repo, "--confirm", "--json"]);
  assert.equal(result.status, 0, result.stderr);

  assert.equal(fs.existsSync(path.join(repo, ".vorth")), false);
  assert.equal(fs.existsSync(path.join(repo, ".codegraph", "keep")), true);
  const agents = fs.readFileSync(path.join(repo, "AGENTS.md"), "utf8");
  assert.match(agents, /^# User instructions/m);
  assert.doesNotMatch(agents, /VORTH:START/);
});

test("bootstrap files stay within provider-neutral byte budgets", () => {
  const skill = fs.readFileSync(path.join(projectRoot, "SKILL.md"));
  const agents = fs.readFileSync(path.join(projectRoot, "templates", "project", "AGENTS.block.md"));
  const gemini = fs.readFileSync(path.join(projectRoot, "templates", "project", "GEMINI.block.md"));
  assert.ok(skill.length <= 6144, `SKILL.md is ${skill.length} bytes`);
  assert.ok(agents.length <= 1536, `AGENTS.block.md is ${agents.length} bytes`);
  assert.ok(gemini.length <= 1536, `GEMINI.block.md is ${gemini.length} bytes`);
});

test("init is idempotent and Git hygiene excludes only Vorth runtime data", (t) => {
  const repo = createTempRepo(t);
  let result = runCli(["init", "--repo", repo, "--json", "--codegraph", "disabled"]);
  assert.equal(result.status, 0, result.stderr);
  const firstConfig = fs.readFileSync(path.join(repo, ".vorth", "vorth.config.json"), "utf8");
  const firstRuntime = fs.readFileSync(path.join(repo, ".vorth", "runtime.md"), "utf8");

  result = runCli(["init", "--repo", repo, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(repo, ".vorth", "vorth.config.json"), "utf8"), firstConfig);
  assert.equal(fs.readFileSync(path.join(repo, ".vorth", "runtime.md"), "utf8"), firstRuntime);

  const exclude = fs.readFileSync(path.join(repo, ".git", "info", "exclude"), "utf8");
  const block = exclude.match(/# VORTH:GIT-EXCLUDE:START[\s\S]*?# VORTH:GIT-EXCLUDE:END/)?.[0] || "";
  assert.match(block, /^\.vorth\/$/m);
  assert.match(block, /^\.codegraph\/$/m);
  assert.doesNotMatch(block, /^\.agents?\/$/m);
  assert.doesNotMatch(block, /^\.codex\/$/m);
  assert.doesNotMatch(block, /^\.gemini\/$/m);
});

test("legacy Markdown config migrates to authoritative JSON without losing choices", (t) => {
  const repo = createTempRepo(t);
  fs.mkdirSync(path.join(repo, ".vorth"));
  fs.writeFileSync(path.join(repo, ".vorth", "vorth.config.md"), [
    "# Legacy Vorth Config",
    "agy_native_bridge: enabled",
    "codegraph: disabled",
    "layers: enabled",
    "rtk: disabled"
  ].join("\n"), "utf8");

  const result = runCli(["init", "--repo", repo, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const config = readJson(path.join(repo, ".vorth", "vorth.config.json"));
  assert.equal(config.bridge, "enabled");
  assert.equal(config.codegraph, "disabled");
  assert.equal(config.layers, "enabled");
  assert.equal(config.rtk, "disabled");
});

test("dry-run and setup approval checks do not perform external installation", (t) => {
  const repo = createTempRepo(t);
  let result = runCli(["init", "--repo", repo, "--json", "--dry-run"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(repo, ".vorth")), false);

  result = runCli(["init", "--repo", repo, "--json", "--codegraph", "disabled"]);
  assert.equal(result.status, 0, result.stderr);
  result = runCli([
    "setup", "--repo", repo, "--stack", "impeccable", "--allow-network", "--confirm", "--dry-run", "--json"
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "dry_run");
  assert.equal(fs.existsSync(path.join(repo, ".agents", "skills", "impeccable")), false);

  result = runCli(["setup", "--repo", repo, "--stack", "impeccable", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "approval_required");
  assert.equal(output.results[0].status, "approval_required");
});

test("doctor and argument validation return machine-readable nonzero errors", (t) => {
  const repo = createTempRepo(t);
  let result = runCli(["doctor", "--repo", repo, "--json"]);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).status, "unhealthy");

  result = runCli(["init", "--repo", repo, "--unknown-option", "yes", "--json"]);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).message, /unknown option/i);
  assert.equal(fs.existsSync(path.join(repo, ".vorth")), false);
});

test("CodeGraph setup wiring uses the official project-local command", (t) => {
  const repo = createTempRepo(t);
  const fake = installFakeCodeGraph(t);
  let result = runCli(["init", "--repo", repo, "--json"], { env: fake.env });
  assert.equal(result.status, 0, result.stderr);
  result = runCli([
    "setup", "--repo", repo, "--stack", "codegraph", "--wire", "--confirm", "--json"
  ], { env: fake.env });
  assert.equal(result.status, 0, result.stderr);
  const calls = fs.readFileSync(fake.logPath, "utf8").split(/\r?\n/).filter(Boolean);
  assert.ok(calls.some((line) => line.trim() === "install --target=auto --location=local --yes"), calls.join("\n"));
});
