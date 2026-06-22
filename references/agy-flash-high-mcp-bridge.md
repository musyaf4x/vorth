# Agy Native Bridge

Read this reference only when configuring or modifying Vorth's Antigravity-only native execution bridge.

## Purpose

The bridge lets the main Antigravity agent delegate bounded execution work to Gemini 3.5 Flash High from inside the same turn through MCP, using Antigravity's own active OAuth/session.

This is not a new Vorth stack. It is an execution adapter:

```text
Superpowers decides process.
ECC decides specialist routing and review gates.
Agy Native Bridge executes bounded tasks only.
Main Agy agent applies, verifies, and owns final judgment.
```

Codex must not use this bridge.

## Native OAuth Contract

Do not use `GEMINI_API_KEY` for this bridge.

The bridge discovers the local Antigravity language server process, reads only the localhost RPC port and CSRF token from that process command line, and calls Antigravity RPC methods over HTTPS localhost:

```text
GetAvailableModels
StartCascade
SendUserCascadeMessage
WaitForConversationFullyIdle
GetCascadeTrajectory
GetCascadeTrajectorySteps
```

Never print, log, store, or return command lines, CSRF tokens, OAuth tokens, cookies, or user status values. User-facing status may say only whether a usable language server was found.

## Model Contract

Resolve Gemini 3.5 Flash High dynamically from `GetAvailableModels`.

Preferred runtime mapping:

```yaml
id: gemini-3-flash-agent
displayName: Gemini 3.5 Flash (High)
model: MODEL_PLACEHOLDER_M132
thinkingBudget: 10000
```

Known fallback:

```yaml
model: MODEL_PLACEHOLDER_M132
```

Do not invent a separate model id such as `gemini-3.5-flash-high`.

## MCP Server Shape

Prefer a project-local server copied from:

```text
templates/mcp/vorth-agy-native-bridge/
```

into the target project:

```text
.vorth/mcp/vorth-agy-native-bridge/
  package.json
  server.mjs
  profile-manager.mjs
```

Expose these tools:

| Tool | Purpose |
| --- | --- |
| `vorth_agy_status` | Check language-server readiness without leaking secrets. |
| `vorth_agy_models` | Return safe model metadata and the resolved Flash High mapping. |
| `vorth_agy_delegate` | Start a bounded cascade task and return the planner result. |
| `vorth_agy_read_result` | Read a previous cascade by `cascadeId`. |
| `vorth_flash_high_execute` | Compatibility alias for Flash High bounded execution. |

## Delegation Input

`vorth_agy_delegate` and `vorth_flash_high_execute` accept:

```json
{
  "repoRoot": "absolute path to repo root",
  "task": "complete bounded task text",
  "mode": "implementation / build_fix / tdd_green / mechanical_refactor / docs / test_execution",
  "modelPreference": "flash-high",
  "userDataDir": "optional worker profile user-data-dir",
  "filesAllowed": ["relative/path.ts"],
  "filesForbidden": ["relative/path.ts"],
  "acceptanceCriteria": ["observable expected outcome"],
  "verificationCommands": ["npm test -- --runInBand"],
  "context": "only the relevant task-local context",
  "timeoutMs": 90000
}
```

The server must reject delegation unless `repoRoot` contains `.vorth/vorth.config.md` with either:

```yaml
agy_native_bridge: enabled
```

or the backward-compatible flag:

```yaml
agy_flash_high_executor: enabled
```

## Delegation Output

The bridge returns structured text JSON:

```json
{
  "status": "ok / needs_context / refused / error",
  "cascadeId": "Antigravity cascade id",
  "model": {
    "id": "gemini-3-flash-agent",
    "displayName": "Gemini 3.5 Flash (High)",
    "model": "MODEL_PLACEHOLDER_M132"
  },
  "summary": "short result summary",
  "response": "raw planner response",
  "unifiedDiff": "patch text or empty string",
  "commandsSuggested": ["commands the main agent may run"],
  "risks": ["remaining risk"],
  "questions": ["only if blocked"]
}
```

Default to patch output instead of direct writes. The main Agy agent applies the patch, runs checks, and decides whether more work is needed.

## Allowed Calls

Call the bridge only for:

- Bounded implementation after plan approval.
- Build/type/test fix with a known failing case.
- TDD GREEN phase for a small test target.
- Mechanical refactor with explicit file scope.
- Documentation update.
- Test or E2E execution summary.

## Forbidden Calls

Do not call the bridge for:

- Architecture or product decisions.
- Planning and task decomposition.
- Security review.
- Final code review.
- Broad or ambiguous debugging.
- Large refactors without a written plan.
- Any Codex workflow.

## Registration Rules

If Antigravity supports a project-local MCP config, prefer it.

If only user-level MCP registration is available, ask before editing `~/.gemini/config/mcp_config.json`. The entry should point to the project-local server, and the server must reject calls unless `repoRoot` is Vorth-enabled.

Suggested MCP registration shape:

```json
{
  "mcpServers": {
    "vorth-agy-native-bridge": {
      "command": "node",
      "args": ["<repo>/.vorth/mcp/vorth-agy-native-bridge/server.mjs"],
      "tools": {
        "vorth_agy_delegate": {
          "background": "off",
          "eager": false
        },
        "vorth_flash_high_execute": {
          "background": "off",
          "eager": false
        }
      }
    }
  }
}
```

## Worker Profile

For a second Antigravity account, use a separate user-data-dir instead of logging the active IDE out:

```powershell
node .\.vorth\mcp\vorth-agy-native-bridge\profile-manager.mjs init --user-data-dir C:\tmp\vorth-agy-worker --extensions-dir C:\tmp\vorth-agy-worker-ext
node .\.vorth\mcp\vorth-agy-native-bridge\profile-manager.mjs login --user-data-dir C:\tmp\vorth-agy-worker --extensions-dir C:\tmp\vorth-agy-worker-ext --workspace .
node .\.vorth\mcp\vorth-agy-native-bridge\profile-manager.mjs status --user-data-dir C:\tmp\vorth-agy-worker
```

The worker profile must be logged in once interactively. After login, it must expose a workspace HTTPS language server before the bridge can use it for delegation.

## Prompt Contract

When the main Agy agent calls the bridge, it must include the complete task. Do not ask the bridge to infer intent from hidden session history.

Required prompt structure:

```text
You are Vorth's bounded execution worker.
Return only the requested JSON shape.
Do not make architecture decisions.
Do not perform security or final code review.
Do not modify files directly.
Do not use tools unless explicitly asked for test execution summary.

Task:
[complete task]

Allowed files:
[list]

Acceptance criteria:
[list]

Relevant context:
[concise context]
```

## Failure Behavior

Return `needs_context` when the task is under-specified.
Return `refused` when the task is outside allowed scope.
Return `error` when the Antigravity RPC call or local preflight fails.
Do not silently fall back to another model.

## Remaining Hardening

The direct MCP server reads the Antigravity process command line internally to discover the localhost CSRF token. It must never print that value. A future companion extension can move this discovery inside Antigravity's extension host so the MCP server never touches process command lines.
