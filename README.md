# Vorth

**Full-cycle engineering harness for Antigravity.**

Vorth orchestrates five stacks into a single automated pipeline with two human-approval checkpoints:

| Stack | Role |
|-------|------|
| **ECC** | Specialist agents — TDD, code review, security, architecture, build errors |
| **Superpowers** | Planning & execution methodology — brainstorm → plan → subagent execution |
| **Layers** | Product design thinking — activated when UX ambiguity is detected |
| **Impeccable** | Frontend design quality — shape before code, audit/polish before merge |
| **CodeGraph** | Semantic code intelligence (MCP) — codebase exploration, impact analysis, symbol tracing |

---

## How It Works

Vorth is **opt-in per project** — it never activates globally. To use it:

```
# 1. In the Antigravity agent chat, in your project:
/vorth init

# 2. That's it. Describe what you want:
"add auth with JWT and Supabase"
"fix the bug in checkout flow"
"build a new analytics dashboard"
```

Vorth detects the request type, routes it through the appropriate pipeline, and stops at two checkpoints for your approval:

1. **Checkpoint 1** — Before execution begins (you approve the plan)
2. **Checkpoint 2** — Before merge (you approve the final result)

---

## Pipelines

| Request Type | Flow |
|---|---|
| **New Project** | Brainstorm → Layers (if UX unclear) → Impeccable shape (if UI) → Plan → ⏸ CP1 → Execute (ECC + Superpowers) → Impeccable audit → ⏸ CP2 |
| **New Feature** | CodeGraph scan → Layers (if UX unclear) → Plan → Impeccable shape (if UI) → ⏸ CP1 → Execute → Impeccable audit → ⏸ CP2 |
| **Bug Fix / Task** | CodeGraph investigate → Systematic debug → TDD fix → Code review → Commit |

---

## Installation

### 1. Install the skill

Copy `SKILL.md` to your Antigravity skills directory:

```powershell
# Windows
Copy-Item -Path "SKILL.md" -Destination "$env:USERPROFILE\.gemini\config\skills\vorth\SKILL.md" -Force
```

Or clone this repo directly into the skills directory:

```powershell
git clone git@github.com:musyaf4x/vorth.git "$env:USERPROFILE\.gemini\config\skills\vorth"
```

### 2. Prerequisites

Vorth expects these stacks to be installed in your Antigravity user config:

| Stack | Install |
|-------|---------|
| **ECC** | [github.com/Wirasm/ECC](https://github.com/Wirasm/ECC) |
| **Superpowers** | [github.com/zackiles/superpowers](https://github.com/zackiles/superpowers) |
| **Layers** | Install `layers-skills` to `~/.gemini/config/skills/` |
| **Impeccable** | `npx impeccable skills install` in each project |
| **CodeGraph** | `npx @colbymchenry/codegraph` — then `codegraph init -i` per project |

### 3. Initialize a project

In the Antigravity chat, navigate to your project and run:

```
/vorth init
```

Vorth will auto-detect your stack, ask minimal questions, and write:

```
your-project/
├── GEMINI.md              ← activates Vorth in all future sessions
├── .vorth/
│   ├── vorth.config.md    ← project config (edit anytime)
│   └── context.md         ← living session context
└── docs/vorth/plans/      ← implementation plans saved here
```

---

## Commands

| Command | Description |
|---------|-------------|
| `/vorth init` | Initialize Vorth in the current project |
| `/vorth status` | Show config, active stacks, CodeGraph index stats, and current plans |
| `/vorth reset` | Remove Vorth from the current project |

---

## Project Config (`vorth.config.md`)

```markdown
project_name: my-app
project_type: fullstack          # backend-only | frontend-only | fullstack | api-only | prototype
ui_layer: yes
stack: Next.js + PostgreSQL
design_register: product         # brand | product | n/a
layers_threshold: ambiguous      # always | ambiguous | never
impeccable_active: yes
codegraph_active: yes
```

Edit this file anytime to adjust Vorth's behavior for your project.

---

## Rules

Vorth enforces these non-negotiable rules during every pipeline:

1. Never skip a checkpoint
2. Never start implementation without an approved plan
3. Always use TDD — tests before implementation
4. Always invoke the right specialist (don't reinvent what ECC agents do)
5. Update `.vorth/context.md` after every session
6. Impeccable never activates for `api-only` or `backend-only` projects
7. Layers activates when UX ambiguity is detected — never skip it
8. Never commit to `main`/`master` without Checkpoint 2 approval
9. CodeGraph before grep — always `codegraph_explore` first, never grep/read loops
10. Security-sensitive code always gets `security-reviewer`

---

## License

MIT
