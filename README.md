# Vorth

Vorth is a project-local engineering harness for Antigravity and Codex.

Current focus: **Superpowers + ECC only**.

- **Superpowers** is the baseline workflow: clarify, plan, TDD, execute, review, verify.
- **ECC** is the specialist layer: planner, architect, TDD guide, code reviewer, security reviewer, build resolver, and language reviewers.
- **Agy Flash High MCP bridge** is an optional Antigravity-only execution adapter for bounded tasks.

Layers, Impeccable, and CodeGraph are intentionally deferred until the Superpowers/ECC foundation is stable.

## Why This Shape

The clean architecture is:

```text
Vorth = project-local activation and memory
Superpowers = process controller
ECC = specialist engineering pool
Agy Flash High MCP bridge = bounded execution adapter
Antigravity/Codex = harness adapters
```

Vorth should not replace Superpowers or ECC internals. It should activate them, respect their official install structures, and decide when each one participates.

## Activation Model

Vorth stays opt-in per repository. A repository becomes Vorth-enabled only after:

```text
/vorth init
```

Init writes project-local activation files:

```text
.vorth/
  vorth.config.md
  context.md
  instructions/
    superpowers-ecc.md
    turn-process.md
  plans/
  mcp/
    vorth-flash-high-executor/   # optional, Agy only
GEMINI.md   # Antigravity adapter block
AGENTS.md   # Codex adapter block
```

`GEMINI.md` and `AGENTS.md` contain managed `VORTH:START` / `VORTH:END` blocks that tell the agent to read `.vorth/context.md` and follow `.vorth/instructions/superpowers-ecc.md`.

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

## Agy Flash High MCP Bridge

Vorth can optionally configure an Antigravity-only MCP bridge named `vorth-flash-high-executor`. It gives the main Agy agent a same-turn tool for bounded execution using Gemini 3.5 Flash with `thinkingLevel: high`.

This bridge is intentionally narrow:
- It is enabled only per project after user approval.
- It is never configured for Codex.
- It is called only after Superpowers/ECC reduce work to a specific execution task.
- It defaults to patch-only output; the main Agy agent applies, verifies, and reviews.
- It must not handle architecture, security review, broad debugging, or final review.

If Agy requires user-level MCP registration, Vorth should ask first, point the registration at the project-local server under `.vorth/mcp/`, and make the server reject calls outside a Vorth-enabled repo.

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
- The optional Flash High bridge is Agy-only and exposed through MCP, not through Codex instructions.

### Codex

- Codex reads `AGENTS.md` before work at session/run start.
- Codex discovers project skills from `.agents/skills` from the current directory up to the repo root.
- Codex plugins can bundle skills and hooks.
- Codex subagents are explicit; Vorth should request them only during Superpowers plan execution or deliberate parallel review.

## Stack Roles

| Stack | Role in Vorth | When Used |
| --- | --- | --- |
| Superpowers | Baseline workflow | Every non-trivial Vorth task. |
| ECC | Specialist layer | Planning complexity, TDD support, code review, security, build failures, language-specific risks. |
| Agy Flash High MCP bridge | Execution adapter | Bounded implementation, build fixes, TDD GREEN phase, mechanical refactors, docs, and test execution in Antigravity only. |

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

## Operating Rule

Superpowers decides **when** work happens.

ECC decides **who** should review or assist specialist work.

The Agy Flash High MCP bridge decides nothing. It only executes bounded tasks that the main Agy agent delegates.

Vorth decides **whether this repository opted in** and keeps the project context current.
