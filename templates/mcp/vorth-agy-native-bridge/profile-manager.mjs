#!/usr/bin/env node
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const VORTH_HOME = path.resolve(process.env.VORTH_HOME || path.join(os.homedir(), ".vorth"));
const DEFAULT_USER_DATA_DIR = path.join(VORTH_HOME, "agy-worker");
const DEFAULT_EXTENSIONS_DIR = path.join(VORTH_HOME, "agy-worker-extensions");
const STATE_PATH = path.join(VORTH_HOME, "bridge-state.json");

const command = process.argv[2] || "help";
const options = parseOptions(process.argv.slice(3));

try {
  await main();
} catch (error) {
  process.stderr.write(`${safeMessage(error)}\n`);
  process.exit(1);
}

async function main() {
  switch (command) {
    case "init":
      await cmdInit(options);
      break;
    case "login":
      await cmdLaunch(options, false);
      break;
    case "launch":
      await cmdLaunch(options, true);
      break;
    case "status":
      cmdStatus(options);
      break;
    case "help":
    default:
      printHelp();
      break;
  }
}

async function cmdInit(input) {
  const state = await ensureState(input);
  printJson({
    status: "ok",
    userDataDir: state.userDataDir,
    extensionsDir: state.extensionsDir,
    fixedPortsConfigured: true,
    next: "Run login once to authenticate this worker profile."
  });
}

async function cmdLaunch(input, hidden) {
  const state = await ensureState(input);
  const antigravityCli = resolveCli(input.antigravityCli || process.env.ANTIGRAVITY_IDE_CLI);
  const workspace = resolvePath(input.workspace || state.workspace || process.cwd());

  fs.mkdirSync(state.userDataDir, { recursive: true });
  fs.mkdirSync(state.extensionsDir, { recursive: true });
  writeState({ ...state, workspace });

  const windowStyle = hidden ? "-WindowStyle Hidden " : "";
  const script = [
    "$oldServer = $env:JETSKI_FIXED_SERVER_PORT; $oldLsp = $env:JETSKI_FIXED_LSP_PORT;",
    `$env:JETSKI_FIXED_SERVER_PORT = ${psQuote(String(state.httpsPort))};`,
    `$env:JETSKI_FIXED_LSP_PORT = ${psQuote(String(state.lspPort))};`,
    "try {",
    `$p = Start-Process -FilePath ${psQuote(antigravityCli)}`,
    `-ArgumentList @('--user-data-dir', ${psQuote(state.userDataDir)}, '--extensions-dir', ${psQuote(state.extensionsDir)}, '--new-window', ${psQuote(workspace)})`,
    `${windowStyle}-PassThru;`,
    "[pscustomobject]@{Id=$p.Id; ProcessName=$p.ProcessName} | ConvertTo-Json -Compress",
    "} finally {",
    "if ($null -eq $oldServer) { Remove-Item Env:JETSKI_FIXED_SERVER_PORT -ErrorAction SilentlyContinue } else { $env:JETSKI_FIXED_SERVER_PORT = $oldServer };",
    "if ($null -eq $oldLsp) { Remove-Item Env:JETSKI_FIXED_LSP_PORT -ErrorAction SilentlyContinue } else { $env:JETSKI_FIXED_LSP_PORT = $oldLsp }",
    "}"
  ].join(" ");

  const started = runPowerShell(script).trim();
  printJson({
    status: "ok",
    mode: hidden ? "launch" : "login",
    userDataDir: state.userDataDir,
    extensionsDir: state.extensionsDir,
    workspace,
    fixedPortsConfigured: true,
    process: parseJson(started)
  });
}

function cmdStatus(input) {
  const state = readState();
  const userDataDir = resolvePath(input.userDataDir || state?.userDataDir || process.env.VORTH_AGY_USER_DATA_DIR || DEFAULT_USER_DATA_DIR);
  const rows = getProcesses();
  const selfRelated = collectSelfRelated(rows);
  const roots = rows
    .filter((row) => !selfRelated.has(row.ProcessId))
    .filter((row) => String(row.CommandLine || "").toLowerCase().includes(userDataDir.toLowerCase()))
    .map((row) => row.ProcessId);
  const descendants = collectDescendants(rows, roots);
  const languageServers = rows
    .filter((row) => row.Name === "language_server_windows_x64.exe" && descendants.has(row.ProcessId))
    .map((row) => {
      const commandLine = row.CommandLine || "";
      return {
        pid: row.ProcessId,
        parentPid: row.ParentProcessId,
        workspaceId: getArg(commandLine, "workspace_id") || null,
        hasHttps: Boolean(getArg(commandLine, "https_server_port")),
        hasCsrf: Boolean(getArg(commandLine, "csrf_token")),
        hasExtensionPort: Boolean(getArg(commandLine, "extension_server_port"))
      };
    });

  printJson({
    status: "ok",
    initialized: Boolean(state),
    userDataDir,
    fixedPortsConfigured: Boolean(state?.httpsPort && state?.lspPort),
    workerProcessCount: descendants.size,
    languageServers,
    ready: languageServers.some((server) => server.hasHttps && server.hasCsrf)
  });
}

