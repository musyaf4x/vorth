---
name: vorth
description: Project-local Vorth engineering harness for Antigravity and Codex. Use when the user runs /vorth init, /vorth status, or /vorth reset, or when the current repository has .vorth/vorth.config.md or a VORTH managed block in GEMINI.md or AGENTS.md. Vorth activates Superpowers as the baseline workflow, CodeGraph as the codebase intelligence layer, and ECC as the specialist engineering layer, with an optional Antigravity-only native OAuth MCP bridge for bounded Gemini 3.5 Flash High execution, while keeping Layers and Impeccable disabled until explicitly added later.
---

# Vorth Engineering Harness

Vorth is a project-local harness for Antigravity and Codex. This version focuses on three active stacks:

- Superpowers is the baseline workflow: clarify, brainstorm when needed, plan, TDD, execute, review, verify, finish.
- CodeGraph is the codebase intelligence layer: query it before broad codebase exploration or reading many files.
- ECC is the specialist layer: planner, architect, TDD guide, code reviewer, security reviewer, build resolver, and language reviewers.

Layers and Impeccable are intentionally deferred. Do not activate, configure, or mention them as active Vorth stacks unless a later Vorth version explicitly re-enables them.

## Core Contract

Use this hierarchy:

1. Vorth decides whether the repository opted in.
2. Superpowers controls the process flow.
3. CodeGraph narrows codebase exploration before broad file reads.
4. ECC supplies specialists at specific quality gates.
5. The optional Agy Native Bridge executes only bounded Antigravity tasks after routing is already decided.
6. The user's explicit instruction always wins over Vorth, Superpowers, CodeGraph, ECC, and model routing.

Short form:

```text
Vorth = project-local activation and memory
Superpowers = workflow baseline
CodeGraph = codebase intelligence layer
ECC = specialist pool
Agy Native Bridge = optional bounded execution adapter
Antigravity/Codex = harness adapters
```

## Activation Check

Run this check before any planning, coding, debugging, review, or status response.

1. If `.vorth/vorth.config.md` exists in the repository root, Vorth is active.
2. If `GEMINI.md` or `AGENTS.md` contains a managed `VORTH:START` block, Vorth is active.
3. If Vorth is active:
   - Read `.vorth/context.md` if present.
   - Read `.vorth/instructions/superpowers-ecc.md` if present.
   - Read `.vorth/instructions/codegraph.md` if present and `.vorth/vorth.config.md` does not disable CodeGraph.
   - Announce one compact line: `Vorth active: Superpowers baseline, CodeGraph [enabled/disabled/degraded], ECC specialists, mode [full/native/project-local/degraded], Agy native bridge [enabled/disabled]`.
   - Continue with the Vorth workflow below.
4. If Vorth is not active and the user did not type `/vorth init`, do not apply Vorth. Answer normally.
5. If the user typed `/vorth init`, run the init flow.

## Turn Process Assumptions

### Antigravity

Antigravity uses project-local `.agent/` assets for ECC when installed with ECC's `antigravity` target. Superpowers' official Antigravity path is a plugin install from `https://github.com/obra/superpowers`; its plugin uses a session-start hook so Superpowers is active from the first message. This is powerful, but it may be harness-level rather than strictly project-local.

Therefore Vorth must distinguish two scopes:

- `native`: install/use the creator's plugin or installer exactly as designed. Best fidelity, may affect more than one project.
- `project-local`: keep Vorth activation scoped to this repository using `.vorth/`, `GEMINI.md`, `AGENTS.md`, `.agent/`, and `.agents/` bootstraps. Best isolation, but may not get every native session hook.

Default to `project-local` unless the user explicitly approves a native/global install.

#### Agy Native Bridge

Vorth may configure an Antigravity-only MCP bridge named `vorth-agy-native-bridge`. This bridge lets the main Agy agent call Antigravity's own cascade RPC through the active Antigravity OAuth/session for bounded execution tasks. It is not a new stack, not a baseline behavior, and not available to Codex.

