#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_ROOT = path.resolve(__dirname, "..");
const PROJECT_TEMPLATE_DIR = path.join(SKILL_ROOT, "templates", "project");
const BRIDGE_TEMPLATE_DIR = path.join(SKILL_ROOT, "templates", "mcp", "vorth-agy-native-bridge");
const START = "<!-- VORTH:START -->";
const END = "<!-- VORTH:END -->";

const command = process.argv[2] || "help";
const options = parseArgs(process.argv.slice(3));

try {
  switch (command) {
    case "init":
      cmdInit(options);
      break;
    case "status":
      cmdStatus(options);
      break;
    case "reset":
      cmdReset(options);
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      fail(`Unknown command: ${command}\nRun: vorth help`);
  }
} catch (error) {
  fail(error.message || String(error));
}

function cmdInit(options) {
  const repo = getRepoContext(options.repo);
  const bridge = normalizeBridgeOption(options.bridge || "disabled");
  const codegraph = normalizeCodeGraphOption(options.codegraph || "enabled");
  const impeccable = normalizeImpeccableOption(options.impeccable || "auto");
  const layers = normalizeLayersOption(options.layers || "advisory");
  const vorthDir = path.join(repo.root, ".vorth");

  ensureDir(vorthDir);
  ensureDir(path.join(vorthDir, "instructions"));
  ensureDir(path.join(vorthDir, "plans"));
  ensureDir(path.join(vorthDir, "mcp"));
  ensureDir(path.join(vorthDir, "vendor"));

  writeConfig(repo, bridge, codegraph, impeccable, layers);
  writeIfMissing(path.join(vorthDir, "context.md"), readTemplate("context.md"));
  writeText(path.join(vorthDir, "instructions", "stack-routing.md"), readTemplate(path.join("instructions", "stack-routing.md")));
  writeText(path.join(vorthDir, "instructions", "superpowers-ecc.md"), readTemplate(path.join("instructions", "superpowers-ecc.md")));
  writeText(path.join(vorthDir, "instructions", "codegraph.md"), readTemplate(path.join("instructions", "codegraph.md")));
  writeText(path.join(vorthDir, "instructions", "impeccable.md"), readTemplate(path.join("instructions", "impeccable.md")));
  writeText(path.join(vorthDir, "instructions", "layers.md"), readTemplate(path.join("instructions", "layers.md")));
  writeText(path.join(vorthDir, "instructions", "turn-process.md"), readTemplate(path.join("instructions", "turn-process.md")));

  upsertManagedBlock(path.join(repo.root, "GEMINI.md"), readTemplate("GEMINI.block.md"));
  upsertManagedBlock(path.join(repo.root, "AGENTS.md"), readTemplate("AGENTS.block.md"));

  if (bridge === "enabled") {
    copyBridgeTemplate(repo.root);
  }

  const codeGraphInit = runCodeGraphInit(repo.root, codegraph);
  const impeccableInstall = runImpeccableInstall(repo.root, impeccable);
  const layersInstall = runLayersInstall(repo.root, layers);
  const status = collectStatus(repo, { runSelfTest: bridge === "enabled" });
  printInitResult(repo, bridge, codegraph, impeccable, layers, status, codeGraphInit, impeccableInstall, layersInstall);
}

function cmdStatus(options) {
  const repo = getRepoContext(options.repo);
  const status = collectStatus(repo, { runSelfTest: !isFalseOption(options.selfTest) });
  if (options.json) {
    printJson(status);
    return;
  }

  printStatus(status);
}

function cmdReset(options) {
  if (!options.confirm && !options.yes) {
    fail("Refusing reset without --confirm. This removes only .vorth/ and Vorth managed blocks.");
  }

  const repo = getRepoContext(options.repo);
  const vorthDir = path.join(repo.root, ".vorth");

  removeManagedBlock(path.join(repo.root, "GEMINI.md"));
  removeManagedBlock(path.join(repo.root, "AGENTS.md"));

  const resolvedVorthDir = path.resolve(vorthDir);
  if (path.basename(resolvedVorthDir) !== ".vorth" || !isInside(repo.root, resolvedVorthDir)) {
    fail(`Unsafe .vorth path resolved outside repository: ${resolvedVorthDir}`);
  }

  if (fs.existsSync(resolvedVorthDir)) {
    fs.rmSync(resolvedVorthDir, { recursive: true, force: true });
  }

  console.log("Vorth reset complete.");
  console.log(`Repo: ${repo.root}`);
  console.log("Removed: .vorth/ and Vorth managed blocks in GEMINI.md / AGENTS.md");
  console.log("Preserved: .agent/, .agents/, .codex/, ECC/Superpowers installs, and user-level MCP config");
}

