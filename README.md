# Vorth

Vorth is a project-local engineering harness for Antigravity and Codex. It does
not replace the underlying stacks; it activates them per repository, routes each
one to a narrow role, and reports when an official runtime is missing.

Version 0.4 adds a real local CLI, presets, a declarative health reconciler, and a
stable Antigravity worker bridge. Project activation remains cheap; missing
required runtimes are repaired through one guided command instead of memorized
per-stack commands.

## Stack Map

| Stack | Role | Use it when |
| --- | --- | --- |
| Superpowers | Baseline process | Clarification, planning, TDD, execution, review, verification |
| CodeGraph | Code intelligence | Before broad exploration or many-file reads |
| ECC | Engineering specialists | Architecture, tests, security, build failures, code/language review |
| Impeccable | Frontend quality gate | Visible UI design, critique, accessibility, responsive behavior |
| Layers | Product/UX decision gate | Intent, conceptual model, or interaction flow is unclear |
| Ponytail | Complexity guard | After context is sufficient and before editing |
| RTK | Shell-output optimizer | Noisy search, diff, test, build, lint, and log output |
| Caveman | Compact report mode | Low-risk subagent summaries and handoffs only |
| Agy Native Bridge | Bounded executor | Antigravity-only implementation after scope is explicit |

The user instruction always wins. Superpowers owns process; the other stacks are
routed gates, guards, or executors. Vorth never invokes every stack as a ritual.

## Low-Token Activation

Install the short command once from the Vorth checkout:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

Open a new terminal. In any target repository, run:

```powershell
vorth init
```

`init` does all project-local activation in one process:

- creates or upgrades `.vorth/`;
- writes authoritative `.vorth/vorth.config.json` and a generated Markdown summary;
- compiles a compact, config-aware `.vorth/runtime.md`;
- adds small managed blocks to `AGENTS.md` and `GEMINI.md`;
- writes the local Git exclude block;
- runs `codegraph init` once when CodeGraph is enabled, its CLI is available,
  and `.codegraph/` is not already present;
- builds a repair plan for missing required runtimes.

Interactive `init` offers to apply the safe parts of that plan and asks separately
before network or harness-level changes. `vorth init --json` and
`vorth init --no-setup` perform deterministic project activation only. Re-running
init preserves every option not explicitly passed. Legacy Markdown-only Vorth
configuration is migrated to JSON automatically.

The provider bootstrap reads only `.vorth/runtime.md`. Detailed instruction files
under `.vorth/instructions/` are loaded lazily when routing makes them relevant.
Open a new Antigravity/Codex session after `init` or `sync` so its project
instructions are loaded from session start.

## Configuration

The installer stores the recommended `agy-codex` preset as the user-level CLI
default. It enables the dedicated bridge worker and requires ECC minimal for both
harnesses. Project instructions remain project-local.

Built-in `balanced` defaults:

```json
{
  "superpowers": "auto",
  "eccAntigravity": "minimal",
  "eccCodex": "auto",
  "bridge": "disabled",
  "codegraph": "enabled",
  "impeccable": "auto",
  "layers": "advisory",
  "ponytail": "full",
  "rtk": "auto",
  "caveman": "subagent-only"
}
```

Use explicit init flags to change a value. For example:

```powershell
vorth init --bridge enabled --layers enabled --rtk disabled --no-setup
```

Change the default preset with `vorth configure --preset balanced` or select one
project with `vorth init --preset minimal`.

The JSON file is authoritative. Do not hand-edit generated `runtime.md`, managed
blocks, or the Markdown config summary; run `sync` to repair them from JSON.

## Commands

| Command | Purpose |
| --- | --- |
| `vorth configure` | Store the default CLI preset without changing agent-global behavior |
| `vorth init` | Create/upgrade activation and offer guided repair in an interactive terminal |
| `vorth sync` | Regenerate managed files from JSON configuration |
| `vorth setup` | Run the guided reconciler, or one explicit stack adapter |
| `vorth repair` | Detect and reconcile missing required stack health |
| `vorth bridge` | Initialize, authenticate, launch, or inspect the dedicated Agy worker |
| `vorth status` | Read-only activation and stack detection |
| `vorth doctor` | Turn health state into actionable issues |
| `vorth reset --confirm` | Remove only Vorth-managed activation |

Useful forms:

```powershell
vorth init --dry-run --json
vorth init --yes --allow-network --allow-native
vorth repair
vorth repair --json
vorth setup --stack codegraph --dry-run --json
vorth bridge login --repo .
vorth status --json
vorth doctor --probe --json
vorth reset --confirm --json
```

The `--yes` form is intended for an already-approved agent/automation run; network
and harness permission remain separate flags. Normal human use is just
`vorth init` and its prompts. `status` never probes the Antigravity language server by default. `--probe` is an
explicit live check. All JSON modes are compact enough for agent orchestration.

## Official Setup Adapters

Run setup first without approval flags to see its required scope. Network changes
need `--allow-network --confirm`; harness/global changes need
`--allow-native --confirm`. `--dry-run` never invokes an adapter.