Use the bridge only after Superpowers/ECC have reduced the work to a specific execution task. Do not use it for architecture, planning, security review, broad debugging, final code review, or ambiguous work. Read `references/agy-flash-high-mcp-bridge.md` before creating or modifying the bridge.

The target model is resolved at runtime from Antigravity's model list. The known Gemini 3.5 Flash High mapping is:

```yaml
id: gemini-3-flash-agent
displayName: Gemini 3.5 Flash (High)
model: MODEL_PLACEHOLDER_M132
```

Do not use Gemini API keys for this bridge.

### Codex

Codex reads `AGENTS.md` before work when a session/run starts. It builds an instruction chain from global files and then project files from repo root down to the current directory. Codex also discovers skills from `.agents/skills` in the current directory, parents, and repo root. Codex subagents are explicit: spawn them only when the user or active workflow asks for them.

This means Vorth's Codex adapter must write a project `AGENTS.md` managed block and, when needed, project-local `.agents/skills` or `.codex/agents` assets. Do not assume Codex rereads `AGENTS.md` mid-session; after `/vorth init`, tell the user to restart/open a new Codex thread for automatic activation.

## Command Routing

| Command | Behavior |
| --- | --- |
| `/vorth init` | Initialize Vorth in the current repository. |
| `/vorth status` | Report activation files, stack availability, install scope, and recent context. |
| `/vorth reset` | Ask for confirmation, then remove only Vorth-managed blocks/files. Never remove ECC or Superpowers installs automatically. |

If a message starts with `/vorth` but is not one of these commands, explain the supported commands.

The executable implementation is:

```powershell
node <vorth-skill>\bin\vorth.mjs init --repo <repo> --bridge enabled --codegraph enabled
node <vorth-skill>\bin\vorth.mjs status --repo <repo>
node <vorth-skill>\bin\vorth.mjs reset --repo <repo> --confirm
```

Use the CLI when available. It is idempotent, preserves user content outside Vorth managed blocks, and treats user-level MCP registration as read-only.

## Init Flow

Run this only when the user types `/vorth init`.

### Phase 0: Repository Safety

1. Confirm the current repository root and branch.
2. If the current directory is not a git repository, continue but record `git: none` in `.vorth/vorth.config.md`.
3. If uncommitted changes exist, do not revert them. Continue, but say Vorth will only touch Vorth-managed files.
4. Define success: this repository will contain `.vorth/`, a `GEMINI.md` Vorth block for Antigravity, and an `AGENTS.md` Vorth block for Codex.

### Phase 1: Stack Strategy

Use official stack mechanisms wherever possible. Do not copy random snippets from ECC or Superpowers into Vorth.

Set `install_scope` in `.vorth/vorth.config.md`:

- `project-local` by default.
- `native` only after explicit user approval, because Superpowers and some ECC Codex installs may affect the harness globally.
- `mixed` when Antigravity is project-local but Codex or Superpowers uses a native/global install.
- `degraded` when one or both stacks are missing and the user declines installation.

Also record these model-routing fields:

```yaml
agy_native_bridge: disabled, enabled, or skipped
agy_native_bridge_profile: active or worker
agy_native_bridge_server: .vorth/mcp/vorth-agy-native-bridge/server.mjs
agy_flash_high_executor: disabled, enabled, or skipped
agy_flash_high_model_id: gemini-3-flash-agent
agy_flash_high_model_enum: auto
agy_flash_high_scope: agy-only
codex_flash_high_executor: disabled
codegraph: enabled, disabled, or skipped
codegraph_scope: project-local
codegraph_index: .codegraph
codegraph_policy: broad-exploration-first
```

Keep `codex_flash_high_executor` disabled. The bridge is only for Antigravity.

### Phase 2: Superpowers Availability

Check for Superpowers in this order:

1. Native Antigravity plugin. If the user approved native install, use:

```powershell
agy plugin install https://github.com/obra/superpowers
```

This is the creator's Antigravity path. Record that it may activate Superpowers outside the current project.

2. Native Codex plugin. Ask the user to install Superpowers from Codex `/plugins` or the Codex app plugin directory. Do not fake this by writing a custom Vorth skill if the native plugin is the user's choice.