function collectStatus(repo, options = {}) {
  const vorthConfigPath = path.join(repo.root, ".vorth", "vorth.config.md");
  const configExists = fs.existsSync(vorthConfigPath);
  const config = configExists ? parseKeyValueFile(vorthConfigPath) : {};
  const bridgeDir = path.join(repo.root, ".vorth", "mcp", "vorth-agy-native-bridge");
  const bridgeServer = path.join(bridgeDir, "server.mjs");
  const mcpRegistration = detectMcpRegistration(repo.root);
  const bridgePresent = fs.existsSync(bridgeServer);

  let bridgeSelfTest = { status: "skipped" };
  if (options.runSelfTest && bridgePresent) {
    bridgeSelfTest = runBridgeSelfTest(bridgeServer);
  }

  return {
    repoRoot: repo.root,
    branch: repo.branch,
    git: repo.git,
    vorthConfig: {
      exists: configExists,
      path: vorthConfigPath,
      values: config
    },
    activation: {
      geminiBlock: hasManagedBlock(path.join(repo.root, "GEMINI.md")),
      agentsBlock: hasManagedBlock(path.join(repo.root, "AGENTS.md"))
    },
    superpowers: detectSuperpowers(repo.root, config),
    ecc: detectEcc(repo.root, config),
    codegraph: detectCodeGraph(repo.root, config),
    impeccable: detectImpeccable(repo.root, config),
    layers: detectLayers(repo.root, config),
    agyNativeBridge: {
      config: config.agy_native_bridge || "missing",
      files: bridgePresent ? "present" : "missing",
      path: bridgeServer,
      mcpRegistration,
      selfTest: bridgeSelfTest
    },
    deferredStacks: {},
    conditionalStacks: {
      impeccable: config.impeccable || "auto",
      layers: config.layers || "advisory"
    },
    context: summarizeContext(path.join(repo.root, ".vorth", "context.md"))
  };
}

function writeConfig(repo, bridge, codegraph, impeccable, layers) {
  const configPath = path.join(repo.root, ".vorth", "vorth.config.md");
  const bridgeExecutor = bridge === "enabled" ? "enabled" : bridge === "skipped" ? "skipped" : "disabled";

  if (!fs.existsSync(configPath)) {
    const template = readTemplate("vorth.config.md")
      .replaceAll("{{AGY_NATIVE_BRIDGE}}", bridge)
      .replaceAll("{{AGY_FLASH_HIGH_EXECUTOR}}", bridgeExecutor)
      .replaceAll("{{CODEGRAPH}}", codegraph)
      .replaceAll("{{IMPECCABLE}}", impeccable)
      .replaceAll("{{LAYERS}}", layers);
    writeText(configPath, template);
    return;
  }

  let text = fs.readFileSync(configPath, "utf8");
  text = upsertKey(text, "install_scope", "project-local");
  text = upsertKey(text, "mode", "project-local");
  text = upsertKey(text, "agy_native_bridge", bridge);
  text = upsertKey(text, "agy_native_bridge_profile", "active");
  text = upsertKey(text, "agy_native_bridge_server", ".vorth/mcp/vorth-agy-native-bridge/server.mjs");
  text = upsertKey(text, "agy_flash_high_executor", bridgeExecutor);
  text = upsertKey(text, "agy_flash_high_model_id", "gemini-3-flash-agent");
  text = upsertKey(text, "agy_flash_high_model_enum", "auto");
  text = upsertKey(text, "agy_flash_high_scope", "agy-only");
  text = upsertKey(text, "codex_flash_high_executor", "disabled");
  text = upsertKey(text, "codegraph", codegraph);
  text = upsertKey(text, "codegraph_scope", "project-local");
  text = upsertKey(text, "codegraph_index", ".codegraph");
  text = upsertKey(text, "codegraph_policy", "broad-exploration-first");
  text = upsertKey(text, "impeccable", impeccable);
  text = upsertKey(text, "impeccable_scope", "project-local");
  text = upsertKey(text, "impeccable_policy", "frontend-quality-gate");
  text = upsertKey(text, "layers", layers);
  text = upsertKey(text, "layers_scope", "project-local");
  text = upsertKey(text, "layers_policy", "product-decision-gate");
  text = upsertKey(text, "conditional_stacks", "impeccable, layers");
  text = upsertKey(text, "deferred_stacks", "none");
  writeText(configPath, ensureTrailingNewline(text));
}

