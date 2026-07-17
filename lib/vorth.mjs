import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const libDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(libDir, "..");
const projectTemplateDir = path.join(rootDir, "templates", "project");
const bridgeTemplateDir = path.join(rootDir, "templates", "mcp", "vorth-agy-native-bridge");

const START = "<!-- VORTH:START -->";
const END = "<!-- VORTH:END -->";
const GIT_START = "# VORTH:GIT-EXCLUDE:START";
const GIT_END = "# VORTH:GIT-EXCLUDE:END";
const BASE_EXCLUDES = [".vorth/", ".codegraph/"];
const CONFIG_JSON = path.join(".vorth", "vorth.config.json");
const CONFIG_MD = path.join(".vorth", "vorth.config.md");

const DEFAULT_CONFIG = Object.freeze({
  schemaVersion: 2,
  preset: "balanced",
  installScope: "project-local",
  mode: "project-local",
  superpowers: "auto",
  eccAntigravity: "minimal",
  eccCodex: "auto",
  bridge: "disabled",
  bridgeProfile: "active",
  flashHighModelId: "gemini-3-flash-agent",
  flashHighScope: "agy-only",
  codegraph: "enabled",
  impeccable: "auto",
  layers: "advisory",
  ponytail: "full",
  rtk: "auto",
  caveman: "subagent-only",
  gitHygiene: "local-exclude",
  managedExcludePaths: BASE_EXCLUDES,
  createdBy: "vorth-cli"
});

const OPTION_ENUMS = {
  bridge: ["enabled", "disabled", "skipped"],
  bridgeProfile: ["active", "worker"],
  codegraph: ["enabled", "disabled", "skipped"],
  impeccable: ["auto", "enabled", "disabled", "skipped"],
  layers: ["advisory", "enabled", "disabled", "skipped"],
  ponytail: ["full", "disabled", "skipped"],
  rtk: ["auto", "enabled", "disabled", "skipped"],
  caveman: ["subagent-only", "disabled", "skipped"],
  superpowers: ["auto", "native", "project-local", "disabled", "skipped"],
  eccAntigravity: ["auto", "minimal", "disabled", "skipped"],
  eccCodex: ["auto", "minimal", "disabled", "skipped"],
  mode: ["project-local", "native", "mixed", "degraded"]
};

const COMMON_OPTIONS = new Set(["repo", "json", "dryRun", "help"]);
const INIT_OPTIONS = new Set([
  ...COMMON_OPTIONS,
  "bridge", "codegraph", "impeccable", "layers", "ponytail", "rtk", "caveman",
  "superpowers", "eccAntigravity", "eccCodex", "mode", "bridgeProfile", "preset", "noSetup",
  "allowNetwork", "allowNative", "apply", "confirm", "yes"
]);
const SETUP_STACKS = new Set(["codegraph", "superpowers", "ecc", "impeccable", "layers", "ponytail", "rtk", "caveman", "bridge"]);
const PRESETS = Object.freeze({
  balanced: {},
  "agy-codex": {
    preset: "agy-codex",
    bridge: "enabled",
    bridgeProfile: "worker",
    superpowers: "auto",
    eccAntigravity: "minimal",
    eccCodex: "minimal",
    codegraph: "enabled",
    impeccable: "auto",
    layers: "advisory",
    ponytail: "full",
    rtk: "auto",
    caveman: "subagent-only"
  },
  minimal: {
    preset: "minimal",
    bridge: "disabled",
    superpowers: "auto",
    eccAntigravity: "disabled",
    eccCodex: "disabled",
    codegraph: "disabled",
    impeccable: "disabled",
    layers: "disabled",
    ponytail: "full",
    rtk: "disabled",
    caveman: "subagent-only"
  }
});

export async function runCli(argv) {
  const command = argv[0] || "help";
  const hasSubcommand = Boolean(argv[1] && !argv[1].startsWith("--") && ["bridge"].includes(command));
  const options = parseArgs(argv.slice(hasSubcommand ? 2 : 1));
  if (hasSubcommand) options.action = argv[1];
  try {
    if (isTrue(options.help)) {
      const result = { command: "help", text: helpText() };
      emitResult(result, options);
      return result;
    }
    let result;
    switch (command) {
      case "init":
        assertKnownOptions(options, INIT_OPTIONS);
        result = await cmdInit(options);
        break;
      case "sync":
        assertKnownOptions(options, COMMON_OPTIONS);
        result = cmdSync(options);
        break;
      case "setup":
        result = await cmdSetup(options);
        break;
      case "repair":
        result = await cmdRepair(options);
        break;
      case "configure":
        result = cmdConfigure(options);
        break;
      case "bridge":
        result = cmdBridge(options);
        break;
      case "status":
        result = cmdStatus(options);
        break;
      case "doctor":
        result = cmdDoctor(options);
        break;
      case "reset":
        result = cmdReset(options);
        break;
      case "help":
      case "--help":
      case "-h":
        result = { command: "help", text: helpText() };
        break;
      default:
        throw cliError(`Unknown command: ${command}. Run: vorth help`);
    }

    emitResult(result, options);
    if (result.exitCode) process.exitCode = result.exitCode;
    return result;
  } catch (error) {
    const message = error?.message || String(error);
    if (isTrue(options.json)) {
      process.stdout.write(`${JSON.stringify({ command, status: "error", message }, null, 2)}\n`);
    } else {
      process.stderr.write(`${message}\n`);
    }
    process.exitCode = error?.exitCode || 1;
    return null;
  }
}

async function cmdInit(options) {
  const repo = getRepoContext(options.repo);
  const loaded = loadConfig(repo.root);
  const baseConfig = loaded.exists ? loaded.config : applyPreset(loaded.config, options.preset || loadUserConfig().preset);
  const config = mergeInitConfig(baseConfig, options);
  const dryRun = isTrue(options.dryRun);

  if (dryRun) {
    return {
      command: "init",
      status: "dry_run",
      lifecycle: loaded.exists ? "active" : "inactive",
      repoRoot: repo.root,
      branch: repo.branch,
      planned: projectFileList(config)
    };
  }

  writeProjectFiles(repo, config);
  const codegraphInit = runCodeGraphInit(repo.root, config.codegraph);
  const status = collectStatus(repo, { runSelfTest: false });
  const setupRequired = collectSetupRequired(status);

  const requestedRepair = isTrue(options.apply) || isTrue(options.confirm) || isTrue(options.yes);
  if ((shouldRunInteractiveSetup(options) || requestedRepair) && setupRequired.length) {
    return reconcile(repo, config, options, { command: "init", initialStatus: status });
  }

  return {
    command: "init",
    status: status.readiness?.status || (setupRequired.length ? "degraded" : "ready"),
    lifecycle: status.lifecycle,
    repoRoot: repo.root,
    branch: repo.branch,
    activation: status.activation,
    codegraph: {
      desired: config.codegraph,
      init: codegraphInit,
      health: status.codegraph.health
    },
    setupRequired,
    readiness: status.readiness,
    next: setupRequired.length
      ? "Run `vorth repair` interactively, or inspect this JSON plan from automation."
      : "Open a new Antigravity or Codex session in this repository."
  };
}

function cmdSync(options) {
  const repo = getRepoContext(options.repo);
  const loaded = loadConfig(repo.root);
  if (!loaded.exists) throw cliError("Vorth is not initialized in this repository. Run vorth init first.");
  if (!isTrue(options.dryRun)) {
    writeProjectFiles(repo, loaded.config);
  }
  return {
    command: "sync",
    status: isTrue(options.dryRun) ? "dry_run" : "ok",
    lifecycle: "active",
    repoRoot: repo.root,
    files: projectFileList(loaded.config)
  };
}

function cmdStatus(options) {
  const allowed = new Set([...COMMON_OPTIONS, "selfTest", "probe"]);
  assertKnownOptions(options, allowed);
  const repo = getRepoContext(options.repo);
  const explicitProbe = isTrue(options.probe) || (options.provided.has("selfTest") && isTrue(options.selfTest));
  const status = collectStatus(repo, { runSelfTest: explicitProbe });
  return { command: "status", ...status };
}

function cmdDoctor(options) {
  const allowed = new Set([...COMMON_OPTIONS, "probe"]);
  assertKnownOptions(options, allowed);
  const repo = getRepoContext(options.repo);
  const status = collectStatus(repo, { runSelfTest: isTrue(options.probe) });
  const issues = diagnose(status);
  const readiness = status.readiness || { status: "degraded", blockers: [], checkpoints: [] };
  return {
    command: "doctor",
    status: readiness.status === "degraded" ? "unhealthy" : readiness.status === "needs_attention" ? "needs_attention" : "healthy",
    repoRoot: repo.root,
    lifecycle: status.lifecycle,
    readiness,
    issues,
    stackHealth: summarizeStackHealth(status),
    exitCode: readiness.status === "degraded" ? 2 : 0
  };
}

function cmdReset(options) {
  const allowed = new Set([...COMMON_OPTIONS, "confirm", "yes"]);
  assertKnownOptions(options, allowed);
  if (!isTrue(options.confirm) && !isTrue(options.yes)) {
    throw cliError("Refusing reset without --confirm. This removes only Vorth-managed activation.");
  }

  const repo = getRepoContext(options.repo);
  if (isTrue(options.dryRun)) {
    return { command: "reset", status: "dry_run", repoRoot: repo.root };
  }

  removeManagedBlock(path.join(repo.root, "GEMINI.md"));
  removeManagedBlock(path.join(repo.root, "AGENTS.md"));
  removeGitHygiene(repo);
  const vorthDir = path.resolve(repo.root, ".vorth");
  if (path.basename(vorthDir) !== ".vorth" || !isInside(repo.root, vorthDir)) {
    throw cliError(`Unsafe .vorth path resolved outside repository: ${vorthDir}`);
  }
  if (fs.existsSync(vorthDir)) fs.rmSync(vorthDir, { recursive: true, force: true });

  return {
    command: "reset",
    status: "ok",
    lifecycle: "inactive",
    repoRoot: repo.root,
    removed: [".vorth/", "GEMINI.md managed block", "AGENTS.md managed block", "Git exclude managed block"],
    preserved: [".codegraph/", ".agent/", ".agents/", ".codex/", ".gemini/", "external stack installs"]
  };
}

async function cmdSetup(options) {
  const allowed = new Set([
    ...COMMON_OPTIONS, "stack", "target", "wire", "allowNetwork", "allowNative", "confirm", "apply", "yes"
  ]);
  assertKnownOptions(options, allowed);
  const repo = getRepoContext(options.repo);
  const loaded = loadConfig(repo.root);
  if (!loaded.exists) throw cliError("Vorth is not initialized in this repository. Run vorth init first.");
  if (!options.stack) return reconcile(repo, loaded.config, options, { command: "setup" });

  const stacks = String(options.stack).split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  const unknown = stacks.filter((stack) => !SETUP_STACKS.has(stack));
  if (unknown.length) throw cliError(`Unknown setup stack: ${unknown.join(", ")}`);
  if (isTrue(options.dryRun)) {
    return {
      command: "setup",
      status: "dry_run",
      repoRoot: repo.root,
      planned: stacks.map((stack) => ({ stack, target: options.target || null, externalChanges: true }))
    };
  }
  const results = stacks.map((stack) => setupStack(repo, loaded.config, stack, options));
  writeRuntime(repo.root, loaded.config);
  const failed = results.some((result) => result.status === "error");
  const approvalRequired = results.some((result) => result.status === "approval_required");
  const needsAttention = results.some((result) => ["manual_action", "missing_cli"].includes(result.status));
  return {
    command: "setup",
    status: failed ? "error" : approvalRequired ? "approval_required" : needsAttention ? "needs_attention" : "ok",
    repoRoot: repo.root,
    results,
    exitCode: failed ? 2 : 0
  };
}

