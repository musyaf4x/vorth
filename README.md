# Vorth

Vorth is a project-local engineering harness for Antigravity and Codex.

Current focus: **Superpowers + CodeGraph + ECC**.

- **Superpowers** is the baseline workflow: clarify, plan, TDD, execute, review, verify.
- **CodeGraph** is the codebase intelligence layer: query it before broad exploration or reading many files.
- **ECC** is the specialist layer: planner, architect, TDD guide, code reviewer, security reviewer, build resolver, and language reviewers.
- **Agy Native Bridge** is an optional Antigravity-only execution adapter for bounded tasks through Antigravity's own OAuth/session, not a Gemini API key.

Layers and Impeccable are intentionally deferred until the Superpowers/CodeGraph/ECC foundation is stable.

## Why This Shape

The clean architecture is:

```text
Vorth = project-local activation and memory
Superpowers = process controller
CodeGraph = codebase intelligence layer
ECC = specialist engineering pool
Agy Native Bridge = bounded Antigravity execution adapter
Antigravity/Codex = harness adapters
```

Vorth should not replace Superpowers or ECC internals. It should activate them, respect their official install structures, and decide when each one participates.

## Activation Model

Vorth stays opt-in per repository. A repository becomes Vorth-enabled only after:

```text
/vorth init
```

The executable equivalent is:

```powershell
node <vorth-skill>\bin\vorth.mjs init --repo <repo> --bridge disabled --codegraph enabled
node <vorth-skill>\bin\vorth.mjs init --repo <repo> --bridge enabled --codegraph enabled
```

Init writes project-local activation files:

```text
.vorth/
  vorth.config.md
  context.md
  instructions/
    codegraph.md
    superpowers-ecc.md
    turn-process.md
  plans/
  mcp/
    vorth-agy-native-bridge/     # optional, Agy only
GEMINI.md   # Antigravity adapter block
AGENTS.md   # Codex adapter block
```

`GEMINI.md` and `AGENTS.md` contain managed `VORTH:START` / `VORTH:END` blocks that tell the agent to read `.vorth/context.md`, follow `.vorth/instructions/superpowers-ecc.md`, and apply `.vorth/instructions/codegraph.md` when CodeGraph is enabled.

## CodeGraph

Vorth treats CodeGraph as an active project-local intelligence layer, not as the process controller.

When `--codegraph enabled` is selected, `vorth init` checks for the `codegraph` CLI and runs this in the target repository:

```powershell
codegraph init
```

That creates the project `.codegraph/` index using CodeGraph's own tooling. If the CLI is missing, Vorth still writes `.vorth/` and the managed activation blocks, then reports the official install options from [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph).

Vorth does not silently run remote installers, `npm i -g`, or global agent wiring. Agent MCP wiring belongs to CodeGraph's own command:

```powershell
codegraph install
```

The operating rule is:

- Before broad codebase exploration, use CodeGraph first.
- Before reading many files, query CodeGraph first.
- For small changes where the target file is already clear, skip CodeGraph.
- If CodeGraph is unavailable or stale, fall back to narrow `rg` and targeted file reads.

