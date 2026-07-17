import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(testDir, "..");
export const cliPath = path.join(projectRoot, "bin", "vorth.mjs");

export function createTempRepo(t, name = "repo") {
  const { parent, target: repo } = createTempTarget(t, name);
  const git = spawnSync("git", ["init", "--quiet", repo], { encoding: "utf8" });
  if (git.status !== 0) throw new Error(git.stderr || "git init failed");
  return repo;
}

export function createTempDirectory(t, name = "directory") {
  return createTempTarget(t, name).target;
}

export function runCli(args, options = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: options.cwd || projectRoot,
    encoding: "utf8",
    timeout: options.timeout || 30000,
    env: { ...process.env, ...options.env }
  });
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function installFakeCodeGraph(t) {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "vorth-bin-"));
  const logPath = path.join(binDir, "codegraph.log");
  const shimPath = path.join(binDir, process.platform === "win32" ? "codegraph.cmd" : "codegraph");
  const shim = process.platform === "win32"
    ? [
        "@echo off",
        `echo %*>>\"${logPath}\"`,
        "if \"%1\"==\"--version\" (echo 9.9.9& exit /b 0)",
        "if \"%1\"==\"--help\" (echo fake codegraph& exit /b 0)",
        "if \"%1\"==\"init\" (if not exist .codegraph mkdir .codegraph& exit /b 0)",
        "exit /b 0"
      ].join("\r\n")
    : [
        "#!/bin/sh",
        `printf '%s\\n' \"$*\" >> '${logPath.replaceAll("'", "'\\''")}'`,
        "if [ \"$1\" = \"--version\" ]; then echo 9.9.9; fi",
        "if [ \"$1\" = \"init\" ]; then mkdir -p .codegraph; fi"
      ].join("\n");
  fs.writeFileSync(shimPath, shim, "utf8");
  if (process.platform !== "win32") fs.chmodSync(shimPath, 0o755);
  t.after(() => safeRemoveTemp(binDir));
  return {
    env: { PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}` },
    logPath
  };
}

export function installFakeAntigravityCli(t) {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "vorth-agy-bin-"));
  const logPath = path.join(binDir, "antigravity.log");
  const shimPath = path.join(binDir, process.platform === "win32" ? "antigravity-ide.cmd" : "antigravity-ide");
  const shim = process.platform === "win32"
    ? ["@echo off", `echo %*>>\"${logPath}\"`, "exit /b 0"].join("\r\n")
    : ["#!/bin/sh", `printf '%s\\n' \"$*\" >> '${logPath.replaceAll("'", "'\\''")}'`, "exit 0"].join("\n");
  fs.writeFileSync(shimPath, shim, "utf8");
  if (process.platform !== "win32") fs.chmodSync(shimPath, 0o755);
  t.after(() => safeRemoveTemp(binDir));
  return { cliPath: shimPath, logPath };
}

export function countMarker(text, marker) {
  return text.split(marker).length - 1;
}

function safeRemoveTemp(target) {
  const resolved = path.resolve(target);
  const tempRoot = path.resolve(os.tmpdir());
  const relative = path.relative(tempRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to remove non-temp test path: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function createTempTarget(t, name) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "vorth-test-"));
  const target = path.join(parent, name);
  fs.mkdirSync(target, { recursive: true });
  t.after(() => safeRemoveTemp(parent));
  return { parent, target };
}