async function cmdRepair(options) {
  const allowed = new Set([...COMMON_OPTIONS, "allowNetwork", "allowNative", "apply", "confirm", "yes", "probe"]);
  assertKnownOptions(options, allowed);
  const repo = getRepoContext(options.repo);
  const loaded = loadConfig(repo.root);
  if (!loaded.exists) throw cliError("Vorth is not initialized in this repository. Run vorth init first.");
  return reconcile(repo, loaded.config, options, { command: "repair" });
}

function cmdConfigure(options) {
  const allowed = new Set(["preset", "json", "help"]);
  assertKnownOptions(options, allowed);
  const preset = String(options.preset || "agy-codex").toLowerCase();
  if (!PRESETS[preset]) throw cliError(`Unknown preset: ${preset}. Use ${Object.keys(PRESETS).join(", ")}.`);
  const home = getVorthHome();
  const configPath = path.join(home, "config.json");
  ensureDir(home);
  writeText(configPath, `${JSON.stringify({ schemaVersion: 1, preset }, null, 2)}\n`);
  return {
    command: "configure",
    status: "ok",
    preset,
    configPath,
    note: "This stores CLI defaults only; agent behavior remains project-local."
  };
}

function cmdBridge(options) {
  const allowed = new Set(["repo", "json", "userDataDir", "extensionsDir", "antigravityCli", "help"]);
  assertKnownOptions(options, allowed);
  const action = String(options.action || "status").toLowerCase();
  const allowedActions = new Set(["init", "login", "launch", "status"]);
  if (!allowedActions.has(action)) throw cliError(`Unknown bridge action: ${action}. Use ${[...allowedActions].join(", ")}.`);

  const stable = ensureStableBridgeFiles();
  const managerArgs = [action];
  const repo = options.repo ? getRepoContext(options.repo) : null;
  if (repo && ["init", "login", "launch"].includes(action)) managerArgs.push("--workspace", repo.root);
  for (const [key, flag] of [["userDataDir", "--user-data-dir"], ["extensionsDir", "--extensions-dir"], ["antigravityCli", "--antigravity-cli"]]) {
    if (options[key]) managerArgs.push(flag, String(options[key]));
  }
  const result = spawnSync(process.execPath, [stable.profileManager, ...managerArgs], {
    cwd: repo?.root || process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    timeout: action === "status" ? 30000 : 60000,
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error || result.status !== 0) throw cliError(sanitize(result.error?.message || result.stderr || "Bridge profile command failed."));
  const bridgeResult = JSON.parse(result.stdout || "{}");
  return { command: "bridge", action, ...bridgeResult };
}

async function reconcile(repo, config, options, context = {}) {
  let status = context.initialStatus || collectStatus(repo, { runSelfTest: isTrue(options.probe) });
  const plan = buildRepairPlan(status);
  const command = context.command || "repair";
  if (!plan.length) {
    return { command, status: "ready", lifecycle: status.lifecycle, repoRoot: repo.root, readiness: status.readiness, plan: [], results: [] };
  }

  const interactive = !isTrue(options.json) && process.stdin.isTTY && !isTrue(options.dryRun);
  let apply = isTrue(options.apply) || isTrue(options.confirm) || isTrue(options.yes);
  let allowNetwork = isTrue(options.allowNetwork);
  let allowNative = isTrue(options.allowNative);

  if (interactive && !apply) {
    printRepairPlan(plan);
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try {
      apply = await confirmPrompt(terminal, "Apply the automatable Vorth repair plan?", true);
      if (apply && plan.some((item) => item.network && item.fixable)) {
        allowNetwork = await confirmPrompt(terminal, "Allow downloads from the official stack sources?", false);
      }
      if (apply && plan.some((item) => item.native && item.fixable)) {
        allowNative = await confirmPrompt(terminal, "Allow user/harness configuration changes?", false);
      }
    } finally {
      terminal.close();
    }
  }

  if (!apply || isTrue(options.dryRun)) {
    return {
      command,
      status: isTrue(options.dryRun) ? "dry_run" : "approval_required",
      lifecycle: status.lifecycle,
      repoRoot: repo.root,
      readiness: status.readiness,
      plan,
      next: interactive ? "Re-run `vorth repair` when ready." : "Run `vorth repair` in a terminal for guided fixes."
    };
  }

  const results = [];
  for (const item of plan) {
    if (!item.fixable) {
      results.push({ stack: item.stack, target: item.target || null, status: "manual_checkpoint", message: item.action });
      continue;
    }
    if (item.network && !allowNetwork) {
      results.push({ stack: item.stack, target: item.target || null, status: "skipped", reason: "network approval not granted" });
      continue;
    }
    if (item.native && !allowNative) {
      results.push({ stack: item.stack, target: item.target || null, status: "skipped", reason: "harness approval not granted" });
      continue;
    }
    if (item.stack === "git-hygiene") {
      results.push({ stack: item.stack, ...ensureGitHygiene(repo, config.managedExcludePaths) });
      continue;
    }
    results.push(setupStack(repo, config, item.stack, {
      target: item.target,
      wire: item.wire,
      allowNetwork,
      allowNative,
      confirm: true
    }));
  }

  writeRuntime(repo.root, config);
  status = collectStatus(repo, { runSelfTest: false });
  const remaining = buildRepairPlan(status);
  return {
    command,
    status: status.readiness?.status || (remaining.length ? "needs_attention" : "ready"),
    lifecycle: status.lifecycle,
    repoRoot: repo.root,
    readiness: status.readiness,
    plan,
    results,
    remaining,
    next: remaining.some((item) => !item.fixable)
      ? "Complete the listed manual checkpoints, restart the harnesses, then run `vorth repair` again."
      : remaining.length ? "Run `vorth repair` again after resolving skipped approvals." : "Open fresh Antigravity and Codex sessions."
  };
}

function buildRepairPlan(status) {
  if (status.lifecycle === "inactive") return [];
  const plan = [];
  const add = (item) => plan.push({ requirement: "required", ...item });
  if (status.git === "present" && status.gitHygiene.status !== "configured") {
    add({ stack: "git-hygiene", scope: "project", network: false, native: false, fixable: true, reason: "local Git exclude block is missing", action: "Restore the Vorth Git exclude block." });
  }
  if (status.superpowers.requirement === "required" && status.superpowers.health !== "healthy") {
    if (!status.superpowers.providers.agyPlugin) {
      const agyCli = detectCli("agy").status === "detected";
      add({ stack: "superpowers", target: "agy", scope: "harness", network: true, native: true, fixable: agyCli, reason: "official Antigravity Superpowers runtime is missing", action: agyCli ? "Install the official Antigravity plugin." : "Install Superpowers from Antigravity's plugin surface; the `agy` plugin CLI is unavailable." });
    }
    if (!status.superpowers.providers.codexPlugin && status.config.values?.preset === "agy-codex") {
      add({ stack: "superpowers", target: "codex", scope: "harness", network: true, native: true, fixable: false, reason: "official Codex Superpowers plugin is missing", action: "Install Superpowers once from the Codex Plugins sidebar, then restart Codex." });
    }
  }
  if (status.ecc.antigravity.requirement === "required" && status.ecc.antigravity.health !== "healthy") {
    add({ stack: "ecc", target: "agy", scope: "project", network: true, native: false, fixable: true, reason: "ECC Antigravity minimal specialists are missing", action: "Install ECC minimal into `.agent/`." });
  }
  if (status.ecc.codex.requirement === "required" && status.ecc.codex.health !== "healthy") {
    add({ stack: "ecc", target: "codex", scope: "harness", network: true, native: true, fixable: true, reason: "ECC Codex specialists are missing", action: "Install the official ECC minimal profile into Codex home, then restart Codex." });
  }
  if (status.codegraph.requirement === "required" && status.codegraph.health !== "healthy") {
    const cliMissing = status.codegraph.cli.status !== "detected";
    const dualHarness = status.config.values?.preset === "agy-codex";
    add({ stack: "codegraph", scope: dualHarness ? "harness" : "mixed", network: cliMissing, native: cliMissing || dualHarness, wire: true, fixable: true, reason: "CodeGraph CLI, index, or harness wiring is incomplete", action: "Install the official CLI when needed, initialize the index, and wire the required agents." });
  }
  if (status.impeccable.requirement === "required" && status.impeccable.health !== "healthy") {
    add({ stack: "impeccable", scope: "project", network: true, native: false, fixable: true, reason: "Impeccable is required for this frontend but not installed", action: "Install the official project-scoped Impeccable assets." });
  }
  if (status.layers.requirement === "required" && status.layers.health !== "healthy") {
    add({ stack: "layers", scope: "project", network: true, native: false, fixable: true, reason: "required Layers skills are missing", action: "Clone the official Layers skills project-locally." });
  }
  if (status.rtk.requirement === "required" && status.rtk.health !== "healthy") {
    add({ stack: "rtk", target: "agy", scope: "harness", network: status.rtk.cli.status !== "detected", native: true, fixable: status.rtk.cli.status === "detected", reason: "required RTK runtime/wiring is missing", action: "Install RTK, then wire Antigravity." });
  }
  if (status.agyNativeBridge.requirement === "required" && !["healthy", "configured-unprobed"].includes(status.agyNativeBridge.health)) {
    add({ stack: "bridge", target: "agy", scope: "harness", network: false, native: true, fixable: true, reason: "stable bridge router, MCP registration, or worker profile is incomplete", action: "Install the stable router and initialize the fixed-port worker profile." });
  }
  if (status.agyNativeBridge.requirement === "required" && status.agyNativeBridge.health === "configured-unprobed") {
    add({ stack: "bridge", target: "agy", scope: "probe", network: false, native: false, fixable: false, reason: "bridge is configured but live worker readiness has not been probed", action: "Run `vorth doctor --probe`; only run `vorth bridge login --repo .` if the worker is not ready or its OAuth session has expired." });
  }
  return dedupePlan(plan);
}

function dedupePlan(plan) {
  const seen = new Set();
  return plan.filter((item) => {
    const key = `${item.stack}:${item.target || ""}:${item.action}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shouldRunInteractiveSetup(options) {
  return !isTrue(options.json) && !isTrue(options.dryRun) && !isTrue(options.noSetup) && process.stdin.isTTY;
}

function printRepairPlan(plan) {
  process.stdout.write("\nVorth repair plan:\n");
  for (const item of plan) process.stdout.write(`- [${item.scope}] ${item.stack}${item.target ? `/${item.target}` : ""}: ${item.reason}\n`);
  process.stdout.write("\n");
}

async function confirmPrompt(terminal, question, defaultValue) {
  const suffix = defaultValue ? " [Y/n] " : " [y/N] ";
  const answer = (await terminal.question(`${question}${suffix}`)).trim().toLowerCase();
  if (!answer) return defaultValue;
  return ["y", "yes"].includes(answer);
}

function getVorthHome() {
  return path.resolve(process.env.VORTH_HOME || path.join(os.homedir(), ".vorth"));
}

function getCodexHome() {
  return path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
}

function loadUserConfig() {
  const configPath = path.join(getVorthHome(), "config.json");
  if (!fs.existsSync(configPath)) return { preset: "balanced" };
  try {
    const parsed = JSON.parse(stripBom(fs.readFileSync(configPath, "utf8")));
    return { preset: PRESETS[parsed.preset] ? parsed.preset : "balanced" };
  } catch {
    return { preset: "balanced" };
  }
}

function applyPreset(config, presetName) {
  const preset = PRESETS[presetName] || PRESETS.balanced;
  return validateConfig({ ...config, ...preset });
}

function mergeInitConfig(existing, options) {
  const config = validateConfig({ ...DEFAULT_CONFIG, ...existing });
  if (options.provided.has("preset")) {
    const preset = String(options.preset).toLowerCase();
    if (!PRESETS[preset]) throw cliError(`Unknown preset: ${preset}. Use ${Object.keys(PRESETS).join(", ")}.`);
    Object.assign(config, PRESETS[preset]);
  }
  for (const key of Object.keys(OPTION_ENUMS)) {
    if (!options.provided.has(key)) continue;
    config[key] = normalizeEnum(key, options[key]);
  }
  config.managedExcludePaths = [...BASE_EXCLUDES];
  return validateConfig(config);
}

function loadConfig(repoRoot) {
  const jsonPath = path.join(repoRoot, CONFIG_JSON);
  const mdPath = path.join(repoRoot, CONFIG_MD);
  if (fs.existsSync(jsonPath)) {
    try {
      const parsed = JSON.parse(stripBom(fs.readFileSync(jsonPath, "utf8")));
      return { exists: true, source: "json", config: validateConfig({ ...DEFAULT_CONFIG, ...parsed }) };
    } catch (error) {
      throw cliError(`Unable to parse ${CONFIG_JSON}: ${error.message}`);
    }
  }
  if (fs.existsSync(mdPath)) {
    return { exists: true, source: "markdown", config: migrateLegacyConfig(parseKeyValueFile(mdPath)) };
  }
  return { exists: false, source: "default", config: { ...DEFAULT_CONFIG, managedExcludePaths: [...BASE_EXCLUDES] } };
}

function validateConfig(input) {
  const config = { ...DEFAULT_CONFIG, ...input };
  for (const [key, values] of Object.entries(OPTION_ENUMS)) {
    if (!values.includes(config[key])) throw cliError(`Invalid config value ${key}: ${config[key]}`);
  }
  if (!PRESETS[config.preset]) config.preset = "balanced";
  config.schemaVersion = 2;
  config.managedExcludePaths = [...BASE_EXCLUDES];
  return config;
}

function migrateLegacyConfig(values) {
  const config = { ...DEFAULT_CONFIG, managedExcludePaths: [...BASE_EXCLUDES] };
  const mapping = {
    install_scope: "installScope",
    mode: "mode",
    superpowers: "superpowers",
    ecc_antigravity: "eccAntigravity",
    ecc_codex: "eccCodex",
    agy_native_bridge: "bridge",
    agy_native_bridge_profile: "bridgeProfile",
    agy_flash_high_model_id: "flashHighModelId",
    codegraph: "codegraph",
    impeccable: "impeccable",
    layers: "layers",
    ponytail: "ponytail",
    rtk: "rtk",
    caveman: "caveman",
    git_hygiene: "gitHygiene"
  };
  for (const [legacy, current] of Object.entries(mapping)) {
    if (values[legacy] !== undefined) config[current] = values[legacy];
  }
  if (config.superpowers === "missing") config.superpowers = "auto";
  if (["installed", "missing"].includes(config.eccAntigravity)) {
    config.eccAntigravity = OPTION_ENUMS.eccAntigravity.includes(values.ecc_antigravity_profile)
      ? values.ecc_antigravity_profile
      : "minimal";
  }
  if (["installed", "missing"].includes(config.eccCodex)) config.eccCodex = "auto";
  return validateConfig(config);
}

function writeProjectFiles(repo, config) {
  assertDelimitedMarkers(path.join(repo.root, "GEMINI.md"), START, END);
  assertDelimitedMarkers(path.join(repo.root, "AGENTS.md"), START, END);
  if (repo.git === "present") {
    const excludePath = getGitExcludePath(repo);
    if (excludePath) assertDelimitedMarkers(excludePath, GIT_START, GIT_END);
  }
  const vorthDir = path.join(repo.root, ".vorth");
  for (const relative of ["", "instructions", "plans", "mcp", "vendor"]) {
    ensureDir(path.join(vorthDir, relative));
  }
  writeConfigFiles(repo.root, config);
  writeIfMissing(path.join(vorthDir, "context.md"), readTemplate("context.md"));
  for (const name of [
    "stack-routing.md", "superpowers-ecc.md", "codegraph.md", "impeccable.md", "layers.md",
    "ponytail.md", "rtk.md", "caveman.md", "turn-process.md"
  ]) {
    writeText(path.join(vorthDir, "instructions", name), readTemplate(path.join("instructions", name)));
  }
  writeRuntime(repo.root, config);
  upsertManagedBlock(path.join(repo.root, "GEMINI.md"), readTemplate("GEMINI.block.md"));
  upsertManagedBlock(path.join(repo.root, "AGENTS.md"), readTemplate("AGENTS.block.md"));
  ensureGitHygiene(repo, config.managedExcludePaths);
}

function writeConfigFiles(repoRoot, config) {
  writeText(path.join(repoRoot, CONFIG_JSON), `${JSON.stringify(config, null, 2)}\n`);
  writeText(path.join(repoRoot, CONFIG_MD), renderConfigMarkdown(config));
}

function renderConfigMarkdown(config) {
  return `# Vorth Config\n\nThis file is generated for humans. The authoritative config is \`.vorth/vorth.config.json\`.\n\n` +
    `schema_version: ${config.schemaVersion}\n` +
    `preset: ${config.preset}\n` +
    `install_scope: ${config.installScope}\n` +
    `mode: ${config.mode}\n` +
    `superpowers: ${config.superpowers}\n` +
    `ecc_antigravity: ${config.eccAntigravity}\n` +
    `ecc_codex: ${config.eccCodex}\n` +
    `agy_native_bridge: ${config.bridge}\n` +
    `agy_native_bridge_profile: ${config.bridgeProfile}\n` +
    `agy_flash_high_model_id: ${config.flashHighModelId}\n` +
    `agy_flash_high_scope: ${config.flashHighScope}\n` +
    `codegraph: ${config.codegraph}\n` +
    `impeccable: ${config.impeccable}\n` +
    `layers: ${config.layers}\n` +
    `ponytail: ${config.ponytail}\n` +
    `rtk: ${config.rtk}\n` +
    `caveman: ${config.caveman}\n` +
    `git_hygiene: ${config.gitHygiene}\n` +
    `git_hygiene_patterns: ${config.managedExcludePaths.join(", ")}\n` +
    `created_by: ${config.createdBy}\n`;
}

function writeRuntime(repoRoot, config) {
  writeText(path.join(repoRoot, ".vorth", "runtime.md"), renderRuntime(config));
}

function renderRuntime(config) {
  const lines = [
    "# Vorth Runtime",
    "",
    "Vorth is active in this repository. The generated configuration is authoritative.",
    "Use the user's explicit instructions first. Load detailed stack instructions only when routed below.",
    "",
    "## Baseline",
    "",
    config.superpowers === "disabled"
      ? "- Superpowers is disabled. Use the host agent's normal engineering process."
      : "- Use official Superpowers skills when installed. Otherwise use Vorth's minimal fallback: understand, plan only when needed, change narrowly, test, review, and verify.",
    "- For an obvious one-file task, keep the process lightweight. For non-trivial workflow or specialist routing, read `.vorth/instructions/superpowers-ecc.md`.",
    "- Update `.vorth/context.md` only when durable project context changes."
  ];

  if (!isDisabled(config.codegraph)) {
    lines.push("", "## CodeGraph", "", "- Before broad codebase exploration or many-file reads, read `.vorth/instructions/codegraph.md`, then use CodeGraph first.", "- Skip it when the exact file or symbol is already clear.", "- If unavailable, say graph mode is degraded and use narrow search/file reads.");
  }
  if (!isDisabled(config.ponytail)) {
    lines.push("", "## Before Editing", "", "- Before a code edit, read `.vorth/instructions/ponytail.md` and apply its complexity ladder after context is sufficient. Do not trade away correctness, security, accessibility, compatibility, or tests.");
  }
  if (!isDisabled(config.rtk)) {
    lines.push("", "## Shell Output", "", "- For likely noisy commands, read `.vorth/instructions/rtk.md`. Use RTK only when wired or directly available; bypass it for exact output, JSON, auth, interactive, destructive, or ambiguous commands.");
  }

  const conditional = [];
  if (!isDisabled(config.eccAntigravity) || !isDisabled(config.eccCodex)) conditional.push("- ECC: use `.vorth/instructions/superpowers-ecc.md` and load the matching installed specialist only for planning, security, review, build, test, or language-specific risk.");
  if (!isDisabled(config.impeccable)) conditional.push("- Impeccable: for visible frontend/UI work, read `.vorth/instructions/impeccable.md`; an `auto` setting does not imply it is installed.");
  if (!isDisabled(config.layers)) conditional.push("- Layers: for product/UX ambiguity, read `.vorth/instructions/layers.md`. Load `layers-intro` before `layers-orient` or a specific layer.");
  if (!isDisabled(config.caveman)) conditional.push("- Caveman: before a compact subagent/handoff report, read `.vorth/instructions/caveman.md`. Keep main analysis and risk communication clear.");
  if (conditional.length) lines.push("", "## Conditional Routing", "", ...conditional);

  if (config.bridge === "enabled") {
    lines.push("", "## Antigravity Bridge", "", "- Antigravity only. Delegate bounded execution after scope and acceptance criteria are clear.", "- The main agent applies or validates the patch, runs checks, and owns final review. Codex must ignore the bridge.");
  }
  lines.push("");
  return lines.join("\n");
}

function projectFileList(config) {
  const files = [
    CONFIG_JSON, CONFIG_MD, ".vorth/runtime.md", ".vorth/context.md", ".vorth/instructions/",
    "GEMINI.md managed block", "AGENTS.md managed block", ".git/info/exclude managed block"
  ];
  return files;
}

function collectStatus(repo, options = {}) {
  const loaded = loadConfig(repo.root);
  const config = loaded.config;
  const activation = {
    geminiBlock: hasManagedBlock(path.join(repo.root, "GEMINI.md")),
    agentsBlock: hasManagedBlock(path.join(repo.root, "AGENTS.md")),
    runtime: fs.existsSync(path.join(repo.root, ".vorth", "runtime.md"))
  };
  let lifecycle = "inactive";
  if (loaded.exists) {
    lifecycle = activation.geminiBlock && activation.agentsBlock && activation.runtime ? "active" : "degraded";
  }

  if (!loaded.exists) {
    const inactive = {
      lifecycle,
      repoRoot: repo.root,
      branch: repo.branch,
      git: repo.git,
      config: {
        exists: false,
        source: loaded.source,
        jsonPath: path.join(repo.root, CONFIG_JSON),
        markdownPath: path.join(repo.root, CONFIG_MD),
        values: null
      },
      activation,
      gitHygiene: detectGitHygiene(repo, BASE_EXCLUDES),
      superpowers: { desired: "inactive", health: "inactive" },
      ecc: {
        antigravity: { desired: "inactive", health: "inactive" },
        codex: { desired: "inactive", health: "inactive" }
      },
      codegraph: { desired: "inactive", health: "inactive" },
      impeccable: { desired: "inactive", health: "inactive" },
      layers: { desired: "inactive", health: "inactive" },
      ponytail: { desired: "inactive", health: "inactive" },
      rtk: { desired: "inactive", health: "inactive" },
      caveman: { desired: "inactive", health: "inactive" },
      agyNativeBridge: {
        desired: "inactive",
        files: "missing",
        mcpRegistration: { status: "unknown", registered: false },
        selfTest: { status: "not_requested" },
        health: "inactive"
      },
      conditionalStacks: null,
      guardStacks: null,
      context: "inactive"
    };
    return applyHealthModel(inactive, config);
  }

  const stableBridge = getStableBridgeFiles();
  const legacyBridgeServer = path.join(repo.root, ".vorth", "mcp", "vorth-agy-native-bridge", "server.mjs");
  const bridgeServer = stableBridge.server;
  const bridgeFiles = fs.existsSync(bridgeServer);
  let bridgeSelfTest = { status: "not_requested" };
  if (options.runSelfTest && loaded.exists && config.bridge === "enabled" && bridgeFiles) {
    bridgeSelfTest = runBridgeSelfTest(bridgeServer);
  }

  const status = {
    lifecycle,
    repoRoot: repo.root,
    branch: repo.branch,
    git: repo.git,
    config: {
      exists: loaded.exists,
      source: loaded.source,
      jsonPath: path.join(repo.root, CONFIG_JSON),
      markdownPath: path.join(repo.root, CONFIG_MD),
      values: loaded.exists ? config : null
    },
    activation,
    gitHygiene: detectGitHygiene(repo, config.managedExcludePaths),
    superpowers: detectSuperpowers(repo.root, loaded.exists ? config.superpowers : "inactive"),
    ecc: detectEcc(repo.root, loaded.exists ? config : null),
    codegraph: detectCodeGraph(repo.root, loaded.exists ? config.codegraph : "inactive"),
    impeccable: detectImpeccable(repo.root, loaded.exists ? config.impeccable : "inactive"),
    layers: detectLayers(repo.root, loaded.exists ? config.layers : "inactive"),
    ponytail: detectPonytail(repo.root, loaded.exists ? config.ponytail : "inactive"),
    rtk: detectRtk(repo.root, loaded.exists ? config.rtk : "inactive"),
    caveman: detectCaveman(repo.root, loaded.exists ? config.caveman : "inactive"),
    agyNativeBridge: {
      desired: loaded.exists ? config.bridge : "inactive",
      files: bridgeFiles ? "present" : "missing",
      path: bridgeServer,
      version: detectStableBridgeVersion(stableBridge),
      legacyFiles: fs.existsSync(legacyBridgeServer) ? "present" : "missing",
      workerProfile: {
        status: fs.existsSync(stableBridge.state) ? "initialized" : "missing",
        statePath: stableBridge.state
      },
      mcpRegistration: detectBridgeRegistration(repo.root),
      selfTest: bridgeSelfTest
    },
    conditionalStacks: loaded.exists ? { impeccable: config.impeccable, layers: config.layers } : null,
    guardStacks: loaded.exists ? { ponytail: config.ponytail, rtk: config.rtk, caveman: config.caveman } : null,
    context: loaded.exists ? summarizeContext(path.join(repo.root, ".vorth", "context.md")) : "inactive"
  };
  status.agyNativeBridge.health = bridgeHealth(status.agyNativeBridge);
  return applyHealthModel(status, config);
}

function applyHealthModel(status, config) {
  if (status.lifecycle === "inactive") {
    status.readiness = {
      status: "degraded",
      blockers: [{ stack: "vorth", code: "inactive", reason: "Vorth is not initialized in this repository." }],
      checkpoints: [],
      optionalDegraded: []
    };
    return status;
  }

  const preset = config?.preset || "balanced";
  const setRequirement = (item, requirement) => {
    item.requirement = requirement;
    return item;
  };

  setRequirement(status.superpowers, isDisabled(config.superpowers) ? "disabled" : "required");
  status.superpowers.requiredProviders = preset === "agy-codex" ? ["antigravity", "codex"] : ["any"];
  const superpowersReady = preset === "agy-codex"
    ? Boolean(status.superpowers.providers.agyPlugin && status.superpowers.providers.codexPlugin)
    : status.superpowers.installed;
  if (status.superpowers.requirement === "required") status.superpowers.health = superpowersReady ? "healthy" : "degraded";

  setRequirement(status.ecc.antigravity, config.eccAntigravity === "minimal" ? "required" : isDisabled(config.eccAntigravity) ? "disabled" : "optional");
  setRequirement(status.ecc.codex, config.eccCodex === "minimal" ? "required" : isDisabled(config.eccCodex) ? "disabled" : "optional");
  setRequirement(status.codegraph, config.codegraph === "enabled" ? "required" : isDisabled(config.codegraph) ? "disabled" : "optional");
  status.codegraph.requiredProviders = preset === "agy-codex" ? ["antigravity", "codex"] : ["any"];
  if (status.codegraph.requirement === "required") {
    const runtimeReady = status.codegraph.cli.status === "detected" && status.codegraph.index.status === "present";
    const wiringReady = preset === "agy-codex"
      ? status.codegraph.wiring.antigravity.registered && status.codegraph.wiring.codex.registered
      : status.codegraph.wiring.antigravity.registered || status.codegraph.wiring.codex.registered;
    status.codegraph.health = runtimeReady && wiringReady ? "healthy" : "degraded";
  }
  setRequirement(status.impeccable, config.impeccable === "enabled" ? "required" : "optional");
  setRequirement(status.layers, config.layers === "enabled" ? "required" : "optional");
  setRequirement(status.ponytail, "policy");
  setRequirement(status.rtk, config.rtk === "enabled" ? "required" : "optional");
  setRequirement(status.caveman, "policy");
  setRequirement(status.agyNativeBridge, config.bridge === "enabled" ? "required" : "disabled");

  const blockers = [];
  const checkpoints = [];
  const optionalDegraded = [];
  if (status.lifecycle !== "active") blockers.push({ stack: "vorth", code: "activation_degraded", reason: "Vorth activation files are incomplete." });
  if (status.git === "present" && status.gitHygiene.status !== "configured") {
    blockers.push({ stack: "git-hygiene", code: "git_hygiene_missing", reason: "The local Git exclude block is missing." });
  }

  const entries = [
    ["superpowers", status.superpowers],
    ["ecc-antigravity", status.ecc.antigravity],
    ["ecc-codex", status.ecc.codex],
    ["codegraph", status.codegraph],
    ["impeccable", status.impeccable],
    ["layers", status.layers],
    ["rtk", status.rtk],
    ["bridge", status.agyNativeBridge]
  ];
  for (const [stack, item] of entries) {
    if (item.requirement === "required" && item.health === "configured-unprobed") {
      checkpoints.push({ stack, code: `${stack}_unprobed`, reason: "Configured, but runtime readiness has not been verified." });
    } else if (item.requirement === "required" && item.health !== "healthy") {
      blockers.push({ stack, code: `${stack}_degraded`, reason: `Required stack health is ${item.health}.` });
    } else if (item.requirement === "optional" && ["degraded", "optional-missing", "available-not-wired"].includes(item.health)) {
      optionalDegraded.push({ stack, health: item.health });
    }
  }

  status.readiness = {
    status: blockers.length ? "degraded" : checkpoints.length ? "needs_attention" : "ready",
    blockers,
    checkpoints,
    optionalDegraded
  };
  return status;
}

function detectSuperpowers(repoRoot, desired) {
  const projectVendor = path.join(repoRoot, ".vorth", "vendor", "superpowers");
  const projectSkills = path.join(projectVendor, "skills");
  const home = os.homedir();
  const providers = {
    projectVendor: fs.existsSync(projectSkills),
    agyPlugin: anyExists([
      path.join(home, ".gemini", "plugins", "superpowers"),
      path.join(home, ".gemini", "extensions", "superpowers"),
      path.join(home, ".agents", "plugins", "superpowers")
    ]),
    codexPlugin: findNamedDirectory(path.join(getCodexHome(), "plugins"), "superpowers", 4)
  };
  const installed = Object.values(providers).some(Boolean);
  return {
    desired,
    installed,
    providers,
    fidelity: installed ? (providers.projectVendor ? "project-local" : "native") : desired === "inactive" ? "inactive" : "fallback-policy",
    health: desired === "inactive" || isDisabled(desired) ? desired : installed ? "healthy" : "degraded"
  };
}

function detectEcc(repoRoot, config) {
  const desiredAgy = config?.eccAntigravity || "inactive";
  const desiredCodex = config?.eccCodex || "inactive";
  const agyState = path.join(repoRoot, ".agent", "ecc-install-state.json");
  const agySkills = path.join(repoRoot, ".agent", "skills");
  const codexHome = getCodexHome();
  const projectCodexSkill = path.join(repoRoot, ".agents", "skills", "everything-claude-code", "SKILL.md");
  const userCodexSkill = path.join(os.homedir(), ".agents", "skills", "everything-claude-code", "SKILL.md");
  const codexManagedSkills = [
    path.join(codexHome, ".agents", "skills", "everything-claude-code", "SKILL.md"),
    path.join(codexHome, "skills", "everything-claude-code", "SKILL.md")
  ];
  const codexState = path.join(codexHome, "ecc-install-state.json");
  const codexInstallState = fs.existsSync(codexState);
  const codexPlugin = findNamedDirectory(path.join(codexHome, "plugins"), "everything-claude-code", 4) ||
    findNamedDirectory(path.join(codexHome, "plugins"), "ecc", 4);
  const antigravityInstalled = fs.existsSync(agyState) && fs.existsSync(agySkills);
  const codexSkillsInstalled = codexManagedSkills.some(fs.existsSync);
  const codexInstalled = codexInstallState || fs.existsSync(projectCodexSkill) || fs.existsSync(userCodexSkill) || codexSkillsInstalled || codexPlugin;
  return {
    antigravity: {
      desired: desiredAgy,
      installed: antigravityInstalled,
      installState: fs.existsSync(agyState),
      skills: fs.existsSync(agySkills),
      health: desiredAgy === "inactive" || isDisabled(desiredAgy) ? desiredAgy : antigravityInstalled ? "healthy" : "degraded"
    },
    codex: {
      desired: desiredCodex,
      installed: codexInstalled,
      installState: codexInstallState,
      skills: codexSkillsInstalled,
      health: desiredCodex === "inactive" || isDisabled(desiredCodex) ? desiredCodex : codexInstalled ? "healthy" : "degraded"
    }
  };
}

function detectCodeGraph(repoRoot, desired) {
  const cli = detectCli("codegraph");
  const indexPath = path.join(repoRoot, ".codegraph");
  const indexPresent = fs.existsSync(indexPath);
  const wiring = detectCodeGraphWiring();
  let health = "degraded";
  if (desired === "inactive" || isDisabled(desired)) health = desired;
  else if (cli.status === "detected" && indexPresent && (wiring.antigravity.registered || wiring.codex.registered)) health = "healthy";
  return {
    desired,
    cli,
    index: { status: indexPresent ? "present" : "missing", path: indexPath },
    wiring,
    health
  };
}

function detectCodeGraphWiring() {
  const codexConfig = path.join(getCodexHome(), "config.toml");
  return {
    antigravity: detectJsonMcpAcross(getAgyMcpConfigPaths(), "codegraph"),
    codex: {
      configPath: codexConfig,
      registered: fileContains(codexConfig, "codegraph"),
      status: !fs.existsSync(codexConfig) ? "unknown" : fileContains(codexConfig, "codegraph") ? "registered" : "not_registered"
    }
  };
}

function detectImpeccable(repoRoot, desired) {
  const paths = {
    agentsSkill: path.join(repoRoot, ".agents", "skills", "impeccable", "SKILL.md"),
    geminiSkill: path.join(repoRoot, ".gemini", "skills", "impeccable", "SKILL.md"),
    codexHooks: path.join(repoRoot, ".codex", "hooks.json"),
    projectState: path.join(repoRoot, ".impeccable")
  };
  const providers = {
    agentsSkill: fs.existsSync(paths.agentsSkill),
    geminiSkill: fs.existsSync(paths.geminiSkill),
    codexHook: fileContains(paths.codexHooks, "impeccable"),
    projectState: fs.existsSync(paths.projectState)
  };
  const installed = Object.values(providers).some(Boolean);
  const frontend = detectFrontend(repoRoot);
  let health = installed ? "healthy" : "degraded";
  if (desired === "inactive" || isDisabled(desired)) health = desired;
  else if (desired === "auto" && !frontend.detected) health = "not_required";
  return {
    desired,
    installed,
    providers,
    frontend,
    initialized: fs.existsSync(path.join(repoRoot, "PRODUCT.md")) || fs.existsSync(path.join(repoRoot, "DESIGN.md")),
    health,
    paths
  };
}

function detectLayers(repoRoot, desired) {
  const vendorDir = path.join(repoRoot, ".vorth", "vendor", "layers-skills");
  const skillsDir = path.join(vendorDir, "skills");
  const skills = {
    intro: fs.existsSync(path.join(skillsDir, "layers-intro", "SKILL.md")),
    orient: fs.existsSync(path.join(skillsDir, "layers-orient", "SKILL.md")),
    conceptualModel: fs.existsSync(path.join(skillsDir, "layers-conceptual-model", "SKILL.md"))
  };
  const installed = skills.intro && skills.orient;
  const revision = gitRevision(vendorDir);
  let health = installed ? "healthy" : desired === "advisory" ? "policy-only" : "degraded";
  if (desired === "inactive" || isDisabled(desired)) health = desired;
  return { desired, installed, vendorDir, revision, skills, health };
}

function detectPonytail(repoRoot, desired) {
  const home = os.homedir();
  const paths = [
    path.join(repoRoot, ".agents", "skills", "ponytail", "SKILL.md"),
    path.join(repoRoot, ".gemini", "skills", "ponytail", "SKILL.md"),
    path.join(repoRoot, ".codex", "skills", "ponytail", "SKILL.md"),
    path.join(repoRoot, ".vorth", "vendor", "ponytail", "skills", "ponytail", "SKILL.md")
  ];
  const native = findNamedDirectory(path.join(home, ".codex", "plugins"), "ponytail", 4) ||
    anyExists([path.join(home, ".gemini", "plugins", "ponytail"), path.join(home, ".gemini", "extensions", "ponytail")]);
  const installed = paths.some(fs.existsSync) || native;
  const health = desired === "inactive" || isDisabled(desired) ? desired : installed ? "healthy" : "policy-only";
  return { desired, installed, native, policy: "after-context-before-edit", health, paths };
}

function detectRtk(repoRoot, desired) {
  const cli = detectCli("rtk");
  const wiring = {
    antigravity: fs.existsSync(path.join(repoRoot, ".agents", "rules", "antigravity-rtk-rules.md")),
    codex: fileContains(path.join(os.homedir(), ".codex", "AGENTS.md"), "RTK") || fileContains(path.join(repoRoot, "AGENTS.md"), "RTK")
  };
  let health = cli.status === "detected" ? (wiring.antigravity || wiring.codex ? "healthy" : "available-not-wired") : "degraded";
  if (desired === "inactive" || isDisabled(desired)) health = desired;
  if (desired === "auto" && cli.status !== "detected") health = "optional-missing";
  return { desired, cli, wiring, health };
}

function detectCaveman(repoRoot, desired) {
  const paths = [
    path.join(repoRoot, ".agents", "skills", "caveman", "SKILL.md"),
    path.join(repoRoot, ".gemini", "skills", "caveman", "SKILL.md"),
    path.join(repoRoot, ".codex", "skills", "caveman", "SKILL.md")
  ];
  const installed = paths.some(fs.existsSync);
  const health = desired === "inactive" || isDisabled(desired) ? desired : installed ? "healthy" : "policy-only";
  return { desired, installed, policy: "compact-reports-not-main-dialog", health, paths };
}

function detectFrontend(repoRoot) {
  const evidence = [];
  const packagePath = path.join(repoRoot, "package.json");
  if (fs.existsSync(packagePath)) {
    try {
      const parsed = JSON.parse(stripBom(fs.readFileSync(packagePath, "utf8")));
      const deps = { ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) };
      for (const name of ["@vitejs/plugin-react", "astro", "next", "react", "remix", "svelte", "tailwindcss", "vite", "vue"]) {
        if (deps[name]) evidence.push(`package:${name}`);
      }
    } catch {
      evidence.push("package.json:unreadable");
    }
  }
  for (const relative of ["src/components", "src/app", "src/pages", "components"]) {
    if (fs.existsSync(path.join(repoRoot, relative))) evidence.push(`dir:${relative}`);
  }
  return { detected: evidence.length > 0, evidence: evidence.slice(0, 12) };
}

function bridgeHealth(bridge) {
  if (bridge.desired === "inactive" || isDisabled(bridge.desired)) return bridge.desired;
  if (bridge.files !== "present" || bridge.version?.status === "outdated" || bridge.workerProfile?.status !== "initialized" || bridge.mcpRegistration.status !== "registered") return "degraded";
  if (bridge.selfTest.status === "not_requested") return "configured-unprobed";
  return bridge.selfTest.status === "ready" ? "healthy" : "degraded";
}

function collectSetupRequired(status) {
  if (status.lifecycle === "inactive") return [];
  const required = [];
  if (status.superpowers.requirement === "required" && status.superpowers.health !== "healthy") required.push({ stack: "superpowers", reason: "required official runtimes are not detected" });
  if (status.ecc.antigravity.requirement === "required" && status.ecc.antigravity.health !== "healthy") required.push({ stack: "ecc", target: "antigravity", reason: "Antigravity specialists not detected" });
  if (status.ecc.codex.requirement === "required" && status.ecc.codex.health !== "healthy") required.push({ stack: "ecc", target: "codex", reason: "Codex specialists not detected" });
  if (status.codegraph.requirement === "required" && status.codegraph.health !== "healthy") required.push({ stack: "codegraph", reason: "CLI, index, or harness wiring missing" });
  if (status.impeccable.requirement === "required" && status.impeccable.health !== "healthy") required.push({ stack: "impeccable", reason: "official project install missing" });
  if (status.layers.requirement === "required" && status.layers.health !== "healthy") required.push({ stack: "layers", reason: "official skills checkout incomplete" });
  if (status.rtk.requirement === "required" && status.rtk.health !== "healthy") required.push({ stack: "rtk", reason: "required CLI or wiring is missing" });
  if (status.agyNativeBridge.requirement === "required" && !["healthy", "configured-unprobed"].includes(status.agyNativeBridge.health)) required.push({ stack: "bridge", reason: "stable router, MCP registration, or worker profile is missing" });
  return required;
}

function diagnose(status) {
  if (status.lifecycle === "inactive") return [{ severity: "error", code: "vorth_inactive", message: "Run vorth init first." }];
  const issues = [];
  if (!status.activation.runtime) issues.push({ severity: "error", code: "runtime_missing", message: ".vorth/runtime.md is missing; run vorth sync." });
  if (!status.activation.geminiBlock) issues.push({ severity: "error", code: "gemini_activation_missing", message: "GEMINI.md managed block is missing." });
  if (!status.activation.agentsBlock) issues.push({ severity: "error", code: "codex_activation_missing", message: "AGENTS.md managed block is missing." });
  for (const item of collectSetupRequired(status)) issues.push({ severity: "error", code: `${item.stack}_degraded`, message: item.reason });
  for (const checkpoint of status.readiness?.checkpoints || []) issues.push({ severity: "warning", code: checkpoint.code, message: checkpoint.reason });
  for (const optional of status.readiness?.optionalDegraded || []) issues.push({ severity: "info", code: `${optional.stack}_optional`, message: `Optional stack is ${optional.health}.` });
  if (status.git === "present" && status.gitHygiene.status !== "configured") issues.push({ severity: "error", code: "git_hygiene_missing", message: "Run vorth sync to restore the local exclude block." });
  return issues;
}

function summarizeStackHealth(status) {
  return {
    superpowers: status.superpowers.health,
    eccAntigravity: status.ecc.antigravity.health,
    eccCodex: status.ecc.codex.health,
    codegraph: status.codegraph.health,
    impeccable: status.impeccable.health,
    layers: status.layers.health,
    ponytail: status.ponytail.health,
    rtk: status.rtk.health,
    caveman: status.caveman.health,
    bridge: status.agyNativeBridge.health
  };
}

function setupStack(repo, config, stack, options) {
  switch (stack) {
    case "codegraph":
      return setupCodeGraph(repo, config, options);
    case "impeccable":
      return setupImpeccable(repo, options);
    case "layers":
      return setupLayers(repo, options);
    case "superpowers":
      return setupSuperpowers(repo, options);
    case "ecc":
      return setupEcc(repo, options);
    case "ponytail":
      return setupPonytail(repo, options);
    case "rtk":
      return setupRtk(repo, options);
    case "bridge":
      return setupBridge(repo, options);
    case "caveman":
      return {
        stack,
        status: "policy_only",
        message: "Vorth intentionally keeps Caveman subagent-only. Its official always-on plugin conflicts with this scope."
      };
    default:
      return { stack, status: "error", message: `Unknown stack: ${stack}` };
  }
}

function setupCodeGraph(repo, config, options) {
  let cli = detectCli("codegraph");
  let cliInstall = null;
  if (cli.status !== "detected") {
    if (!isTrue(options.allowNetwork) || !isTrue(options.allowNative) || !isTrue(options.confirm)) {
      return {
        stack: "codegraph",
        status: "approval_required",
        message: "CodeGraph CLI is missing. Re-run with --allow-network --allow-native --confirm to install the official npm package."
      };
    }
    const install = spawnWindowsAware("npm", ["install", "--global", "@colbymchenry/codegraph"], {
      cwd: repo.root,
      timeout: 180000,
      maxBuffer: 10 * 1024 * 1024
    });
    cliInstall = externalResult(install, "installed");
    if (cliInstall.status === "error") return { stack: "codegraph", status: "error", cliInstall };
    cli = detectCli("codegraph");
    if (cli.status !== "detected") {
      return { stack: "codegraph", status: "error", cliInstall, message: "CodeGraph installed, but its CLI is not visible in PATH yet. Restart the terminal and run `vorth repair`." };
    }
  }
  const init = runCodeGraphInit(repo.root, config.codegraph === "disabled" ? "enabled" : config.codegraph);
  const result = { stack: "codegraph", status: ["initialized", "already_present"].includes(init.status) ? "ok" : init.status, cli, ...(cliInstall ? { cliInstall } : {}), init };
  if (isTrue(options.wire)) {
    if (!isTrue(options.confirm)) {
      return { ...result, status: "approval_required", message: "Add --confirm to let CodeGraph write project-local agent wiring." };
    }
    const dualHarness = config.preset === "agy-codex";
    if (dualHarness && !isTrue(options.allowNative)) {
      return { ...result, status: "approval_required", message: "The agy-codex preset requires --allow-native to wire both harnesses globally." };
    }
    const targets = dualHarness ? "antigravity,codex" : "auto";
    const location = dualHarness ? "global" : "local";
    const wire = spawnWindowsAware("codegraph", ["install", `--target=${targets}`, `--location=${location}`, "--yes"], {
      cwd: repo.root,
      timeout: 120000,
      maxBuffer: 5 * 1024 * 1024
    });
    result.wire = externalResult(wire, "wired");
    if (result.wire.status === "error") result.status = "error";
  }
  return result;
}

function setupImpeccable(repo, options) {
  if (!isTrue(options.allowNetwork) || !isTrue(options.confirm)) {
    return {
      stack: "impeccable",
      status: "approval_required",
      message: "Re-run with --allow-network --confirm to execute the official project installer."
    };
  }
  const result = spawnWindowsAware("npx", ["--yes", "impeccable", "install", "--providers=gemini,codex", "--scope=project"], {
    cwd: repo.root,
    timeout: 180000,
    maxBuffer: 10 * 1024 * 1024
  });
  return { stack: "impeccable", ...externalResult(result, "installed"), next: "Run /impeccable init and approve the Codex project hook when prompted." };
}

function setupLayers(repo, options) {
  const destination = path.join(repo.root, ".vorth", "vendor", "layers-skills");
  if (fs.existsSync(path.join(destination, "skills", "layers-intro", "SKILL.md"))) {
    return { stack: "layers", status: "already_present", path: destination, revision: gitRevision(destination) };
  }
  if (fs.existsSync(destination)) {
    return { stack: "layers", status: "error", message: "Layers destination exists but is incomplete. Inspect it before retrying.", path: destination };
  }
  if (!isTrue(options.allowNetwork) || !isTrue(options.confirm)) {
    return { stack: "layers", status: "approval_required", message: "Re-run with --allow-network --confirm to clone the official repository." };
  }
  const result = spawnWindowsAware("git", ["clone", "--depth", "1", "https://github.com/jamiemill/layers-skills.git", destination], {
    cwd: repo.root,
    timeout: 180000,
    maxBuffer: 10 * 1024 * 1024
  });
  const normalized = externalResult(result, "installed");
  return { stack: "layers", ...normalized, path: destination, revision: normalized.status === "installed" ? gitRevision(destination) : null };
}

function setupSuperpowers(repo, options) {
  const target = String(options.target || "agy").toLowerCase();
  if (!isTrue(options.allowNative) || !isTrue(options.confirm)) {
    return {
      stack: "superpowers",
      target,
      status: "approval_required",
      message: "Official Superpowers activation is harness-level. Re-run with --allow-native --confirm after reviewing the scope."
    };
  }
  if (target === "agy" || target === "antigravity") {
    const result = spawnWindowsAware("agy", ["plugin", "install", "https://github.com/obra/superpowers"], {
      cwd: repo.root,
      timeout: 180000,
      maxBuffer: 10 * 1024 * 1024
    });
    return { stack: "superpowers", target: "agy", ...externalResult(result, "installed") };
  }
  if (target === "codex") {
    return {
      stack: "superpowers",
      target,
      status: "manual_action",
      message: "Install Superpowers from Codex /plugins or the Codex app marketplace, then restart the session."
    };
  }
  return { stack: "superpowers", status: "error", message: `Unsupported target: ${target}` };
}

function setupEcc(repo, options) {
  const target = String(options.target || "agy").toLowerCase();
  if (!["agy", "antigravity", "codex"].includes(target)) {
    return { stack: "ecc", status: "error", message: `Unsupported target: ${target}` };
  }
  const normalizedTarget = target === "codex" ? "codex" : "agy";
  const installTarget = normalizedTarget === "codex" ? "codex" : "antigravity";
  const requiresNativeApproval = normalizedTarget === "codex";
  if (!isTrue(options.allowNetwork) || !isTrue(options.confirm) || (requiresNativeApproval && !isTrue(options.allowNative))) {
    return {
      stack: "ecc",
      target: normalizedTarget,
      status: "approval_required",
      message: requiresNativeApproval
        ? "Re-run with --allow-network --allow-native --confirm to clone ECC and install its minimal profile into Codex home."
        : "Re-run with --allow-network --confirm to clone ECC and run its project-local Antigravity installer."
    };
  }
  const vendor = path.join(repo.root, ".vorth", "vendor", "everything-claude-code");
  if (!fs.existsSync(vendor)) {
    const clone = spawnWindowsAware("git", ["clone", "--depth", "1", "https://github.com/affaan-m/everything-claude-code.git", vendor], {
      cwd: repo.root,
      timeout: 180000,
      maxBuffer: 10 * 1024 * 1024
    });
    const cloneResult = externalResult(clone, "cloned");
    if (cloneResult.status === "error") return { stack: "ecc", target: normalizedTarget, ...cloneResult };
  }
  const installer = path.join(vendor, "install.ps1");
  if (!fs.existsSync(installer)) return { stack: "ecc", target: normalizedTarget, status: "error", message: "ECC install.ps1 is missing." };
  const preview = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", installer, "--profile", "minimal", "--target", installTarget, "--dry-run"], {
    cwd: repo.root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 180000,
    maxBuffer: 10 * 1024 * 1024
  });
  const previewResult = externalResult(preview, "previewed");
  if (previewResult.status === "error") return { stack: "ecc", target: normalizedTarget, status: "error", preview: previewResult };
  const install = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", installer, "--profile", "minimal", "--target", installTarget], {
    cwd: repo.root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 180000,
    maxBuffer: 10 * 1024 * 1024
  });
  return { stack: "ecc", target: normalizedTarget, preview: previewResult, ...externalResult(install, "installed"), revision: gitRevision(vendor) };
}