3. Project-local fallback. If strict project-local isolation is required, clone or vendor the official Superpowers repository under `.vorth/vendor/superpowers` only with user approval for network access. Use its own `GEMINI.md`, `AGENTS.md`, `skills/`, and hook documentation as references. In `GEMINI.md`/`AGENTS.md`, instruct the agent to follow Superpowers by loading the relevant Superpowers skill files from that vendored checkout.

If Superpowers is unavailable, continue in `degraded` mode with Vorth's minimal workflow, but clearly report that the native Superpowers behavior is not installed.

### Phase 3: ECC Availability

Check ECC in this order:

1. If an ECC checkout exists, prefer its official installer.
2. If no checkout exists and user approved network access, clone only from the official repository:

```powershell
git clone https://github.com/affaan-m/ECC.git .vorth/vendor/ECC
```

3. For Antigravity project-local support, run the ECC installer from the target project root with target `antigravity`. Always dry-run first:

```powershell
.\.vorth\vendor\ECC\install.ps1 --target antigravity --profile minimal --dry-run
.\.vorth\vendor\ECC\install.ps1 --target antigravity --profile minimal
```

This writes ECC-managed assets to `.agent/` and records install state in `.agent/ecc-install-state.json`.

4. For Codex, ECC's official target is `codex`, which writes to the Codex home. Treat that as native/global. Do not run it without explicit approval:

```powershell
.\.vorth\vendor\ECC\install.ps1 --target codex --profile minimal --dry-run
.\.vorth\vendor\ECC\install.ps1 --target codex --profile minimal
```

If the user declines global Codex install, keep Codex activation project-local via `AGENTS.md` and use ECC only when its specialists are already available in the current Codex environment.

### Phase 4: CodeGraph Availability

Run this phase when `codegraph` is enabled, which is the default.

1. Check whether the `codegraph` CLI is available.
2. If available, run `codegraph init` from the target repository root. This lets CodeGraph create and maintain its own `.codegraph/` index.
3. If unavailable, continue Vorth init, then report the official install options:

```powershell
irm https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.ps1 | iex
npm i -g @colbymchenry/codegraph
```

4. Do not run remote installers or `npm i -g` automatically.
5. Do not run global agent wiring automatically. CodeGraph's own agent/MCP wiring command is:

```powershell
codegraph install
```

6. Record the chosen state in `.vorth/vorth.config.md`.
7. CodeGraph telemetry follows its official policy. Point users to https://github.com/colbymchenry/codegraph/blob/main/TELEMETRY.md for opt-out options.

Behavior rule when active:

- Before broad codebase exploration, use `codegraph_explore` first.
- Before reading many files, query CodeGraph first.
- For small changes where the file or symbol is already clear, skip CodeGraph.
- If CodeGraph is unavailable, stale, or not registered as a tool, say the graph layer is degraded and fall back to narrow `rg` and targeted file reads.

### Phase 5: Agy Native Bridge

Run this phase only when the user explicitly approves the Agy-only bridge for the target project. Do not configure it for Codex.

1. Read `references/agy-flash-high-mcp-bridge.md`.
2. Copy the project-local template from this Vorth skill:

```text
templates/mcp/vorth-agy-native-bridge/
```

into the target project:

```text
.vorth/mcp/vorth-agy-native-bridge/
```

When using the CLI, this is handled by:

```powershell
node <vorth-skill>\bin\vorth.mjs init --repo <repo> --bridge enabled
```

3. The bridge must expose:
   - `vorth_agy_status`
   - `vorth_agy_models`
   - `vorth_agy_delegate`
   - `vorth_agy_read_result`
   - `vorth_flash_high_execute` as a compatibility alias
4. The bridge must call Antigravity native RPC through the active Antigravity session. It must not use `GEMINI_API_KEY`.
5. The bridge must default to patch-only output. The main Agy agent applies changes, runs verification, and remains responsible for final review.
6. If Antigravity only supports user-level MCP registration, ask before editing `~/.gemini/config/mcp_config.json`. Keep the server path project-local and guard delegation by checking `.vorth/vorth.config.md`.
7. Never print or persist Antigravity command lines, CSRF tokens, OAuth tokens, cookies, or user status values.
8. Record the chosen state in `.vorth/vorth.config.md`.