function copyBridgeTemplate(repoRoot) {
  const destination = path.join(repoRoot, ".vorth", "mcp", "vorth-agy-native-bridge");
  if (!fs.existsSync(BRIDGE_TEMPLATE_DIR)) {
    fail(`Bridge template missing: ${BRIDGE_TEMPLATE_DIR}`);
  }

  ensureDir(destination);
  fs.cpSync(BRIDGE_TEMPLATE_DIR, destination, { recursive: true, force: true });
}

function detectSuperpowers(repoRoot, config) {
  const vendored = fs.existsSync(path.join(repoRoot, ".vorth", "vendor", "superpowers"));
  return {
    status: config.superpowers || (vendored ? "project-local" : "missing"),
    scope: config.superpowers_scope || (vendored ? "project-local" : "unknown"),
    vendored
  };
}

function detectEcc(repoRoot, config) {
  const statePath = path.join(repoRoot, ".agent", "ecc-install-state.json");
  const skillsDir = path.join(repoRoot, ".agent", "skills");
  return {
    antigravity: {
      status: fs.existsSync(statePath) ? "installed" : (config.ecc_antigravity || "missing"),
      installState: fs.existsSync(statePath),
      skillsDir: fs.existsSync(skillsDir)
    },
    codex: {
      status: config.ecc_codex || "skipped"
    }
  };
}

function detectCodeGraph(repoRoot, config) {
  const indexPath = path.join(repoRoot, ".codegraph");
  return {
    config: config.codegraph || "missing",
    scope: config.codegraph_scope || "project-local",
    policy: config.codegraph_policy || "broad-exploration-first",
    cli: detectCodeGraphCli(),
    index: {
      status: fs.existsSync(indexPath) ? "present" : "missing",
      path: indexPath
    },
    mcpRegistration: detectCodeGraphMcpRegistration()
  };
}

function detectImpeccable(repoRoot, config) {
  const agentsSkill = path.join(repoRoot, ".agents", "skills", "impeccable", "SKILL.md");
  const geminiSkill = path.join(repoRoot, ".gemini", "skills", "impeccable", "SKILL.md");
  const codexHooks = path.join(repoRoot, ".codex", "hooks.json");
  const productDoc = path.join(repoRoot, "PRODUCT.md");
  const designDoc = path.join(repoRoot, "DESIGN.md");
  const impeccableDir = path.join(repoRoot, ".impeccable");
  const providers = {
    agentsSkill: fs.existsSync(agentsSkill),
    geminiSkill: fs.existsSync(geminiSkill),
    codexHooks: fileContains(codexHooks, "impeccable")
  };
  const installed = providers.agentsSkill || providers.geminiSkill || providers.codexHooks || fs.existsSync(impeccableDir);
  const frontendDetected = detectFrontend(repoRoot);
  const configured = config.impeccable || "missing";

  let install = "missing";
  if (["disabled", "skipped"].includes(configured)) {
    install = configured;
  } else if (installed) {
    install = "installed";
  } else if (configured === "auto" && frontendDetected.detected) {
    install = "recommended";
  } else if (configured === "auto") {
    install = "not_required";
  }

  return {
    config: configured,
    scope: config.impeccable_scope || "project-local",
    policy: config.impeccable_policy || "frontend-quality-gate",
    install,
    providers,
    paths: {
      agentsSkill,
      geminiSkill,
      codexHooks,
      impeccableDir
    },
    context: {
      product: fs.existsSync(productDoc) ? "present" : "missing",
      design: fs.existsSync(designDoc) ? "present" : "missing"
    },
    frontend: frontendDetected
  };
}