function setupPonytail(repo, options) {
  const target = String(options.target || "agy").toLowerCase();
  if (!isTrue(options.allowNative) || !isTrue(options.confirm)) {
    return { stack: "ponytail", target, status: "approval_required", message: "Re-run with --allow-native --confirm to install the official harness plugin." };
  }
  let command;
  let args;
  if (target === "agy" || target === "antigravity") {
    command = "agy";
    args = ["plugin", "install", "https://github.com/DietrichGebert/ponytail"];
  } else if (target === "codex") {
    command = "codex";
    args = ["plugin", "add", "ponytail@ponytail"];
  } else {
    return { stack: "ponytail", status: "error", message: `Unsupported target: ${target}` };
  }
  const result = spawnWindowsAware(command, args, { cwd: repo.root, timeout: 180000, maxBuffer: 10 * 1024 * 1024 });
  return { stack: "ponytail", target, ...externalResult(result, "installed") };
}

function setupRtk(repo, options) {
  const target = String(options.target || "agy").toLowerCase();
  const cli = detectCli("rtk");
  if (cli.status !== "detected") return { stack: "rtk", target, status: "missing_cli", source: "https://github.com/rtk-ai/rtk" };
  if (!isTrue(options.confirm)) return { stack: "rtk", target, status: "approval_required", message: "Add --confirm to let RTK write harness integration files." };
  let args;
  if (target === "agy" || target === "antigravity") args = ["init", "--agent", "antigravity"];
  else if (target === "codex") {
    if (!isTrue(options.allowNative)) return { stack: "rtk", target, status: "approval_required", message: "Codex RTK setup is global; add --allow-native --confirm." };
    args = ["init", "-g", "--codex"];
  } else return { stack: "rtk", status: "error", message: `Unsupported target: ${target}` };
  const result = spawnWindowsAware("rtk", args, { cwd: repo.root, timeout: 120000, maxBuffer: 5 * 1024 * 1024 });
  return { stack: "rtk", target, ...externalResult(result, "wired") };
}