Allowed bridge tasks:
- Bounded implementation after plan approval.
- Build/type/test fix with known failure.
- TDD GREEN phase for a small test target.
- Mechanical refactor with explicit file scope.
- Documentation update.
- E2E/test execution summary.

Forbidden bridge tasks:
- Architecture or product decisions.
- Planning and task decomposition.
- Security review.
- Final code review.
- Broad or ambiguous debugging.
- Large refactor without a written plan.
- Any Codex workflow.

### Phase 6: Write Vorth Project Files

Create or update these files. Preserve user content. Use managed blocks for existing `GEMINI.md` and `AGENTS.md`.

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
GEMINI.md
AGENTS.md
```

`GEMINI.md` managed block:

```md
<!-- VORTH:START -->
# Vorth Active

This repository has opted into Vorth.

Before planning, coding, debugging, reviewing, or committing in this repo:
1. Read `.vorth/context.md`.
2. Follow `.vorth/instructions/superpowers-ecc.md`.
3. Follow `.vorth/instructions/codegraph.md` when CodeGraph is enabled.
4. Use Superpowers as the baseline workflow.
5. Use CodeGraph before broad codebase exploration or reading many files.
6. Use ECC only as the specialist layer.
7. Update `.vorth/context.md` after meaningful work.
8. If `.vorth/vorth.config.md` enables the Agy Native Bridge, use it only for bounded execution tasks.
<!-- VORTH:END -->
```

`AGENTS.md` managed block:

```md
<!-- VORTH:START -->
# Vorth Active

This repository has opted into Vorth.

Before planning, coding, debugging, reviewing, or committing in this repo:
1. Read `.vorth/context.md`.
2. Follow `.vorth/instructions/superpowers-ecc.md`.
3. Follow `.vorth/instructions/codegraph.md` when CodeGraph is enabled.
4. Use Superpowers as the baseline workflow.
5. Use CodeGraph before broad codebase exploration or reading many files.
6. Use ECC only as the specialist layer.
7. Update `.vorth/context.md` after meaningful work.

Codex loads AGENTS.md at session start. After `/vorth init`, restart Codex or open a new thread for automatic activation.

The Agy Native Bridge is Antigravity-only. Codex must ignore it.
<!-- VORTH:END -->
```

`superpowers-ecc.md` must include this operating contract:

```md
# Vorth Superpowers + ECC Contract

Superpowers owns process. ECC owns specialist review and targeted expertise.
CodeGraph owns codebase-intelligence routing before broad exploration.

## Workflow

- Small, obvious task: understand, make a narrow change, verify, update context.
- Bug or failing test: use systematic debugging, identify root cause, write/verify failing test, fix, review changed files.
- Non-trivial feature/refactor: brainstorm or clarify, write a plan, get approval, execute with TDD, review, verify.
- Large independent plan: use Superpowers subagent-driven-development when available.

## CodeGraph Routing

- Before broad codebase exploration, query CodeGraph first.
- Before reading many files, query CodeGraph first.
- For small changes with a clear file or symbol, skip CodeGraph.
- If CodeGraph is unavailable, fall back to narrow `rg` and targeted file reads.

## ECC Specialist Routing

- Complex implementation plan: ECC planner or architect.
- Behavior change: ECC tdd-guide or tdd-workflow.
- Finished code: ECC code-reviewer.
- Auth, secrets, payments, permissions, user data: ECC security-reviewer.
- Build/type/test failure: ECC build-error-resolver.
- Language-specific risk: matching ECC language reviewer.

## Agy Native Bridge Execution

Use this only in Antigravity and only when `.vorth/vorth.config.md` enables it.

- Delegate to `vorth_agy_delegate` or `vorth_flash_high_execute` only after the task is bounded.
- Send complete task text, file scope, acceptance criteria, and verification command suggestions.
- Request patch-only output by default.
- Apply and verify changes in the main Agy session.
- Do not use this bridge for planning, architecture, security review, final review, or Codex.