function detectLayers(repoRoot, config) {
  const vendorDir = path.join(repoRoot, ".vorth", "vendor", "layers-skills");
  const skillsDir = path.join(vendorDir, "skills");
  const skills = {
    intro: fs.existsSync(path.join(skillsDir, "layers-intro", "SKILL.md")),
    orient: fs.existsSync(path.join(skillsDir, "layers-orient", "SKILL.md")),
    conceptualModel: fs.existsSync(path.join(skillsDir, "layers-conceptual-model", "SKILL.md"))
  };
  const vendored = fs.existsSync(vendorDir);
  const configured = config.layers || "missing";

  let install = "missing";
  if (["disabled", "skipped"].includes(configured)) {
    install = configured;
  } else if (vendored) {
    install = "vendored";
  } else if (configured === "advisory") {
    install = "advisory";
  }

  return {
    config: configured,
    scope: config.layers_scope || "project-local",
    policy: config.layers_policy || "product-decision-gate",
    install,
    vendorDir,
    skills
  };
}

function detectFrontend(repoRoot) {
  const evidence = [];
  const packagePath = path.join(repoRoot, "package.json");
  if (fs.existsSync(packagePath)) {
    try {
      const parsed = JSON.parse(stripBom(fs.readFileSync(packagePath, "utf8")));
      const deps = {
        ...parsed.dependencies,
        ...parsed.devDependencies
      };
      for (const name of ["@vitejs/plugin-react", "astro", "next", "react", "remix", "svelte", "tailwindcss", "vite", "vue"]) {
        if (deps[name]) evidence.push(`package:${name}`);
      }
    } catch {
      evidence.push("package.json:unreadable");
    }
  }

  for (const relative of ["app", "pages", "src/components", "src/app", "src/pages", "components"]) {
    if (fs.existsSync(path.join(repoRoot, relative))) evidence.push(`dir:${relative}`);
  }

  return {
    detected: evidence.length > 0,
    evidence: evidence.slice(0, 12)
  };
}

function detectCodeGraphCli() {
  const versionResult = spawnCodeGraph(["--version"], { timeout: 10000, maxBuffer: 1024 * 1024 });

  if (!versionResult.error && versionResult.status === 0) {
    return {
      status: "detected",
      version: sanitize((versionResult.stdout || versionResult.stderr || "").trim()) || "unknown"
    };
  }

  const helpResult = spawnCodeGraph(["--help"], { timeout: 10000, maxBuffer: 1024 * 1024 });

  if (!helpResult.error && helpResult.status === 0) {
    return { status: "detected", version: "unknown" };
  }

  const error = versionResult.error || helpResult.error;
  if (error && error.code === "ENOENT") {
    return {
      status: "missing",
      install: {
        windows: "irm https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.ps1 | iex",
        npm: "npm i -g @colbymchenry/codegraph"
      }
    };
  }

  return {
    status: "error",
    message: sanitize(error?.message || versionResult.stderr || helpResult.stderr || "Unable to run codegraph")
  };
}

function detectCodeGraphMcpRegistration() {
  const userConfig = path.join(os.homedir(), ".gemini", "config", "mcp_config.json");
  const result = {
    userConfig,
    userConfigExists: fs.existsSync(userConfig),
    status: "unknown",
    registered: false,
    serverNames: [],
    suggestion: "Run `codegraph install` after installing the CodeGraph CLI to let CodeGraph wire supported agents."
  };

  if (!result.userConfigExists) {
    return result;
  }

  let parsed;
  try {
    parsed = JSON.parse(stripBom(fs.readFileSync(userConfig, "utf8")));
  } catch (error) {
    result.status = "unreadable";
    result.error = `Unable to parse MCP config JSON: ${error.message}`;
    return result;
  }

  const servers = parsed?.mcpServers && typeof parsed.mcpServers === "object" ? parsed.mcpServers : {};
  for (const [name, server] of Object.entries(servers)) {
    const haystack = JSON.stringify({ name, server }).toLowerCase();
    if (haystack.includes("codegraph")) {
      result.serverNames.push(name);
    }
  }

  result.registered = result.serverNames.length > 0;
  result.status = result.registered ? "registered" : "not_registered";
  return result;
}

function runCodeGraphInit(repoRoot, codegraph) {
  if (codegraph !== "enabled") {
    return { status: "skipped", reason: `codegraph ${codegraph}` };
  }

  const indexPath = path.join(repoRoot, ".codegraph");
  if (fs.existsSync(indexPath)) {
    return { status: "already_present", path: indexPath };
  }

  const cli = detectCodeGraphCli();
  if (cli.status !== "detected") {
    return { status: "missing_cli", cli };
  }

  const result = spawnCodeGraph(["init"], {
    cwd: repoRoot,
    timeout: 120000,
    maxBuffer: 5 * 1024 * 1024
  });

  if (result.error) {
    return { status: "error", message: sanitize(result.error.message) };
  }

  if (result.status !== 0) {
    return {
      status: "error",
      exitCode: result.status,
      stderr: sanitize((result.stderr || "").slice(0, 1200))
    };
  }

  return {
    status: "initialized",
    stdout: sanitize((result.stdout || "").slice(0, 1200))
  };
}

