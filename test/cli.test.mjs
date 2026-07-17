import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  countMarker,
  createTempDirectory,
  createTempRepo,
  installFakeAntigravityCli,
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

test("legacy installed ECC state migrates through its minimal profile", (t) => {
  const repo = createTempRepo(t);
  fs.mkdirSync(path.join(repo, ".vorth"));
  fs.writeFileSync(path.join(repo, ".vorth", "vorth.config.md"), [
    "# Legacy Vorth Config",
    "ecc_antigravity: installed",
    "ecc_antigravity_profile: minimal",
    "ecc_codex: skipped",
    "agy_native_bridge: enabled",
    "codegraph: disabled"
  ].join("\n"), "utf8");

  let result = runCli(["status", "--repo", repo, "--json"]);
  assert.equal(result.status, 0, result.stdout || result.stderr);
  assert.equal(JSON.parse(result.stdout).config.values.eccAntigravity, "minimal");

  result = runCli(["init", "--repo", repo, "--json"]);
  assert.equal(result.status, 0, result.stdout || result.stderr);
  const config = readJson(path.join(repo, ".vorth", "vorth.config.json"));
  assert.equal(config.eccAntigravity, "minimal");
  assert.equal(config.eccCodex, "skipped");
  assert.equal(config.bridge, "enabled");
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

test("ECC Codex setup uses the official minimal target with native approval", { skip: process.platform !== "win32" }, (t) => {
  const repo = createTempRepo(t);
  const home = createTempDirectory(t, "ecc-home");
  const codexHome = path.join(home, ".codex");
  const env = { HOME: home, CODEX_HOME: codexHome };
  const disabled = [
    "--superpowers", "disabled", "--ecc-antigravity", "disabled",
    "--codegraph", "disabled", "--impeccable", "disabled", "--layers", "disabled",
    "--ponytail", "disabled", "--rtk", "disabled", "--caveman", "disabled", "--bridge", "disabled"
  ];
  let result = runCli(["init", "--repo", repo, "--preset", "agy-codex", ...disabled, "--json"], { env });
  assert.equal(result.status, 0, result.stderr);

  const vendor = path.join(repo, ".vorth", "vendor", "everything-claude-code");
  fs.mkdirSync(vendor, { recursive: true });
  fs.writeFileSync(path.join(vendor, "install.ps1"), [
    "$isDryRun = $args -contains '--dry-run'",
    "Write-Output ($args -join ' ')",
    "if (-not $isDryRun) {",
    "  $root = Join-Path $env:HOME '.codex'",
    "  New-Item -ItemType Directory -Force -Path $root | Out-Null",
    "  Set-Content -LiteralPath (Join-Path $root 'ecc-install-state.json') -Value '{}'",
    "}"
  ].join("\n"), "utf8");

  result = runCli([
    "setup", "--repo", repo, "--stack", "ecc", "--target", "codex",
    "--allow-network", "--confirm", "--json"
  ], { env });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "approval_required");

  result = runCli([
    "setup", "--repo", repo, "--stack", "ecc", "--target", "codex",
    "--allow-network", "--allow-native", "--confirm", "--json"
  ], { env });
  assert.equal(result.status, 0, result.stderr);
  const setup = JSON.parse(result.stdout);
  assert.equal(setup.status, "ok");
  assert.equal(setup.results[0].status, "installed");
  assert.match(setup.results[0].preview.output, /--profile minimal --target codex --dry-run/);
  assert.match(setup.results[0].output, /--profile minimal --target codex/);

  result = runCli(["status", "--repo", repo, "--json"], { env });
  assert.equal(result.status, 0, result.stderr);
  const status = JSON.parse(result.stdout);
  assert.equal(status.ecc.codex.health, "healthy");
  assert.equal(status.ecc.codex.installState, true);
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

test("agy-codex CodeGraph wiring requires native approval and targets both harnesses", (t) => {
  const repo = createTempRepo(t);
  const fake = installFakeCodeGraph(t);
  let result = runCli(["init", "--repo", repo, "--preset", "agy-codex", "--bridge", "disabled", "--json"], { env: fake.env });
  assert.equal(result.status, 0, result.stderr);

  result = runCli(["setup", "--repo", repo, "--stack", "codegraph", "--wire", "--confirm", "--json"], { env: fake.env });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "approval_required");

  result = runCli([
    "setup", "--repo", repo, "--stack", "codegraph", "--wire", "--confirm", "--allow-native", "--json"
  ], { env: fake.env });
  assert.equal(result.status, 0, result.stderr);
  const calls = fs.readFileSync(fake.logPath, "utf8").split(/\r?\n/).filter(Boolean);
  assert.ok(calls.some((line) => line.trim() === "install --target=antigravity,codex --location=global --yes"), calls.join("\n"));
});

test("configured agy-codex preset becomes the default for new repositories", (t) => {
  const repo = createTempRepo(t);
  const vorthHome = createTempDirectory(t, "vorth-home");
  const env = { VORTH_HOME: vorthHome };

  let result = runCli(["configure", "--preset", "agy-codex", "--json"], { env });
  assert.equal(result.status, 0, result.stderr);
  result = runCli(["init", "--repo", repo, "--codegraph", "disabled", "--json"], { env });
  assert.equal(result.status, 0, result.stderr);

  const config = readJson(path.join(repo, ".vorth", "vorth.config.json"));
  assert.equal(config.schemaVersion, 2);
  assert.equal(config.preset, "agy-codex");
  assert.equal(config.bridge, "enabled");
  assert.equal(config.bridgeProfile, "worker");
  assert.equal(config.eccAntigravity, "minimal");
  assert.equal(config.eccCodex, "minimal");
});

test("repair JSON produces a declarative plan without applying external changes", (t) => {
  const repo = createTempRepo(t);
  const vorthHome = createTempDirectory(t, "vorth-home");
  const env = { VORTH_HOME: vorthHome };
  let result = runCli(["init", "--repo", repo, "--preset", "agy-codex", "--codegraph", "disabled", "--json"], { env });
  assert.equal(result.status, 0, result.stderr);

  result = runCli(["repair", "--repo", repo, "--json"], { env });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "approval_required");
  assert.ok(output.plan.some((item) => item.stack === "superpowers"));
  assert.ok(output.plan.some((item) => item.stack === "ecc"));
  assert.ok(output.plan.some((item) => item.stack === "bridge"));
  assert.equal(fs.existsSync(path.join(vorthHome, "bridge", "server.mjs")), false);
});

test("doctor does not report Git hygiene as broken outside a Git repository", (t) => {
  const directory = createTempDirectory(t, "plain-project");
  const disabled = [
    "--superpowers", "disabled", "--ecc-antigravity", "disabled", "--ecc-codex", "disabled",
    "--codegraph", "disabled", "--impeccable", "disabled", "--layers", "disabled",
    "--ponytail", "disabled", "--rtk", "disabled", "--caveman", "disabled", "--bridge", "disabled"
  ];
  let result = runCli(["init", "--repo", directory, ...disabled, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  result = runCli(["doctor", "--repo", directory, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "healthy");
  assert.equal(output.readiness.status, "ready");
  assert.equal(output.issues.some((issue) => issue.code === "git_hygiene_missing"), false);
});

test("approved init installs one stable bridge router and initializes its worker profile", (t) => {
  const repo = createTempRepo(t);
  const vorthHome = createTempDirectory(t, "vorth-home");
  const appData = createTempDirectory(t, "app-data");
  const mcpConfig = path.join(appData, "Antigravity IDE", "User", "mcp.json");
  const fakeAgy = installFakeAntigravityCli(t);
  const env = {
    VORTH_HOME: vorthHome,
    APPDATA: appData,
    ANTIGRAVITY_IDE_CLI: fakeAgy.cliPath
  };
  const disabled = [
    "--superpowers", "disabled", "--ecc-antigravity", "disabled", "--ecc-codex", "disabled",
    "--codegraph", "disabled", "--impeccable", "disabled", "--layers", "disabled",
    "--ponytail", "disabled", "--rtk", "disabled", "--caveman", "disabled"
  ];
  let result = runCli([
    "init", "--repo", repo, "--bridge", "enabled", ...disabled,
    "--yes", "--allow-native", "--json"
  ], { env });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).results.find((item) => item.stack === "bridge").status, "installed");

  const stableServer = path.join(vorthHome, "bridge", "server.mjs");
  assert.equal(fs.existsSync(stableServer), true);
  assert.equal(fs.existsSync(path.join(vorthHome, "bridge", "profile-manager.mjs")), true);
  const state = readJson(path.join(vorthHome, "bridge-state.json"));
  assert.notEqual(state.httpsPort, state.lspPort);
  const registrationCall = fs.readFileSync(fakeAgy.logPath, "utf8").trim();
  if (process.platform === "win32") {
    const args = JSON.parse(registrationCall);
    assert.equal(args[0], "--add-mcp");
    assert.equal(JSON.parse(args[1]).name, "vorth-agy-native-bridge");
  } else {
    assert.match(registrationCall, /--add-mcp/);
    assert.match(registrationCall, /vorth-agy-native-bridge/);
  }

  fs.mkdirSync(path.dirname(mcpConfig), { recursive: true });
  fs.writeFileSync(mcpConfig, JSON.stringify({
    servers: { "vorth-agy-native-bridge": { command: process.execPath, args: [stableServer] } }
  }), "utf8");
  result = runCli(["status", "--repo", repo, "--json"], { env });
  assert.equal(result.status, 0, result.stderr);
  const status = JSON.parse(result.stdout);
  assert.equal(status.agyNativeBridge.files, "present");
  assert.equal(status.agyNativeBridge.version.status, "current");
  assert.equal(status.agyNativeBridge.workerProfile.status, "initialized");
  assert.equal(status.agyNativeBridge.mcpRegistration.configPath, mcpConfig);
  assert.equal(status.agyNativeBridge.health, "configured-unprobed");
  assert.equal(status.readiness.status, "needs_attention");

  result = runCli(["doctor", "--repo", repo, "--json"], { env });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "needs_attention");

  result = runCli(["doctor", "--repo", repo, "--probe", "--json"], { env, timeout: 60000 });
  assert.equal(result.status, 2, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "unhealthy");
});

test("Windows installer creates the short command without changing PATH in QA", (t) => {
  if (process.platform !== "win32") return t.skip("Windows installer test");
  const installDir = createTempDirectory(t, "cli-bin");
  const vorthHome = createTempDirectory(t, "vorth-home");
  const script = path.join(projectRoot, "scripts", "install.ps1");
  const result = spawnSync("powershell.exe", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script,
    "-Preset", "agy-codex", "-InstallDir", installDir, "-SkipPath"
  ], { encoding: "utf8", env: { ...process.env, VORTH_HOME: vorthHome } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(installDir, "vorth.cmd")), true);
  assert.equal(readJson(path.join(vorthHome, "config.json")).preset, "agy-codex");
});
