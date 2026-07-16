import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createTempRepo } from "./helpers.mjs";
import {
  chooseLanguageServer,
  resolveModel,
  validateDelegationScope,
  validateRepoRoot,
  validateUnifiedDiff
} from "../templates/mcp/vorth-agy-native-bridge/server.mjs";

test("Flash High routing uses an exact model returned by Antigravity", () => {
  assert.throws(() => resolveModel("flash-high", []), /not available/i);
  const runtimeModel = {
    id: "gemini-3-flash-agent",
    displayName: "Gemini 3.5 Flash (High)",
    model: "MODEL_FROM_CURRENT_RUNTIME"
  };
  assert.equal(resolveModel("flash-high", [runtimeModel]), runtimeModel);
  assert.throws(() => resolveModel("MODEL_UNKNOWN", [runtimeModel]), /not available/i);
});

test("language-server selection refuses ambiguity and honors workspace identity", () => {
  const servers = [
    { pid: 1, workspaceId: "one", httpsPort: 1001, csrfToken: "secret-one" },
    { pid: 2, workspaceId: "two", httpsPort: 1002, csrfToken: "secret-two" }
  ];
  assert.throws(() => chooseLanguageServer(servers, {}, true), /multiple usable/i);
  assert.equal(chooseLanguageServer(servers, { workspaceId: "two" }, true).pid, 2);
  assert.equal(chooseLanguageServer([], {}, false), null);
});

test("delegation requires bounded repository-relative files and acceptance criteria", (t) => {
  const repo = createTempRepo(t);
  const valid = validateDelegationScope(repo, "implementation", {
    filesAllowed: ["src/app.js", "test/"],
    filesForbidden: ["src/secrets.js"],
    acceptanceCriteria: ["tests pass"]
  });
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.filesAllowed, ["src/app.js", "test/"]);

  assert.equal(validateDelegationScope(repo, "implementation", {
    filesAllowed: ["../outside.js"],
    acceptanceCriteria: ["done"]
  }).ok, false);
  assert.equal(validateDelegationScope(repo, "implementation", {
    filesAllowed: ["src/app.js"],
    acceptanceCriteria: []
  }).ok, false);
});

test("returned patches cannot escape the delegated file scope", (t) => {
  const repo = createTempRepo(t);
  const ownership = {
    repoRoot: repo,
    filesAllowed: ["src/app.js", "test/"],
    filesForbidden: ["test/private/"]
  };
  const validDiff = [
    "diff --git a/src/app.js b/src/app.js",
    "--- a/src/app.js",
    "+++ b/src/app.js",
    "@@ -1 +1 @@",
    "-old",
    "+new"
  ].join("\n");
  assert.equal(validateUnifiedDiff(validDiff, ownership).ok, true);

  const extraFile = validDiff.replaceAll("src/app.js", "src/other.js");
  assert.equal(validateUnifiedDiff(extraFile, ownership).ok, false);
  const managedFile = validDiff.replaceAll("src/app.js", ".vorth/runtime.md");
  assert.equal(validateUnifiedDiff(managedFile, ownership).ok, false);
});

test("bridge opt-in is read from authoritative JSON config", (t) => {
  const repo = createTempRepo(t);
  fs.mkdirSync(path.join(repo, ".vorth"));
  fs.writeFileSync(path.join(repo, ".vorth", "vorth.config.json"), JSON.stringify({ bridge: "enabled" }), "utf8");
  assert.equal(validateRepoRoot(repo).ok, true);
  fs.writeFileSync(path.join(repo, ".vorth", "vorth.config.json"), JSON.stringify({ bridge: "disabled" }), "utf8");
  assert.equal(validateRepoRoot(repo).ok, false);
});

test("worker profile helper is portable and requires authenticated readiness", () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const profileManager = fs.readFileSync(path.join(
    testDir,
    "..", "templates", "mcp", "vorth-agy-native-bridge", "profile-manager.mjs"
  ), "utf8");
  assert.doesNotMatch(profileManager, /C:\\\\Users\\\\hafid/i);
  assert.match(profileManager, /os\.tmpdir\(\)/);
  assert.match(profileManager, /server\.hasHttps && server\.hasCsrf/);
});