function runImpeccableInstall(repoRoot, impeccable) {
  if (impeccable !== "enabled") {
    return { status: "skipped", reason: `impeccable ${impeccable}` };
  }

  const detected = detectImpeccable(repoRoot, { impeccable: "enabled" });
  if (detected.install === "installed") {
    return { status: "already_installed" };
  }

  const result = spawnWindowsAware("npx", ["--yes", "impeccable", "install", "--providers=gemini,codex", "--scope=project"], {
    cwd: repoRoot,
    timeout: 120000,
    maxBuffer: 5 * 1024 * 1024
  });

  if (result.error) {
    return { status: "error", message: sanitize(result.error.message) };
  }

  if (result.status !== 0) {
    return {
      status: "error",
      exitCode: result.status,
      stderr: sanitize((result.stderr || "").slice(0, 1200))
    };
  }

  return {
    status: "installed",
    stdout: sanitize((result.stdout || "").slice(0, 1200))
  };
}

function runLayersInstall(repoRoot, layers) {
  if (layers !== "enabled") {
    return { status: "skipped", reason: `layers ${layers}` };
  }

  const destination = path.join(repoRoot, ".vorth", "vendor", "layers-skills");
  if (fs.existsSync(destination)) {
    return { status: "already_present", path: destination };
  }

  ensureDir(path.dirname(destination));
  const result = spawnWindowsAware("git", ["clone", "https://github.com/jamiemill/layers-skills.git", destination], {
    cwd: repoRoot,
    timeout: 120000,
    maxBuffer: 5 * 1024 * 1024
  });

  if (result.error) {
    return { status: "error", message: sanitize(result.error.message) };
  }

  if (result.status !== 0) {
    return {
      status: "error",
      exitCode: result.status,
      stderr: sanitize((result.stderr || "").slice(0, 1200))
    };
  }

  return {
    status: "vendored",
    path: destination
  };
}

function spawnCodeGraph(args, options = {}) {
  return spawnWindowsAware("codegraph", args, options);
}

function spawnWindowsAware(commandName, args, options = {}) {
  if (process.platform === "win32") {
    const command = resolveWindowsCommand(commandName);
    if (!command) {
      return {
        error: Object.assign(new Error(`${commandName} not found in PATH`), { code: "ENOENT" }),
        status: null,
        stdout: "",
        stderr: ""
      };
    }

    const commandLine = [quoteCmdArg(command), ...args.map(quoteCmdArg)].join(" ");
    return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", commandLine], {
      encoding: "utf8",
      windowsHide: true,
      ...options
    });
  }

  return spawnSync(commandName, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options
  });
}

function resolveWindowsCommand(command) {
  const result = spawnSync("where.exe", [command], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 5000,
    maxBuffer: 1024 * 1024
  });

  if (result.error || result.status !== 0) return null;
  return (result.stdout || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null;
}