function setupBridge(repo, options) {
  if (!isTrue(options.allowNative) || !isTrue(options.confirm)) {
    return {
      stack: "bridge",
      target: "agy",
      status: "approval_required",
      message: "Re-run with --allow-native --confirm to install the stable router, initialize its worker profile, and register Antigravity MCP."
    };
  }

  const stable = ensureStableBridgeFiles();
  const initialized = spawnSync(process.execPath, [stable.profileManager, "init", "--workspace", repo.root], {
    cwd: repo.root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 5 * 1024 * 1024
  });
  const profile = externalResult(initialized, "initialized");
  if (profile.status === "error") return { stack: "bridge", target: "agy", status: "error", profile };

  const antigravityCli = resolveAntigravityCli();
  if (!antigravityCli) {
    return {
      stack: "bridge",
      target: "agy",
      status: "manual_action",
      router: stable.server,
      profile,
      message: "The stable bridge is installed, but Antigravity IDE CLI was not found. Register the MCP server after installing/enabling its shell command."
    };
  }

  const definition = JSON.stringify({
    name: "vorth-agy-native-bridge",
    command: process.execPath,
    args: [stable.server],
    env: { VORTH_HOME: getVorthHome() }
  });
  const registered = spawnAntigravityAddMcp(antigravityCli, definition, repo.root);
  const registration = externalResult(registered, "registered");
  return {
    stack: "bridge",
    target: "agy",
    status: registration.status === "error" ? "error" : "installed",
    router: stable.server,
    profile,
    registration,
    next: "Run `vorth bridge login --repo .` once to authenticate the dedicated worker account."
  };
}