| Stack | Vorth adapter |
| --- | --- |
| CodeGraph | Installs `@colbymchenry/codegraph` globally only after approval, runs `codegraph init`, then wires `antigravity,codex` globally for the `agy-codex` preset |
| Superpowers | Antigravity CLI plugin when available; Codex installation remains its official `/plugins` flow |
| ECC | Clones `affaan-m/everything-claude-code`, previews, then installs the minimal profile for project-local Antigravity or approved Codex home |
| Impeccable | `npx --yes impeccable install --providers=gemini,codex --scope=project` |
| Layers | Depth-1 project-local checkout of `jamiemill/layers-skills` with revision detection |
| Ponytail | Official `agy plugin install` or Codex plugin commands; both are harness-level |
| RTK | Official project Antigravity rules or approved global Codex wiring |
| Caveman | Policy-only by design, preserving `subagent-only` scope |
| Agy Native Bridge | Stable router under `~/.vorth/bridge`, fixed-port worker profile, and Antigravity MCP registration |

Vorth does not invent a native installer where the creator does not provide one.
It returns `manual_action`, `approval_required`, or `missing_cli` instead.

Official sources:

- [Superpowers](https://github.com/obra/superpowers)
- [Everything Claude Code](https://github.com/affaan-m/everything-claude-code)
- [CodeGraph](https://github.com/colbymchenry/codegraph)
- [Impeccable](https://github.com/pbakaus/impeccable)
- [Layers](https://github.com/jamiemill/layers-skills)
- [Ponytail](https://github.com/DietrichGebert/ponytail)
- [RTK](https://github.com/rtk-ai/rtk)
- [Caveman](https://github.com/JuliusBrussee/caveman)

CodeGraph telemetry follows its official policy; see
[TELEMETRY.md](https://github.com/colbymchenry/codegraph/blob/main/TELEMETRY.md).

## Development Flow

An ideal non-trivial Vorth turn is:

```text
user intent
  -> load compact runtime/context
  -> Layers only if product intent is unclear
  -> CodeGraph only if code scope is broad
  -> Superpowers clarification/design/plan
  -> ECC specialist only at a matching risk gate
  -> Ponytail complexity check
  -> implementation/TDD
  -> RTK for noisy commands when raw detail is not required
  -> optional bounded Antigravity delegation
  -> main-agent verification and review
  -> concise result; Caveman only for internal handoff/report
```

For a clear one-file change, this collapses to: understand, inspect the known file,
apply Ponytail lightly, edit, run a narrow check, and report. CodeGraph, Layers,
Impeccable, broad planning, and delegation are skipped unless risk appears.

## CodeGraph Rule

- Before broad codebase exploration, use `codegraph_explore` first.
- Before reading many files, query CodeGraph to narrow files, symbols, and flows.
- Skip CodeGraph when the exact file/symbol is already known.
- If unavailable or stale, say graph mode is degraded and use narrow search/reads.

Vorth init owns per-repo `codegraph init`. Agent MCP wiring remains CodeGraph's
official installer responsibility and is never changed silently.

## Agy Native Bridge

When `bridge` is enabled, `vorth repair` installs one stable MCP router at:

```text
~/.vorth/bridge/server.mjs
```

It uses the selected Antigravity OAuth session, not a Gemini API key. The bridge:

- resolves Gemini 3.5 Flash High from the selected session's live model list;
- refuses to guess when multiple usable workspace sessions exist;
- derives workspace URI from validated `repoRoot`;
- requires repository-relative `filesAllowed` and explicit acceptance criteria;
- binds cascade reads to the issuing repo, bridge process, and language server;
- rejects returned diffs outside allowed files or inside `.git/`, `.vorth/`, or
  `.codegraph/`;
- caps MCP frames, RPC responses, patch size, and fallback raw responses;
- exposes safe heartbeat/model metadata without calling user-status RPCs.

The main agent still owns patch application, tests, review, and final reporting.
Codex ignores this bridge.

The bridge uses a dedicated persistent profile under `~/.vorth/agy-worker` and a
small non-secret state file containing its fixed port allocation. Authenticate it
once with `vorth bridge login --repo .`; later sessions can use
`vorth bridge launch --repo .`. The router defaults to this worker profile and
reports ready only when both HTTPS and CSRF runtime arguments are present.

`vorth doctor` reports only missing required stacks as blockers. Optional missing
tools are informational. A configured bridge that still needs interactive OAuth
login is a checkpoint (`needs_attention`), not a broken installation.

## Git Hygiene And Reset

Vorth writes only `.vorth/` and `.codegraph/` to `.git/info/exclude`. It does not
hide `.agent/`, `.agents/`, `.codex/`, or `.gemini/`; official project-scoped stack
assets there may be intentional project source and should be reviewed normally.

`reset --confirm` removes `.vorth/`, the Vorth blocks in `AGENTS.md`/`GEMINI.md`,
and Vorth's local exclude block. It preserves `.codegraph/`, official stack assets,
and all external or harness-level installs.

## Verification

```powershell
npm.cmd run check
```

The test suite covers presets, reconciliation plans, stable bridge setup, fixed-port
worker state, low-token budgets, JSON output, idempotency, legacy migration,
dry-run/approval behavior, status/doctor/reset, Git hygiene, model resolution,
session ambiguity, delegation scope, and patch containment.