async function ensureState(input) {
  const current = readState() || {};
  const userDataDir = resolvePath(input.userDataDir || current.userDataDir || process.env.VORTH_AGY_USER_DATA_DIR || DEFAULT_USER_DATA_DIR);
  const extensionsDir = resolvePath(input.extensionsDir || current.extensionsDir || process.env.VORTH_AGY_EXTENSIONS_DIR || DEFAULT_EXTENSIONS_DIR);
  const workspace = input.workspace ? resolvePath(input.workspace) : current.workspace || null;
  const httpsPort = validPort(current.httpsPort) ? current.httpsPort : await findFreePort();
  const lspPort = validPort(current.lspPort) && current.lspPort !== httpsPort ? current.lspPort : await findFreePortExcept(httpsPort);
  const state = { schemaVersion: 1, userDataDir, extensionsDir, workspace, httpsPort, lspPort };
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(extensionsDir, { recursive: true });
  writeState(state);
  return state;
}

function readState() {
  if (!fs.existsSync(STATE_PATH)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function findFreePortExcept(excluded) {
  let port = await findFreePort();
  while (port === excluded) port = await findFreePort();
  return port;
}

function validPort(value) {
  return Number.isInteger(value) && value > 1024 && value <= 65535;
}

function printHelp() {
  process.stdout.write([
    "Vorth Antigravity worker profile helper",
    "",
    "Commands:",
    "  init    --user-data-dir <dir> --extensions-dir <dir>",
    "  login   --workspace <repo>",
    "  launch  --workspace <repo>",
    "  status  --user-data-dir <dir>",
    "",
    "login opens a visible Antigravity window so you can authenticate the worker profile.",
    "launch starts the same profile hidden for background use after it has been authenticated."
  ].join("\n"));
  process.stdout.write("\n");
}

function parseOptions(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = args[index + 1];
    if (!next || next.startsWith("--")) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function resolvePath(value) {
  return path.resolve(String(value));
}

function resolveCli(value) {
  const candidates = [
    value,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "Antigravity IDE", "bin", "antigravity-ide.cmd"),
    "antigravity-ide.cmd",
    "antigravity.cmd",
    "agy.cmd"
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && fs.existsSync(candidate)) return candidate;
    try {
      const found = execFileSync("where.exe", [candidate], {
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"]
      }).split(/\r?\n/).map((item) => item.trim()).find(Boolean);
      if (found) return found;
    } catch {
      // Try the next official CLI location/name.
    }
  }
  throw new Error("Antigravity IDE CLI was not found. Pass --antigravity-cli or set ANTIGRAVITY_IDE_CLI.");
}

function runPowerShell(script) {
  return execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 30 * 1024 * 1024
  });
}

function getProcesses() {
  const raw = runPowerShell("Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress").trim();
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

function collectDescendants(rows, rootIds) {
  const ids = new Set(rootIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (!ids.has(row.ProcessId) && ids.has(row.ParentProcessId)) {
        ids.add(row.ProcessId);
        changed = true;
      }
    }
  }
  return ids;
}

function collectSelfRelated(rows) {
  const related = collectDescendants(rows, [process.pid]);
  const byPid = new Map(rows.map((row) => [row.ProcessId, row]));
  let current = byPid.get(process.pid);
  while (current?.ParentProcessId) {
    related.add(current.ParentProcessId);
    current = byPid.get(current.ParentProcessId);
  }
  return related;
}

function getArg(commandLine, name) {
  const pattern = new RegExp(`(?:^|\\s)--${escapeRegex(name)}(?:=|\\s+)(?:"([^"]*)"|(\\S+))`);
  const match = String(commandLine || "").match(pattern);
  return match ? (match[1] ?? match[2]) : undefined;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function safeMessage(error) {
  return String(error?.message || error || "unknown error")
    .replace(/(--csrf_token(?:=|\s+))\S+/gi, "$1<redacted>")
    .replace(/(--extension_csrf_token(?:=|\s+))\S+/gi, "$1<redacted>")
    .replace(/(oauth|token|secret|csrf|cookie)[A-Za-z0-9_ .:=/-]{0,160}/gi, "$1<redacted>");
}