function quoteCmdArg(value) {
  const text = String(value);
  if (!/[ \t&()^%!<>"|]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function detectMcpRegistration(repoRoot) {
  const expectedServer = path.join(repoRoot, ".vorth", "mcp", "vorth-agy-native-bridge", "server.mjs");
  const userConfig = path.join(os.homedir(), ".gemini", "config", "mcp_config.json");
  const result = {
    userConfig,
    userConfigExists: fs.existsSync(userConfig),
    registered: false,
    serverName: "vorth-agy-native-bridge",
    expectedServer,
    matchedArgs: [],
    suggestion: {
      mcpServers: {
        "vorth-agy-native-bridge": {
          command: "node",
          args: [expectedServer]
        }
      }
    }
  };

  if (!result.userConfigExists) {
    result.status = "not_registered";
    return result;
  }

  let parsed;
  try {
    parsed = JSON.parse(stripBom(fs.readFileSync(userConfig, "utf8")));
  } catch (error) {
    result.status = "unreadable";
    result.error = `Unable to parse MCP config JSON: ${error.message}`;
    return result;
  }

  const server = parsed?.mcpServers?.["vorth-agy-native-bridge"];
  if (!server) {
    result.status = "not_registered";
    return result;
  }

  const args = Array.isArray(server.args) ? server.args.map(String) : [];
  result.matchedArgs = args;
  result.registered = args.some((arg) => samePath(arg, expectedServer));
  result.status = result.registered ? "registered" : "registered_different_path";
  result.command = server.command || null;
  return result;
}

function runBridgeSelfTest(serverPath) {
  const result = spawnSync(process.execPath, [serverPath, "--self-test"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 5 * 1024 * 1024
  });

  if (result.error) {
    return { status: "error", message: sanitize(result.error.message) };
  }

  if (result.status !== 0) {
    return {
      status: "error",
      exitCode: result.status,
      stderr: sanitize((result.stderr || "").slice(0, 1200))
    };
  }

  try {
    const parsed = JSON.parse(result.stdout || "{}");
    return {
      status: parsed.status?.ready ? "ready" : "not_ready",
      ready: Boolean(parsed.status?.ready),
      flashHigh: parsed.flashHigh || null,
      languageServerCount: parsed.status?.languageServerCount ?? null,
      usableLanguageServerCount: parsed.status?.usableLanguageServerCount ?? null
    };
  } catch {
    return {
      status: "unknown",
      stdout: sanitize((result.stdout || "").slice(0, 1200))
    };
  }
}

function printInitResult(repo, bridge, codegraph, impeccable, layers, status, codeGraphInit, impeccableInstall, layersInstall) {
  console.log("Vorth initialized.");
  console.log(`Repo: ${repo.root}`);
  console.log(`Branch: ${repo.branch}`);
  console.log("Mode: project-local");
  console.log(`Superpowers: ${status.superpowers.status}`);
  console.log(`ECC Antigravity: ${status.ecc.antigravity.status}`);
  console.log(`ECC Codex: ${status.ecc.codex.status}`);
  console.log(`CodeGraph: ${codegraph}`);
  console.log(`CodeGraph CLI: ${status.codegraph.cli.status}`);
  console.log(`CodeGraph index: ${status.codegraph.index.status}`);
  console.log(`CodeGraph init: ${codeGraphInit.status}`);
  console.log(`Impeccable: ${impeccable}`);
  console.log(`Impeccable install: ${status.impeccable.install}`);
  console.log(`Impeccable init: ${impeccableInstall.status}`);
  console.log(`Layers: ${layers}`);
  console.log(`Layers install: ${status.layers.install}`);
  console.log(`Layers init: ${layersInstall.status}`);
  console.log(`Agy Native Bridge: ${bridge}`);
  console.log("Activation: GEMINI.md + AGENTS.md managed blocks");
  if (codegraph === "enabled" && status.codegraph.cli.status !== "detected") {
    console.log("Next: install CodeGraph CLI from https://github.com/colbymchenry/codegraph, then rerun vorth init.");
  } else if (codegraph === "enabled" && status.codegraph.mcpRegistration.status !== "registered") {
    console.log("Next: run `codegraph install` if agent MCP wiring is not already configured.");
  }
  if (impeccable === "auto" && status.impeccable.install === "recommended") {
    console.log("Next: run vorth init --impeccable enabled to install Impeccable for frontend/UI quality gates.");
  }
  if (layers === "advisory") {
    console.log("Layers: advisory policy active; run vorth init --layers enabled only if you want project-local Layers skills vendored.");
  }
  if (bridge === "enabled") {
    console.log(`Bridge files: ${status.agyNativeBridge.files}`);
    console.log(`MCP registration: ${status.agyNativeBridge.mcpRegistration.status}`);
    console.log("Next: register the MCP server in Antigravity if status says not_registered.");
  }
  console.log("Next: restart/open a new Agy or Codex session in this repo for automatic activation.");
}

function printStatus(status) {
  console.log("Vorth status");
  console.log(`Repo: ${status.repoRoot}`);
  console.log(`Branch: ${status.branch}`);
  console.log(`Git: ${status.git}`);
  console.log(`Config: ${status.vorthConfig.exists ? "present" : "missing"}`);
  console.log(`GEMINI.md block: ${status.activation.geminiBlock ? "present" : "missing"}`);
  console.log(`AGENTS.md block: ${status.activation.agentsBlock ? "present" : "missing"}`);
  console.log(`Superpowers: ${status.superpowers.status} (${status.superpowers.scope})`);
  console.log(`ECC Antigravity: ${status.ecc.antigravity.status}`);
  console.log(`ECC Codex: ${status.ecc.codex.status}`);
  console.log(`CodeGraph config: ${status.codegraph.config}`);
  console.log(`CodeGraph CLI: ${status.codegraph.cli.status}${status.codegraph.cli.version ? ` (${status.codegraph.cli.version})` : ""}`);
  console.log(`CodeGraph index: ${status.codegraph.index.status}`);
  console.log(`CodeGraph MCP registration: ${status.codegraph.mcpRegistration.status}`);
  if (status.codegraph.config === "enabled" && status.codegraph.cli.status !== "detected") {
    console.log("CodeGraph install options:");
    console.log(JSON.stringify(status.codegraph.cli.install || {
      github: "https://github.com/colbymchenry/codegraph"
    }, null, 2));
  } else if (status.codegraph.config === "enabled" && status.codegraph.mcpRegistration.status !== "registered") {
    console.log(status.codegraph.mcpRegistration.suggestion);
  }
  console.log(`Impeccable config: ${status.impeccable.config}`);
  console.log(`Impeccable install: ${status.impeccable.install}`);
  console.log(`Impeccable frontend detected: ${status.impeccable.frontend.detected}`);
  console.log(`Impeccable context: PRODUCT.md ${status.impeccable.context.product}, DESIGN.md ${status.impeccable.context.design}`);
  console.log(`Layers config: ${status.layers.config}`);
  console.log(`Layers install: ${status.layers.install}`);
  console.log(`Layers skills: intro ${status.layers.skills.intro ? "present" : "missing"}, orient ${status.layers.skills.orient ? "present" : "missing"}`);
  console.log(`Agy Native Bridge config: ${status.agyNativeBridge.config}`);
  console.log(`Agy Native Bridge files: ${status.agyNativeBridge.files}`);
  console.log(`Agy MCP registration: ${status.agyNativeBridge.mcpRegistration.status}`);
  console.log(`Agy Bridge self-test: ${status.agyNativeBridge.selfTest.status}`);
  if (status.agyNativeBridge.mcpRegistration.status !== "registered") {
    console.log("Suggested MCP registration:");
    console.log(JSON.stringify(status.agyNativeBridge.mcpRegistration.suggestion, null, 2));
  }
  console.log("Conditional stacks: impeccable, layers");
  console.log("Deferred stacks: none");
  console.log(`Context: ${status.context}`);
}

function getRepoContext(repoOption) {
  const cwd = path.resolve(repoOption || process.cwd());
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
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (!item.startsWith("--")) continue;
    const rawKey = item.slice(2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function normalizeBridgeOption(value) {
  const normalized = String(value || "disabled").toLowerCase();
  if (["enabled", "disabled", "skipped"].includes(normalized)) return normalized;
  if (["true", "yes", "on"].includes(normalized)) return "enabled";
  if (["false", "no", "off"].includes(normalized)) return "disabled";
  fail(`Invalid --bridge value: ${value}. Use enabled, disabled, or skipped.`);
}

function normalizeCodeGraphOption(value) {
  const normalized = String(value || "enabled").toLowerCase();
  if (["enabled", "disabled", "skipped"].includes(normalized)) return normalized;
  if (["true", "yes", "on"].includes(normalized)) return "enabled";
  if (["false", "no", "off"].includes(normalized)) return "disabled";
  fail(`Invalid --codegraph value: ${value}. Use enabled, disabled, or skipped.`);
}

function normalizeImpeccableOption(value) {
  const normalized = String(value || "auto").toLowerCase();
  if (["auto", "enabled", "disabled", "skipped"].includes(normalized)) return normalized;
  if (["true", "yes", "on"].includes(normalized)) return "enabled";
  if (["false", "no", "off"].includes(normalized)) return "disabled";
  fail(`Invalid --impeccable value: ${value}. Use auto, enabled, disabled, or skipped.`);
}

function normalizeLayersOption(value) {
  const normalized = String(value || "advisory").toLowerCase();
  if (["advisory", "enabled", "disabled", "skipped"].includes(normalized)) return normalized;
  if (["true", "yes", "on"].includes(normalized)) return "enabled";
  if (["false", "no", "off"].includes(normalized)) return "disabled";
  fail(`Invalid --layers value: ${value}. Use advisory, enabled, disabled, or skipped.`);
}

function isFalseOption(value) {
  return ["false", "no", "off", "0"].includes(String(value).toLowerCase());
}

function readTemplate(relativePath) {
  return fs.readFileSync(path.join(PROJECT_TEMPLATE_DIR, relativePath), "utf8");
}

function writeIfMissing(filePath, text) {
  if (fs.existsSync(filePath)) return;
  writeText(filePath, text);
}

function writeText(filePath, text) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, ensureTrailingNewline(text), "utf8");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function upsertManagedBlock(filePath, block) {
  const normalizedBlock = ensureTrailingNewline(block.trim());
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const next = replaceManagedBlock(existing, normalizedBlock);
  writeText(filePath, next);
}

function replaceManagedBlock(existing, block) {
  const startIndex = existing.indexOf(START);
  const endIndex = existing.indexOf(END);
  if (startIndex >= 0 && endIndex >= startIndex) {
    const afterEnd = endIndex + END.length;
    return `${existing.slice(0, startIndex).trimEnd()}\n\n${block}${existing.slice(afterEnd).replace(/^\s*/, "\n")}`.trimStart();
  }

  if (!existing.trim()) return block;
  return `${existing.trimEnd()}\n\n${block}`;
}

function removeManagedBlock(filePath) {
  if (!fs.existsSync(filePath)) return;
  const existing = fs.readFileSync(filePath, "utf8");
  const startIndex = existing.indexOf(START);
  const endIndex = existing.indexOf(END);
  if (startIndex < 0 || endIndex < startIndex) return;

  const afterEnd = endIndex + END.length;
  const next = `${existing.slice(0, startIndex).trimEnd()}${existing.slice(afterEnd) ? "\n" : ""}${existing.slice(afterEnd).trimStart()}`;
  if (next.trim()) {
    writeText(filePath, next);
  } else {
    fs.writeFileSync(filePath, "", "utf8");
  }
}

function hasManagedBlock(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const text = fs.readFileSync(filePath, "utf8");
  return text.includes(START) && text.includes(END);
}

function parseKeyValueFile(filePath) {
  const result = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (match) result[match[1]] = match[2].trim();
  }
  return result;
}

function fileContains(filePath, pattern) {
  if (!fs.existsSync(filePath)) return false;
  try {
    return fs.readFileSync(filePath, "utf8").toLowerCase().includes(String(pattern).toLowerCase());
  } catch {
    return false;
  }
}

function upsertKey(text, key, value) {
  const pattern = new RegExp(`^${escapeRegex(key)}\\s*:.*$`, "m");
  const line = `${key}: ${value}`;
  if (pattern.test(text)) return text.replace(pattern, line);
  return `${text.trimEnd()}\n${line}\n`;
}

function summarizeContext(filePath) {
  if (!fs.existsSync(filePath)) return "missing";
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return "empty";
  return text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 3).join(" | ");
}

function isInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function samePath(a, b) {
  return path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase();
}

function ensureTrailingNewline(text) {
  return String(text).replace(/\s*$/, "\n");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitize(text) {
  return String(text || "")
    .replace(/(--csrf_token(?:=|\s+))\S+/gi, "$1<redacted>")
    .replace(/(--extension_csrf_token(?:=|\s+))\S+/gi, "$1<redacted>")
    .replace(/(oauth|token|secret|csrf|cookie)[A-Za-z0-9_ .:=/-]{0,160}/gi, "$1<redacted>");
}

function stripBom(text) {
  return String(text).replace(/^\uFEFF/, "");
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function printHelp() {
  console.log(`Vorth CLI

Usage:
  vorth init [--repo <path>] [--bridge enabled|disabled] [--codegraph enabled|disabled|skipped] [--impeccable auto|enabled|disabled|skipped] [--layers advisory|enabled|disabled|skipped]
  vorth status [--repo <path>] [--json] [--self-test false]
  vorth reset --confirm [--repo <path>]

Defaults:
  --repo        current working directory
  --bridge      disabled
  --codegraph   enabled
  --impeccable  auto
  --layers      advisory

Notes:
  init is idempotent and preserves user content outside Vorth managed blocks.
  init runs codegraph init when --codegraph enabled and the CodeGraph CLI is available.
  init runs official Impeccable or Layers installs only when the matching option is enabled.
  status is read-only for user-level MCP config.
  reset removes only .vorth/ and Vorth managed blocks.`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
