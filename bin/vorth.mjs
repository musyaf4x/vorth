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
  const vorthDir = path.join(repo.root, ".vorth");

  ensureDir(vorthDir);
  ensureDir(path.join(vorthDir, "instructions"));
  ensureDir(path.join(vorthDir, "plans"));
  ensureDir(path.join(vorthDir, "mcp"));

  writeConfig(repo, bridge);
  writeIfMissing(path.join(vorthDir, "context.md"), readTemplate("context.md"));
  writeText(path.join(vorthDir, "instructions", "superpowers-ecc.md"), readTemplate(path.join("instructions", "superpowers-ecc.md")));
  writeText(path.join(vorthDir, "instructions", "turn-process.md"), readTemplate(path.join("instructions", "turn-process.md")));

  upsertManagedBlock(path.join(repo.root, "GEMINI.md"), readTemplate("GEMINI.block.md"));
  upsertManagedBlock(path.join(repo.root, "AGENTS.md"), readTemplate("AGENTS.block.md"));

  if (bridge === "enabled") {
    copyBridgeTemplate(repo.root);
  }

  const status = collectStatus(repo, { runSelfTest: bridge === "enabled" });
  printInitResult(repo, bridge, status);
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
    agyNativeBridge: {
      config: config.agy_native_bridge || "missing",
      files: bridgePresent ? "present" : "missing",
      path: bridgeServer,
      mcpRegistration,
      selfTest: bridgeSelfTest
    },
    deferredStacks: {
      layers: "disabled",
      impeccable: "disabled",
      codegraph: "disabled"
    },
    context: summarizeContext(path.join(repo.root, ".vorth", "context.md"))
  };
}

function writeConfig(repo, bridge) {
  const configPath = path.join(repo.root, ".vorth", "vorth.config.md");
  const bridgeExecutor = bridge === "enabled" ? "enabled" : bridge === "skipped" ? "skipped" : "disabled";

  if (!fs.existsSync(configPath)) {
    const template = readTemplate("vorth.config.md")
      .replaceAll("{{AGY_NATIVE_BRIDGE}}", bridge)
      .replaceAll("{{AGY_FLASH_HIGH_EXECUTOR}}", bridgeExecutor);
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

function printInitResult(repo, bridge, status) {
  console.log("Vorth initialized.");
  console.log(`Repo: ${repo.root}`);
  console.log(`Branch: ${repo.branch}`);
  console.log("Mode: project-local");
  console.log(`Superpowers: ${status.superpowers.status}`);
  console.log(`ECC Antigravity: ${status.ecc.antigravity.status}`);
  console.log(`ECC Codex: ${status.ecc.codex.status}`);
  console.log(`Agy Native Bridge: ${bridge}`);
  console.log("Activation: GEMINI.md + AGENTS.md managed blocks");
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
  console.log(`Agy Native Bridge config: ${status.agyNativeBridge.config}`);
  console.log(`Agy Native Bridge files: ${status.agyNativeBridge.files}`);
  console.log(`Agy MCP registration: ${status.agyNativeBridge.mcpRegistration.status}`);
  console.log(`Agy Bridge self-test: ${status.agyNativeBridge.selfTest.status}`);
  if (status.agyNativeBridge.mcpRegistration.status !== "registered") {
    console.log("Suggested MCP registration:");
    console.log(JSON.stringify(status.agyNativeBridge.mcpRegistration.suggestion, null, 2));
  }
  console.log("Deferred stacks: layers disabled, impeccable disabled, codegraph disabled");
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
      windowsHide: true
    }).trim();
    git = "present";
  } catch {
    root = cwd;
  }

  if (git === "present") {
    try {
      branch = execFileSync("git", ["-C", root, "branch", "--show-current"], {
        encoding: "utf8",
        windowsHide: true
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
  fail(`Invalid --bridge value: ${value}. Use enabled or disabled.`);
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
  vorth init [--repo <path>] [--bridge enabled|disabled]
  vorth status [--repo <path>] [--json] [--self-test false]
  vorth reset --confirm [--repo <path>]

Defaults:
  --repo     current working directory
  --bridge   disabled

Notes:
  init is idempotent and preserves user content outside Vorth managed blocks.
  status is read-only for user-level MCP config.
  reset removes only .vorth/ and Vorth managed blocks.`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