function runCodeGraphInit(repoRoot, desired) {
  if (desired !== "enabled") return { status: "skipped", reason: `codegraph ${desired}` };
  const indexPath = path.join(repoRoot, ".codegraph");
  if (fs.existsSync(indexPath)) return { status: "already_present", path: indexPath };
  const cli = detectCli("codegraph");
  if (cli.status !== "detected") return { status: "missing_cli", cli };
  const result = spawnWindowsAware("codegraph", ["init"], {
    cwd: repoRoot,
    timeout: 120000,
    maxBuffer: 5 * 1024 * 1024
  });
  return externalResult(result, "initialized");
}

function externalResult(result, successStatus) {
  if (result.error) return { status: "error", message: sanitize(result.error.message) };
  if (result.status !== 0) {
    return { status: "error", exitCode: result.status, stderr: sanitize((result.stderr || "").slice(0, 1200)) };
  }
  const output = sanitize((result.stdout || result.stderr || "").trim().slice(0, 1200));
  return { status: successStatus, ...(output ? { output } : {}) };
}

function ensureGitHygiene(repo, patterns) {
  if (repo.git !== "present") return { status: "skipped", reason: "not a Git repository" };
  const excludePath = getGitExcludePath(repo);
  if (!excludePath) return { status: "error", message: "Unable to resolve Git info/exclude path" };
  const block = [GIT_START, "# Project-local files managed by Vorth. This block is not committed.", ...patterns, GIT_END].join("\n");
  upsertDelimitedBlock(excludePath, GIT_START, GIT_END, block);
  return { status: "configured", path: excludePath, patterns };
}