CodeGraph telemetry follows its official policy. See [TELEMETRY.md](https://github.com/colbymchenry/codegraph/blob/main/TELEMETRY.md) for opt-out options.

## Native vs Project-Local

There is an important tradeoff.

Superpowers' native Antigravity install is:

```powershell
agy plugin install https://github.com/obra/superpowers
```

That route uses the creator's plugin/session-start behavior and gives the strongest Superpowers activation, but it can be harness-level rather than strictly project-local.

ECC's Antigravity install is project-local:

```powershell
.\.vorth\vendor\ECC\install.ps1 --target antigravity --profile minimal --dry-run
.\.vorth\vendor\ECC\install.ps1 --target antigravity --profile minimal
```

That writes ECC-managed files under `.agent/` in the current project.

ECC's Codex target writes to Codex home and is therefore treated as native/global:

```powershell
.\.vorth\vendor\ECC\install.ps1 --target codex --profile minimal --dry-run
.\.vorth\vendor\ECC\install.ps1 --target codex --profile minimal
```

Vorth must not silently run native/global installers. It should ask first and record the selected scope in `.vorth/vorth.config.md`.

## Agy Native Bridge

Vorth can optionally configure an Antigravity-only MCP bridge named `vorth-agy-native-bridge`. It gives the main Agy agent same-turn tools for bounded execution through the active Antigravity language server and the user's Antigravity OAuth session.

The bridge exposes:

| Tool | Purpose |
| --- | --- |
| `vorth_agy_status` | Check whether a usable Antigravity workspace language server is available. |
| `vorth_agy_models` | Read available Antigravity models and resolve the Flash High model dynamically. |
| `vorth_agy_delegate` | Start a bounded cascade task and return the planner response/result. |
| `vorth_agy_read_result` | Read a previous cascade result by `cascadeId`. |
| `vorth_flash_high_execute` | Compatibility alias for bounded Flash High execution. |

The target model is resolved at runtime. On the tested Antigravity runtime, Gemini 3.5 Flash High maps to:

```yaml
id: gemini-3-flash-agent
displayName: Gemini 3.5 Flash (High)
model: MODEL_PLACEHOLDER_M132
```

Do not hardcode the enum as the only path. Use the resolver first and treat `MODEL_PLACEHOLDER_M132` as a known fallback.

The bridge is intentionally narrow:

- It is enabled only per project after user approval.
- It is never configured for Codex.
- It is called only after Superpowers/ECC reduce work to a specific execution task.
- It defaults to patch-only output; the main Agy agent applies, verifies, and reviews.
- It must not handle architecture, security review, broad debugging, or final review.

If Agy requires user-level MCP registration, Vorth should ask first, point the registration at the project-local server under `.vorth/mcp/`, and make the server reject delegation calls outside a Vorth-enabled repo.

## Worker Profile

For a second Google/Antigravity account, use the same Antigravity binary with an isolated profile:

```powershell
node .\.vorth\mcp\vorth-agy-native-bridge\profile-manager.mjs init --user-data-dir C:\tmp\vorth-agy-worker --extensions-dir C:\tmp\vorth-agy-worker-ext
node .\.vorth\mcp\vorth-agy-native-bridge\profile-manager.mjs login --user-data-dir C:\tmp\vorth-agy-worker --extensions-dir C:\tmp\vorth-agy-worker-ext --workspace .
node .\.vorth\mcp\vorth-agy-native-bridge\profile-manager.mjs status --user-data-dir C:\tmp\vorth-agy-worker
```

The worker profile must be logged in once interactively before it can serve native OAuth requests. The bridge should prefer the active profile until the worker profile reports a usable workspace language server.

## Modes

| Mode | Meaning |
| --- | --- |
| `project-local` | Default. Vorth activation is scoped to this repo through `.vorth/`, `GEMINI.md`, `AGENTS.md`, and project-local assets. |
| `native` | User approved official plugin/global install for maximum native behavior. |
| `mixed` | Some pieces are project-local, others are native/global. |
| `degraded` | One or both stacks are missing; Vorth uses its minimal internal workflow and reports what is missing. |

## Turn Process Summary

### Antigravity

- Vorth uses `GEMINI.md` as the project instruction adapter.
- ECC's official Antigravity target writes `.agent/rules`, `.agent/workflows`, `.agent/skills`, and `.agent/ecc-install-state.json`.
- Superpowers' official Antigravity plugin uses session-start activation, so it is the best fidelity path when the user accepts harness-level install.
- The optional native bridge is Agy-only and exposed through MCP, not through Codex instructions.

### Codex

- Codex reads `AGENTS.md` before work at session/run start.
- Codex discovers project skills from `.agents/skills` from the current directory up to the repo root.
- Codex plugins can bundle skills and hooks.
- Codex subagents are explicit; Vorth should request them only during Superpowers plan execution or deliberate parallel review.

## Stack Roles

| Stack | Role in Vorth | When Used |
| --- | --- | --- |
| Superpowers | Baseline workflow | Every non-trivial Vorth task. |
| CodeGraph | Codebase intelligence layer | Before broad codebase exploration, file discovery, relationship tracing, and many-file reads. |
| ECC | Specialist layer | Planning complexity, TDD support, code review, security, build failures, language-specific risks. |
| Agy Native Bridge | Execution adapter | Bounded implementation, build fixes, TDD GREEN phase, mechanical refactors, docs, and test execution in Antigravity only. |

## Specialist Routing

| Signal | ECC Specialist |
| --- | --- |
| Complex plan or architecture | `planner` / `architect` |
| Behavior change | `tdd-guide` / `tdd-workflow` |
| Finished code | `code-reviewer` |
| Auth, secrets, payments, permissions, user data | `security-reviewer` |
| Build/type/test failure | `build-error-resolver` |
| Language-specific risk | `typescript-reviewer`, `python-reviewer`, `go-reviewer`, etc. |

## Commands

| Command | Purpose |
| --- | --- |
| `/vorth init` | Initialize Vorth in the current repository. |
| `/vorth status` | Show activation files, stack availability, install scope, and context summary. |
| `/vorth reset` | Remove only Vorth-managed files/blocks after confirmation. |

The project-local CLI implements the same flows:

```powershell
node bin\vorth.mjs init --repo <repo> --bridge enabled --codegraph enabled
node bin\vorth.mjs status --repo <repo>
node bin\vorth.mjs reset --repo <repo> --confirm
```

`status` detects project bridge files, CodeGraph CLI/index state, checks user-level MCP registration read-only where possible, and prints suggested next steps when missing. It does not edit global MCP config automatically.

## Operating Rule

Superpowers decides **when** work happens.

CodeGraph decides **where to look first** when the codebase area is not already clear.

ECC decides **who** should review or assist specialist work.

The Agy Native Bridge decides nothing. It only executes bounded tasks that the main Agy agent delegates.

Vorth decides **whether this repository opted in** and keeps the project context current.
