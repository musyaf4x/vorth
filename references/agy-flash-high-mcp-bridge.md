# Agy Flash High MCP Bridge

Read this reference only when configuring or modifying Vorth's Antigravity-only Flash High execution bridge.

## Purpose

The bridge lets the main Antigravity agent delegate bounded execution work to Gemini 3.5 Flash with high thinking from inside the same turn through MCP.

This is not a new Vorth stack. It is an execution adapter:

```text
Superpowers decides process.
ECC decides specialist routing and review gates.
Agy Flash High MCP bridge executes bounded tasks only.
Main Agy agent applies, verifies, and owns final judgment.
```

Codex must not use this bridge.

## Model Contract

Use the Gemini API model and thinking setting below:

```yaml
model: gemini-3.5-flash
thinkingLevel: high
```

In the JavaScript SDK this is equivalent to:

```js
import { ThinkingLevel } from "@google/genai";

model: "gemini-3.5-flash",
config: {
  thinkingConfig: {
    thinkingLevel: ThinkingLevel.HIGH
  }
}
```

Do not invent a separate model id such as `gemini-3.5-flash-high` unless Google exposes one later.

## MCP Server Shape

Prefer a project-local server:

```text
.vorth/mcp/vorth-flash-high-executor/
  package.json
  server.mjs
```

Expose exactly one default tool:

```text
vorth_flash_high_execute
```

The tool input must be structured:

```json
{
  "repoRoot": "absolute path to repo root",
  "task": "complete bounded task text",
  "mode": "implementation / build_fix / tdd_green / mechanical_refactor / docs / test_execution",
  "filesAllowed": ["relative/path.ts"],
  "filesForbidden": ["relative/path.ts"],
  "acceptanceCriteria": ["observable expected outcome"],
  "verificationCommands": ["npm test -- --runInBand"],
  "context": "only the relevant task-local context"
}
```

The tool output must be structured and patch-first:

```json
{
  "status": "ok / needs_context / refused / error",
  "summary": "short result summary",
  "unifiedDiff": "patch text or empty string",
  "commandsSuggested": ["commands the main agent may run"],
  "risks": ["remaining risk"],
  "questions": ["only if blocked"]
}
```

Default to `unifiedDiff` output instead of direct writes. The main Agy agent applies the patch, runs checks, and decides whether more work is needed.

## Allowed Calls

Call `vorth_flash_high_execute` only for:

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

If only user-level MCP registration is available, ask before editing `~/.gemini/config/mcp_config.json`. The entry should point to the project-local server, and the server must reject calls unless `repoRoot` contains `.vorth/vorth.config.md` with `agy_flash_high_executor: enabled`.

Never store API keys in the repository. The bridge should read `GEMINI_API_KEY` from the user environment or another explicitly approved secret source.

Suggested MCP registration shape:

```json
{
  "mcpServers": {
    "vorth-flash-high-executor": {
      "command": "node",
      "args": ["<repo>/.vorth/mcp/vorth-flash-high-executor/server.mjs"],
      "tools": {
        "vorth_flash_high_execute": {
          "background": "off",
          "eager": false
        }
      }
    }
  }
}
```

## Prompt Contract

When the main Agy agent calls the bridge, it must include the complete task. Do not ask the bridge to infer intent from hidden session history.

Required prompt structure:

```text
You are Vorth's bounded execution worker.
Use Gemini 3.5 Flash with high thinking.
Return only the requested JSON shape.
Do not make architecture decisions.
Do not perform security or final code review.
Do not modify files directly unless the bridge has an explicit write mode.

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
Return `error` when the Gemini API call or local preflight fails.
Do not silently fall back to another model.