function detectGitHygiene(repo, patterns) {
  if (repo.git !== "present") return { status: "skipped", patterns };
  const excludePath = getGitExcludePath(repo);
  if (!excludePath || !fs.existsSync(excludePath)) return { status: "missing", path: excludePath, patterns };
  const text = fs.readFileSync(excludePath, "utf8");
  const block = text.includes(GIT_START) && text.includes(GIT_END);
  const missingPatterns = patterns.filter((pattern) => !text.includes(pattern));
  return { status: block && missingPatterns.length === 0 ? "configured" : "missing", path: excludePath, block: block ? "present" : "missing", patterns, missingPatterns };
}

function removeGitHygiene(repo) {
  if (repo.git !== "present") return;
  const excludePath = getGitExcludePath(repo);
  if (excludePath && fs.existsSync(excludePath)) removeDelimitedBlock(excludePath, GIT_START, GIT_END);
}

function getGitExcludePath(repo) {
  try {
    const raw = execFileSync("git", ["-C", repo.root, "rev-parse", "--git-path", "info/exclude"], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return path.resolve(path.isAbsolute(raw) ? raw : path.join(repo.root, raw));
  } catch {
    return null;
  }
}

function detectBridgeRegistration(repoRoot) {
  const stable = getStableBridgeFiles();
  const expectedServer = stable.server;
  const legacyServer = path.join(repoRoot, ".vorth", "mcp", "vorth-agy-native-bridge", "server.mjs");
  const configPaths = getAgyMcpConfigPaths();
  const result = {
    configPath: configPaths[0],
    checkedConfigPaths: configPaths,
    registered: false,
    status: configPaths.some(fs.existsSync) ? "not_registered" : "unknown",
    expectedServer,
    legacyServer,
    suggestion: { mcpServers: { "vorth-agy-native-bridge": { command: "node", args: [expectedServer] } } }
  };
  const registrations = [];
  for (const configPath of configPaths) {
    if (!fs.existsSync(configPath)) continue;
    try {
      const parsed = JSON.parse(stripBom(fs.readFileSync(configPath, "utf8")));
      const server = getMcpServers(parsed)["vorth-agy-native-bridge"];
      if (!server) continue;
      const args = Array.isArray(server.args) ? server.args.map(String) : [];
      const registered = args.some((arg) => samePath(arg, expectedServer));
      const legacyRegistered = args.some((arg) => samePath(arg, legacyServer));
      registrations.push({
        configPath,
        registered,
        legacyRegistered,
        status: registered ? "registered" : legacyRegistered ? "legacy_registration" : "registered_different_path",
        command: server.command || null
      });
    } catch (error) {
      registrations.push({ configPath, registered: false, status: "unreadable", error: sanitize(error.message) });
    }
  }
  const selected = registrations.find((item) => item.registered) || registrations[0];
  return selected ? { ...result, ...selected, registrations } : result;
}

function detectJsonMcp(configPath, needle) {
  const result = { configPath, registered: false, status: fs.existsSync(configPath) ? "not_registered" : "unknown", serverNames: [] };
  if (!fs.existsSync(configPath)) return result;
  try {
    const parsed = JSON.parse(stripBom(fs.readFileSync(configPath, "utf8")));
    const servers = getMcpServers(parsed);
    for (const [name, server] of Object.entries(servers)) {
      if (JSON.stringify({ name, server }).toLowerCase().includes(needle.toLowerCase())) result.serverNames.push(name);
    }
    result.registered = result.serverNames.length > 0;
    result.status = result.registered ? "registered" : "not_registered";
    return result;
  } catch (error) {
    return { ...result, status: "unreadable", error: sanitize(error.message) };
  }
}

function runBridgeSelfTest(serverPath) {
  const result = spawnSync(process.execPath, [serverPath, "--self-test"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 5 * 1024 * 1024
  });
  if (result.error || result.status !== 0) return { status: "error", message: sanitize(result.error?.message || result.stderr || "Self-test failed") };
  try {
    const parsed = JSON.parse(result.stdout || "{}");
    const workerReady = Boolean(parsed.status?.ready);
    const targetModelReady = Boolean(parsed.flashHigh);
    return {
      status: workerReady && targetModelReady ? "ready" : workerReady ? "target_model_unavailable" : "not_ready",
      ready: workerReady && targetModelReady,
      workerReady,
      targetModelReady,
      modelStatus: parsed.modelStatus || null,
      modelError: parsed.modelError || null,
      flashHigh: parsed.flashHigh || null,
      availableModelCount: Array.isArray(parsed.models) ? parsed.models.length : 0,
      ...(targetModelReady || !Array.isArray(parsed.models) ? {} : {
        availableModels: parsed.models.slice(0, 32).map((model) => ({
          id: model.id || null,
          displayName: model.displayName || null,
          model: model.model || null
        }))
      }),
      languageServerCount: parsed.status?.languageServerCount ?? null
    };
  } catch {
    return { status: "unknown", output: sanitize((result.stdout || "").slice(0, 1200)) };
  }
}

function detectCli(command) {
  const version = spawnWindowsAware(command, ["--version"], { timeout: 10000, maxBuffer: 1024 * 1024 });
  if (!version.error && version.status === 0) return { status: "detected", version: sanitize((version.stdout || version.stderr || "").trim()) || "unknown" };
  const help = spawnWindowsAware(command, ["--help"], { timeout: 10000, maxBuffer: 1024 * 1024 });
  if (!help.error && help.status === 0) return { status: "detected", version: "unknown" };
  const error = version.error || help.error;
  if (error?.code === "ENOENT") return { status: "missing" };
  return { status: "error", message: sanitize(error?.message || version.stderr || help.stderr || `Unable to run ${command}`) };
}

function spawnWindowsAware(commandName, args, options = {}) {
  if (process.platform === "win32") {
    const command = resolveWindowsCommand(commandName);
    if (!command) {
      return { error: Object.assign(new Error(`${commandName} not found in PATH`), { code: "ENOENT" }), status: null, stdout: "", stderr: "" };
    }
    const spawnOptions = {
      encoding: "utf8",
      windowsHide: true,
      ...options
    };
    if ([".bat", ".cmd"].includes(path.extname(command).toLowerCase())) {
      const script = `& ${[command, ...args].map(quotePowerShellLiteral).join(" ")}`;
      return spawnSync("powershell.exe", ["-NoProfile", "-Command", script], spawnOptions);
    }
    return spawnSync(command, args, spawnOptions);
  }
  return spawnSync(commandName, args, { encoding: "utf8", windowsHide: true, ...options });
}

function resolveWindowsCommand(command) {
  if (path.isAbsolute(command) && fs.existsSync(command)) return command;
  if (process.platform !== "win32") {
    for (const directory of (process.env.PATH || "").split(path.delimiter).filter(Boolean)) {
      const resolved = path.join(directory, command);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
    }
    return null;
  }
  const extensions = (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((extension) => extension.toLowerCase());
  const candidates = path.extname(command)
    ? [command]
    : extensions.map((extension) => `${command}${extension}`);
  for (const directory of (process.env.PATH || "").split(path.delimiter).filter(Boolean)) {
    for (const candidate of candidates) {
      const resolved = path.join(directory.replace(/^"|"$/g, ""), candidate);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
    }
  }
  const result = spawnSync("where.exe", [command], { encoding: "utf8", windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) return null;
  return (result.stdout || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null;
}

function getStableBridgeFiles() {
  const dir = path.join(getVorthHome(), "bridge");
  return {
    dir,
    server: path.join(dir, "server.mjs"),
    profileManager: path.join(dir, "profile-manager.mjs"),
    state: path.join(getVorthHome(), "bridge-state.json")
  };
}

function detectStableBridgeVersion(stable) {
  const expected = readPackageVersion(path.join(bridgeTemplateDir, "package.json"));
  const installed = readPackageVersion(path.join(stable.dir, "package.json"));
  return {
    expected,
    installed,
    status: !installed ? "missing" : installed === expected ? "current" : "outdated"
  };
}

function readPackageVersion(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(stripBom(fs.readFileSync(filePath, "utf8"))).version || null;
  } catch {
    return null;
  }
}

function detectJsonMcpAcross(configPaths, needle) {
  const detections = configPaths.map((configPath) => detectJsonMcp(configPath, needle));
  const selected = detections.find((item) => item.registered) || detections.find((item) => item.status !== "unknown") || detections[0];
  return { ...selected, checkedConfigPaths: configPaths, registrations: detections.filter((item) => item.registered) };
}

function getMcpServers(parsed) {
  if (parsed?.mcpServers && typeof parsed.mcpServers === "object") return parsed.mcpServers;
  if (parsed?.servers && typeof parsed.servers === "object") return parsed.servers;
  return {};
}

function ensureStableBridgeFiles() {
  const destination = getStableBridgeFiles().dir;
  if (!fs.existsSync(bridgeTemplateDir)) throw cliError(`Bridge template missing: ${bridgeTemplateDir}`);
  ensureDir(destination);
  fs.cpSync(bridgeTemplateDir, destination, { recursive: true, force: true });
  return getStableBridgeFiles();
}

function getAgyMcpConfigPaths() {
  if (process.env.VORTH_AGY_MCP_CONFIG) return [path.resolve(process.env.VORTH_AGY_MCP_CONFIG)];
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return [...new Set([
    path.join(appData, "Antigravity IDE", "User", "mcp.json"),
    path.join(appData, "Antigravity", "User", "mcp.json"),
    path.join(os.homedir(), ".gemini", "config", "mcp_config.json")
  ].map((item) => path.resolve(item)))];
}

function resolveAntigravityCli() {
  const candidates = [
    process.env.ANTIGRAVITY_IDE_CLI,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "Antigravity IDE", "bin", "antigravity-ide.cmd"),
    "antigravity-ide",
    "antigravity"
  ].filter(Boolean);
  for (const candidate of candidates) {
    const resolved = resolveWindowsCommand(candidate);
    if (resolved) return resolved;
  }
  return null;
}

function spawnAntigravityAddMcp(command, definition, cwd) {
  const options = {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    timeout: 60000,
    maxBuffer: 5 * 1024 * 1024
  };
  if (process.platform === "win32") {
    const invocation = resolveAntigravityNodeCli(command);
    if (invocation) {
      return spawnSync(invocation.executable, [invocation.cliScript, "--add-mcp", definition], {
        ...options,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", VSCODE_DEV: "" }
      });
    }
  }
  return spawnWindowsAware(command, ["--add-mcp", definition], options);
}

function resolveAntigravityNodeCli(command) {
  const installDir = path.resolve(path.dirname(command), "..");
  const cliScript = path.join(installDir, "resources", "app", "out", "cli.js");
  if (!fs.existsSync(cliScript)) return null;
  for (const name of ["Antigravity IDE.exe", "Antigravity.exe"]) {
    const executable = path.join(installDir, name);
    if (fs.existsSync(executable)) return { executable, cliScript };
  }
  return null;
}

function quotePowerShellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function getRepoContext(repoOption) {
  const cwd = path.resolve(repoOption || process.cwd());
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw cliError(`Repository path is not a directory: ${cwd}`);
  let root = cwd;
  let git = "none";
  let branch = "none";
  try {
    root = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    git = "present";
  } catch {
    root = cwd;
  }
  if (git === "present") {
    try {
      branch = execFileSync("git", ["-C", root, "branch", "--show-current"], {
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"]
      }).trim() || "detached";
    } catch {
      branch = "unknown";
    }
  }
  return { root: path.resolve(root), git, branch };
}

function parseArgs(args) {
  const result = { provided: new Set() };
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (!item.startsWith("--")) throw cliError(`Unexpected argument: ${item}`);
    const equals = item.indexOf("=");
    const rawKey = (equals >= 0 ? item.slice(2, equals) : item.slice(2));
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    let value;
    if (equals >= 0) value = item.slice(equals + 1);
    else {
      const next = args[index + 1];
      if (!next || next.startsWith("--")) value = true;
      else {
        value = next;
        index += 1;
      }
    }
    result[key] = value;
    result.provided.add(key);
  }
  return result;
}

function assertKnownOptions(options, allowed) {
  for (const key of options.provided) {
    if (!allowed.has(key)) throw cliError(`Unknown option: --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  }
}

function normalizeEnum(key, value) {
  let normalized = String(value).toLowerCase();
  if (["true", "yes", "on"].includes(normalized)) {
    normalized = key === "ponytail" ? "full" : key === "eccAntigravity" || key === "eccCodex" ? "minimal" : "enabled";
  }
  if (["false", "no", "off"].includes(normalized)) normalized = "disabled";
  if (!OPTION_ENUMS[key].includes(normalized)) throw cliError(`Invalid --${key}: ${value}. Use ${OPTION_ENUMS[key].join(", ")}.`);
  return normalized;
}

function isTrue(value) {
  if (value === true) return true;
  return ["true", "yes", "on", "1"].includes(String(value).toLowerCase());
}

function isDisabled(value) {
  return ["disabled", "skipped", "inactive"].includes(value);
}

function readTemplate(relativePath) {
  return fs.readFileSync(path.join(projectTemplateDir, relativePath), "utf8");
}

function writeIfMissing(filePath, text) {
  if (!fs.existsSync(filePath)) writeText(filePath, text);
}

function writeText(filePath, text) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, ensureTrailingNewline(text), "utf8");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function upsertManagedBlock(filePath, block) {
  const normalized = ensureTrailingNewline(block.trim());
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const startIndex = existing.indexOf(START);
  const endIndex = existing.indexOf(END, Math.max(startIndex, 0));
  let next;
  if (startIndex >= 0 && endIndex >= startIndex) {
    const afterEnd = endIndex + END.length;
    next = `${existing.slice(0, startIndex).trimEnd()}\n\n${normalized}${existing.slice(afterEnd).replace(/^\s*/, "\n")}`.trimStart();
  } else if (!existing.trim()) next = normalized;
  else next = `${existing.trimEnd()}\n\n${normalized}`;
  writeText(filePath, next);
}

function assertDelimitedMarkers(filePath, startMarker, endMarker) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  const starts = text.split(startMarker).length - 1;
  const ends = text.split(endMarker).length - 1;
  const startIndex = text.indexOf(startMarker);
  const endIndex = text.indexOf(endMarker);
  if (starts === 0 && ends === 0) return;
  if (starts !== 1 || ends !== 1 || endIndex < startIndex) {
    throw cliError(`Malformed Vorth managed marker in ${filePath}. Repair the marker pair before retrying.`);
  }
}

function upsertDelimitedBlock(filePath, startMarker, endMarker, block) {
  const normalized = ensureTrailingNewline(block.trim());
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const startIndex = existing.indexOf(startMarker);
  const endIndex = existing.indexOf(endMarker, Math.max(startIndex, 0));
  let next;
  if (startIndex >= 0 && endIndex >= startIndex) {
    const afterEnd = endIndex + endMarker.length;
    next = `${existing.slice(0, startIndex).trimEnd()}\n\n${normalized}${existing.slice(afterEnd).replace(/^\s*/, "\n")}`.trimStart();
  } else if (!existing.trim()) next = normalized;
  else next = `${existing.trimEnd()}\n\n${normalized}`;
  writeText(filePath, next);
}

function removeDelimitedBlock(filePath, startMarker, endMarker) {
  if (!fs.existsSync(filePath)) return;
  const existing = fs.readFileSync(filePath, "utf8");
  const startIndex = existing.indexOf(startMarker);
  const endIndex = existing.indexOf(endMarker, Math.max(startIndex, 0));
  if (startIndex < 0 || endIndex < startIndex) return;
  const afterEnd = endIndex + endMarker.length;
  const next = `${existing.slice(0, startIndex).trimEnd()}${existing.slice(afterEnd) ? "\n" : ""}${existing.slice(afterEnd).trimStart()}`;
  fs.writeFileSync(filePath, next.trim() ? ensureTrailingNewline(next) : "", "utf8");
}

function removeManagedBlock(filePath) {
  removeDelimitedBlock(filePath, START, END);
}

function hasManagedBlock(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const text = fs.readFileSync(filePath, "utf8");
  const start = text.indexOf(START);
  return start >= 0 && text.indexOf(END, start) >= start;
}

function parseKeyValueFile(filePath) {
  const result = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (match) result[match[1]] = match[2].trim();
  }
  return result;
}

function summarizeContext(filePath) {
  if (!fs.existsSync(filePath)) return "missing";
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return "empty";
  return text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 3).join(" | ");
}

function fileContains(filePath, pattern) {
  if (!fs.existsSync(filePath)) return false;
  try {
    return fs.readFileSync(filePath, "utf8").toLowerCase().includes(String(pattern).toLowerCase());
  } catch {
    return false;
  }
}

function findNamedDirectory(base, needle, depth) {
  if (!base || depth < 0 || !fs.existsSync(base)) return false;
  let entries;
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.toLowerCase().includes(needle.toLowerCase())) return true;
    if (depth > 0 && findNamedDirectory(path.join(base, entry.name), needle, depth - 1)) return true;
  }
  return false;
}

function anyExists(paths) {
  return paths.some((item) => fs.existsSync(item));
}

function gitRevision(dir) {
  if (!fs.existsSync(dir)) return null;
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function isInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function samePath(a, b) {
  const left = path.resolve(String(a));
  const right = path.resolve(String(b));
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function ensureTrailingNewline(text) {
  return `${String(text).replace(/\s*$/, "")}\n`;
}

function stripBom(text) {
  return String(text).replace(/^\uFEFF/, "");
}

function sanitize(text) {
  return String(text || "")
    .replace(/(--csrf_token(?:=|\s+))\S+/gi, "$1<redacted>")
    .replace(/(--extension_csrf_token(?:=|\s+))\S+/gi, "$1<redacted>")
    .replace(/(oauth|token|secret|csrf|cookie)[A-Za-z0-9_ .:=/-]{0,160}/gi, "$1<redacted>");
}

function emitResult(result, options) {
  if (isTrue(options.json)) {
    const printable = { ...result };
    delete printable.exitCode;
    process.stdout.write(`${JSON.stringify(printable, null, 2)}\n`);
    return;
  }
  if (result.command === "help") {
    process.stdout.write(`${result.text}\n`);
    return;
  }
  process.stdout.write(`${humanSummary(result)}\n`);
}

function humanSummary(result) {
  const lines = [`Vorth ${result.command}: ${result.status || "ok"}`];
  if (result.repoRoot) lines.push(`Repo: ${result.repoRoot}`);
  if (result.lifecycle) lines.push(`Lifecycle: ${result.lifecycle}`);
  if (result.readiness?.status) lines.push(`Readiness: ${result.readiness.status}`);
  if (result.setupRequired?.length) {
    lines.push("Setup required:");
    for (const item of result.setupRequired) lines.push(`- ${item.stack}: ${item.reason}`);
  }
  if (result.issues?.length) {
    lines.push("Issues:");
    for (const issue of result.issues) lines.push(`- ${issue.severity}: ${issue.message}`);
  }
  if (result.results?.length) {
    lines.push("Results:");
    for (const item of result.results) lines.push(`- ${item.stack}: ${item.status}`);
  }
  if (result.command === "status" && result.lifecycle === "active") {
    lines.push("Stack health:");
    lines.push(`- Superpowers: ${result.superpowers?.health || "unknown"}`);
    lines.push(`- ECC Antigravity: ${result.ecc?.antigravity?.health || "unknown"}`);
    lines.push(`- ECC Codex: ${result.ecc?.codex?.health || "unknown"}`);
    lines.push(`- CodeGraph: ${result.codegraph?.health || "unknown"}`);
    lines.push(`- Impeccable: ${result.impeccable?.health || "unknown"}`);
    lines.push(`- Layers: ${result.layers?.health || "unknown"}`);
    lines.push(`- Ponytail: ${result.ponytail?.health || "unknown"}`);
    lines.push(`- RTK: ${result.rtk?.health || "unknown"}`);
    lines.push(`- Caveman: ${result.caveman?.health || "unknown"}`);
    lines.push(`- Agy bridge: ${result.agyNativeBridge?.health || "unknown"}`);
  }
  if (result.next) lines.push(`Next: ${result.next}`);
  return lines.join("\n");
}

function helpText() {
  return `Vorth CLI\n\n` +
    `Usage:\n` +
    `  vorth configure [--preset agy-codex|balanced|minimal]\n` +
    `  vorth init [--repo <path>] [--preset <name>] [--no-setup] [stack options]\n` +
    `  vorth sync [--repo <path>] [--json] [--dry-run]\n` +
    `  vorth setup [--stack <name>] [--target agy|codex] [approval options]\n` +
    `  vorth repair [--repo <path>] [--apply] [approval options]\n` +
    `  vorth bridge init|login|launch|status [--repo <path>]\n` +
    `  vorth status [--repo <path>] [--json]\n` +
    `  vorth doctor [--repo <path>] [--probe] [--json]\n` +
    `  vorth reset --confirm [--repo <path>] [--json]\n\n` +
    `Interactive init performs cheap project activation, then offers a guided repair plan. Use --json or --no-setup for deterministic activation only.\n` +
    `Repair reconciles required stack health; network and harness changes still require explicit approval. Status is read-only; doctor --probe may contact the local Antigravity language server.`;
}

function cliError(message, exitCode = 1) {
  const error = new Error(message);
  error.exitCode = exitCode;
  return error;
}