## Bounds

- Do not invoke every ECC specialist by default.
- Do not let ECC replace Superpowers as the process controller.
- Do not let CodeGraph replace Superpowers or ECC.
- Do not use Layers or Impeccable until Vorth explicitly enables them.
```

### Phase 7: Announce Result

Report:

```text
Vorth initialized.
Mode: [project-local/native/mixed/degraded]
Superpowers: [native/project-local/missing]
ECC Antigravity: [installed/missing/skipped]
ECC Codex: [installed/missing/skipped]
CodeGraph: [enabled/disabled/skipped]
CodeGraph CLI: [detected/missing/error]
CodeGraph index: [present/missing]
Agy Native Bridge: [enabled/disabled/skipped]
Activation: GEMINI.md + AGENTS.md managed blocks
Next: restart/open a new Agy or Codex session in this repo
```

## Status Flow

For `/vorth status`, inspect and report:

- Repo root and branch.
- Whether `.vorth/vorth.config.md` exists.
- Whether `GEMINI.md` contains `VORTH:START`.
- Whether `AGENTS.md` contains `VORTH:START`.
- Superpowers availability and scope.
- ECC Antigravity availability: `.agent/ecc-install-state.json` and `.agent/skills`.
- ECC Codex availability: current Codex skills/agents if visible, or config value if not.
- CodeGraph availability: config state, CLI availability, `.codegraph/` index, and MCP registration if readable.
- Agy Native Bridge availability: `.vorth/mcp/vorth-agy-native-bridge`, config flag, MCP registration, and `vorth_agy_status` if available.
- The CLI status command must inspect user-level MCP config read-only and print a suggested registration snippet when missing.
- Current `.vorth/context.md` summary.
- Deferred stacks: Layers and Impeccable, always shown as disabled in this version.

## Reset Flow

For `/vorth reset`:

1. Ask for confirmation.
2. Remove only `.vorth/` and the Vorth managed blocks in `GEMINI.md` and `AGENTS.md`.
3. Do not uninstall ECC, Superpowers, `.agent/`, `.agents/`, or `.codex/` automatically. Those may be owned by their official installers or the user.
4. If the user wants stack uninstall, point them to each stack's official uninstall/disable path.
5. Do not remove user-level MCP registrations automatically. If Vorth added one, show the exact entry and ask before changing it.

## Workflows When Active

### Small Task

1. State the assumption briefly.
2. Make the smallest safe change.
3. Verify narrowly.
4. Update `.vorth/context.md` if the change affects future work.

### Bug Fix

1. Use Superpowers systematic debugging when available.
2. Use CodeGraph first if the failing area is unclear or spans many files.
3. Find root cause before fixing.
4. Write or identify a failing test/reproduction.
5. Fix narrowly.
6. Call ECC `code-reviewer` for changed files when available.
7. Call ECC `build-error-resolver` if build/test fails.
8. Verify and update context.

### Feature or Refactor

1. Use Superpowers brainstorming when requirements are unclear.
2. Use CodeGraph before broad codebase exploration or reading many files.
3. Use Superpowers writing-plans for multi-step work.
4. Ask for approval before executing a non-trivial plan.
5. Execute with TDD.
6. Use ECC specialists only at relevant gates.
7. Verify and update context.

## Non-Negotiables

- Vorth is opt-in per repository.
- Do not silently install global/native plugins. Ask first and explain scope.
- Prefer official ECC and Superpowers installers/plugins over copied snippets.
- Keep Superpowers as baseline, CodeGraph as codebase intelligence, and ECC as specialist layer.
- Use CodeGraph before broad exploration or many-file reads, but skip it for obvious one-file changes.
- Do not activate Layers or Impeccable in this version.
- Preserve user files and unrelated changes.
- Keep `.vorth/context.md` concise and current.
- Keep the Agy Native Bridge Antigravity-only and task-specific.
- Never print or persist Antigravity command lines, CSRF tokens, OAuth tokens, cookies, or user status values.
