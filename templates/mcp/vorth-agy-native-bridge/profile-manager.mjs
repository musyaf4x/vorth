#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const DEFAULT_USER_DATA_DIR = path.join(os.tmpdir(), "vorth-agy-worker");
const DEFAULT_EXTENSIONS_DIR = path.join(os.tmpdir(), "vorth-agy-worker-ext");

const command = process.argv[2] || "help";
const options = parseOptions(process.argv.slice(3));

try {
  switch (command) {
    case "init":
      cmdInit(options);
      break;
    case "login":
      cmdLaunch(options, false);
      break;
    case "launch":
      cmdLaunch(options, true);
      break;
    case "status":
      cmdStatus(options);
      break;
    case "help":
    default:
      printHelp();
      break;
  }
} catch (error) {
  process.stderr.write(`${safeMessage(error)}\n`);
  process.exit(1);
}

function cmdInit(options) {
  const userDataDir = resolvePath(options.userDataDir || process.env.VORTH_AGY_USER_DATA_DIR || DEFAULT_USER_DATA_DIR);
  const extensionsDir = resolvePath(options.extensionsDir || process.env.VORTH_AGY_EXTENSIONS_DIR || DEFAULT_EXTENSIONS_DIR);
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(extensionsDir, { recursive: true });
  printJson({
    status: "ok",
    userDataDir,
    extensionsDir,
    next: "Run login once to authenticate this worker profile."
  });
}

function cmdLaunch(options, hidden) {
  const antigravityCli = resolveCli(options.antigravityCli || process.env.ANTIGRAVITY_IDE_CLI);
  const userDataDir = resolvePath(options.userDataDir || process.env.VORTH_AGY_USER_DATA_DIR || DEFAULT_USER_DATA_DIR);
  const extensionsDir = resolvePath(options.extensionsDir || process.env.VORTH_AGY_EXTENSIONS_DIR || DEFAULT_EXTENSIONS_DIR);
  const workspace = resolvePath(options.workspace || process.cwd());

  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(extensionsDir, { recursive: true });

  const windowStyle = hidden ? "-WindowStyle Hidden " : "";
  const script = [
    `$p = Start-Process -FilePath ${psQuote(antigravityCli)}`,
    `-ArgumentList @('--user-data-dir', ${psQuote(userDataDir)}, '--extensions-dir', ${psQuote(extensionsDir)}, '--new-window', ${psQuote(workspace)})`,
    `${windowStyle}-PassThru`,
    "[pscustomobject]@{Id=$p.Id; ProcessName=$p.ProcessName} | ConvertTo-Json -Compress"
  ].join(" ");

  const started = runPowerShell(script).trim();
  printJson({
    status: "ok",
    mode: hidden ? "launch" : "login",
    userDataDir,
    extensionsDir,
    workspace,
    process: parseJson(started)
  });
}

function cmdStatus(options) {
  const userDataDir = resolvePath(options.userDataDir || process.env.VORTH_AGY_USER_DATA_DIR || DEFAULT_USER_DATA_DIR);
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
    userDataDir,
    workerProcessCount: descendants.size,
    languageServers,
    ready: languageServers.some((server) => server.hasHttps && server.hasCsrf)
  });
}

function printHelp() {
  process.stdout.write([
    "Vorth Antigravity worker profile helper",
    "",
    "Commands:",
    "  init    --user-data-dir <dir> --extensions-dir <dir>",
    "  login   --user-data-dir <dir> --extensions-dir <dir> --workspace <repo>",
    "  launch  --user-data-dir <dir> --extensions-dir <dir> --workspace <repo>",
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
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
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
