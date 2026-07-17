---
name: vorth
description: Project-local software-engineering harness for Antigravity and Codex. Use when the user invokes vorth commands or the repository contains .vorth/vorth.config.json or a VORTH managed block.
---

# Vorth

Vorth activates an engineering workflow per repository. The CLI owns activation,
configuration, generated runtime instructions, health checks, and project-local
stack adapters. Do not reproduce init by reading every template or narrating every
stack: execute the CLI once and report its compact result.

## Activation

Vorth is active when `.vorth/vorth.config.json` exists. A managed Vorth block in
`AGENTS.md` or `GEMINI.md` is the harness bootstrap.

When active:

1. Read `.vorth/runtime.md`.
2. Read `.vorth/context.md` only for durable project context.
3. Load a detailed `.vorth/instructions/*.md` file only when runtime routing makes
   it relevant to the current task.
4. Follow the user's explicit instructions over Vorth.

Do not announce every stack on every turn. One short degraded-mode note is enough
when a missing tool materially changes the work.

## Commands

Run the executable instead of simulating these operations:

```powershell
vorth init --repo <repo>
vorth repair --repo <repo>
vorth sync --repo <repo> --json
vorth status --repo <repo> --json
vorth doctor --repo <repo> --json
vorth reset --repo <repo> --confirm --json
```

Interactive `init` creates or upgrades Vorth files, preserves options not explicitly
passed, initializes CodeGraph when enabled and available, then offers a guided
repair plan. It asks separately before network or harness-level changes. Use
`--json` or `--no-setup` for deterministic project activation only. Open a new
Antigravity/Codex session after init or sync so provider bootstrap files reload.

Use explicit init overrides only when the user requests them:

```text
--bridge enabled|disabled|skipped
--codegraph enabled|disabled|skipped
--impeccable auto|enabled|disabled|skipped
--layers advisory|enabled|disabled|skipped
--ponytail full|disabled|skipped
--rtk auto|enabled|disabled|skipped
--caveman subagent-only|disabled|skipped
--superpowers auto|native|project-local|disabled|skipped
--ecc-antigravity auto|minimal|disabled|skipped
--ecc-codex auto|minimal|disabled|skipped
```

`status` is read-only and does not contact Antigravity by default. Add `--probe`
only when an explicit live bridge check is needed. `doctor` converts health into
actionable issues and distinguishes blockers, manual checkpoints, and optional
degradation. `sync` regenerates managed files from JSON configuration.
`reset` removes only `.vorth/`, Vorth blocks, and its local Git exclude block; it
preserves CodeGraph indexes and external/native stack installs.

## Explicit Setup

External installation is a separate, approval-bearing operation:

```powershell
vorth setup --repo <repo>
vorth setup --repo <repo> --stack <name> --json
```

First run setup without approvals to receive its scope and required flags. Network
operations require `--allow-network --confirm`; harness/global changes require
`--allow-native --confirm`. Never add these flags without user approval.

Supported adapters: `codegraph`, `superpowers`, `ecc`, `impeccable`, `layers`,
`ponytail`, `rtk`, `caveman`, and `bridge`. Caveman intentionally remains
policy-only. Bridge runtime files live under `~/.vorth/bridge`; project config only
enables their use. Authenticate the dedicated worker once with
`vorth bridge login --repo <repo>`.

## Runtime Model

- Superpowers: baseline process when its official runtime is available; Vorth has
  a small fallback process when it is absent.
- CodeGraph: route broad code exploration before many file reads. Skip when the
  exact file/symbol is known. Fall back to narrow search when unavailable/stale.
- ECC: specialists for planning, architecture, TDD, review, security, build, and
  language-specific risk. It is not an always-on second baseline.
- Impeccable: visible frontend/UI quality gate only.
- Layers: product/UX ambiguity and decision discovery only.
- Ponytail: complexity check after context and before edit. Correctness, security,
  accessibility, compatibility, migrations, and tests outrank minimalism.
- RTK: noisy command output only. Bypass for exact/raw output, JSON, auth,
  interactive/destructive commands, or ambiguity; fall back to raw output.
- Caveman: compact subagent/handoff reports only, never main reasoning or warnings.
- Agy Native Bridge: Antigravity-only bounded executor. Main agent owns scope,
  patch validation, tests, review, and final answer. Codex ignores it.

## Safety

Vorth's local Git exclude block hides only `.vorth/` and `.codegraph/`. Official
stack assets in `.agent/`, `.agents/`, `.codex/`, or `.gemini/` are not hidden
automatically because they may be intentional project source. Preserve user content
outside managed markers and never remove external stack installs during reset.
