---
name: vorth
description: Vorth full-cycle engineering harness. Invoke when the current project has a .vorth/ directory or GEMINI.md indicates Vorth is active. Handles /vorth init to bootstrap a new project. Orchestrates ECC agents, Superpowers methodology, Layers design thinking, Impeccable frontend quality, and CodeGraph semantic code intelligence into a single automated pipeline with two human checkpoints.
---

# Vorth Engineering Harness

Vorth is a contextual, opt-in engineering harness for Antigravity. It orchestrates five stacks — **ECC** (specialist agents & skills), **Superpowers** (planning & execution methodology), **Layers** (product design thinking), **Impeccable** (frontend design quality), and **CodeGraph** (semantic code intelligence via MCP) — into one coherent pipeline with exactly two human-approval checkpoints.

**Vorth is not a global default.** It activates only in projects where `/vorth init` has been run.

---

## STEP 0 — ACTIVATION CHECK (run this first, every session)

Before doing anything else, determine whether Vorth is active:

1. Does the current project root contain `.vorth/vorth.config.md`?
   - **YES** → Load `.vorth/vorth.config.md` and `.vorth/context.md` silently → check CodeGraph status → announce activation → proceed to ORCHESTRATION ENGINE
   - **NO** → Check: did the user type `/vorth init`?
     - **YES** → Run INIT FLOW
     - **NO** → Do NOT apply Vorth behavior. Respond as normal Antigravity without Vorth.

**CodeGraph check (silent, every session start):**
- Does `.codegraph/` exist in the project root?
  - **YES** → Call `codegraph_status` to confirm index is healthy. If pending syncs exist, note it internally.
  - **NO** → CodeGraph is inactive. Note in session state: `codegraph_active: false`

**On activation announce (one line only):** `⚙ Vorth active — [project_name] | [type] | [stack] | CodeGraph: [✓ indexed / — not initialized]`

---

## COMMAND ROUTING

| Command | Action |
|---------|--------|
| `/vorth init` | Run INIT FLOW |
| `/vorth status` | Run STATUS FLOW |
| `/vorth reset` | Confirm with user → delete `.vorth/` and `GEMINI.md` |
| Any other request when Vorth is active | Run ORCHESTRATION ENGINE |

---

## INIT FLOW

Run this ONLY when user types `/vorth init` AND `.vorth/` does NOT already exist.

If `.vorth/` already exists: announce "Vorth is already initialized. Use `/vorth status` to check the current config."

### Phase 0 — Environment Validation & Auto-Setup

**This phase runs before anything else and may block init if the environment is incomplete.**

Run all checks silently. Collect results into a status list. Only announce at the end of this phase.

---

**A. ECC** *(global — installed once in Antigravity user config)*

Check if ECC is accessible by verifying the presence of its directory in the Antigravity workspace or user config path:
- Look for an `ECC` folder containing agent/skill definitions (agents with names like `code-reviewer`, `security-reviewer`, `tdd-guide`, `architect`, `build-error-resolver`)
- Check common paths: `~/.gemini/config/skills/ecc/`, or any workspace directory Antigravity loads skills from

Result:
- Found → `ECC: OK`
- Not found → `ECC: MISSING`
  - Install (clone then run the installer):
    ```powershell
    git clone https://github.com/affaan-m/ECC <your-antigravity-workspace>/ECC
    cd <your-antigravity-workspace>/ECC
    .\install.ps1        # Windows
    # ./install.sh       # macOS/Linux
    ```
  - The installer detects your harness and wires the correct skills/agents automatically
  - Restart Antigravity after install

---

**B. Superpowers** *(global — installed once in Antigravity user config)*

Check if Superpowers skills are accessible:
- Look for a `superpowers` directory or individual skill files named: `brainstorming`, `writing-plans`, `systematic-debugging`, `subagent-driven-development`, `test-driven-development`, `verification-before-completion`, `requesting-code-review`, `executing-plans`
- Check common paths: `~/.gemini/config/skills/superpowers/`, or any workspace directory Antigravity loads from

Result:
- Found → `SUPERPOWERS: OK`
- Not found → `SUPERPOWERS: MISSING`
  - Install via Gemini CLI extension system:
    ```bash
    gemini extensions install https://github.com/obra/superpowers
    ```
  - To update later: `gemini extensions update superpowers`
  - Restart Antigravity after install

---

**C. Layers** *(global — installed once in Antigravity user config)*

Check if Layers skills are accessible:
- Look for a `layers-skills` directory or skill files named: `layers-orient`, `layers-user-needs`, `layers-interaction-flow`, `layers-domain`
- Check common paths: `~/.gemini/config/skills/layers-skills/`, or any workspace directory Antigravity loads from

Result:
- Found → `LAYERS: OK`
- Not found → `LAYERS: MISSING`
  - Clone directly into the Antigravity workspace (no special installer needed):
    ```bash
    git clone https://github.com/jamiemill/layers-skills <your-antigravity-workspace>/layers-skills
    ```
  - Restart Antigravity after cloning

---

**D. CodeGraph** *(MCP global + per-project index)*

Step 1 — verify CLI is installed:
- Run `codegraph --version`
- If not found → `CODEGRAPH_CLI: MISSING`
  - Install (Windows PowerShell): `irm https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.ps1 | iex`
  - Install (macOS/Linux): `curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh`
  - After install: open a new terminal (PATH update requires new shell), then re-run `/vorth init`
- If found → proceed to Step 2

Step 2 — initialize per-project index:
- Does `.codegraph/` exist in the project root?
  - YES → call `codegraph_status` to verify health → `CODEGRAPH_INDEX: OK`
  - NO → run `codegraph init -i` in the project root
    - Succeeded → `CODEGRAPH_INDEX: INITIALIZED`
    - Failed → `CODEGRAPH_INDEX: FAILED` (note the error output for the announcement)

---

**E. Impeccable** *(per-project — only if UI layer is detected)*

*Skip entirely if project has no UI layer (backend-only, api-only, prototype with no UI).*

Check if Impeccable is installed for this project:
- Look for `.agents/skills/impeccable/` or `.gemini/skills/impeccable/` in the project root
- If found → `IMPECCABLE: OK`
- If NOT found → run the install command in the project root:
  ```
  npx impeccable skills install
  ```
  - Succeeded → `IMPECCABLE: INITIALIZED`
  - Failed (npx not available, or install errors) → `IMPECCABLE: FAILED` (note the error)
  - Alternative if npx fails: `git submodule add https://github.com/pbakaus/impeccable .impeccable` then `npx impeccable skills link --source=.impeccable --providers=gemini`

---

**Environment Gate — decision after all checks:**

Collect all results. Then:

**IF any stack shows `MISSING` or `FAILED`:**

```
⚠ Vorth Environment Incomplete — initialization blocked

Vorth requires the full stack to be present before initializing a project.
Partial environments lead to degraded or broken agent behavior — Vorth will not proceed.

Status:
  [✓/✗] ECC          [OK / MISSING — clone repo then run .\install.ps1]
  [✓/✗] Superpowers  [OK / MISSING — gemini extensions install https://github.com/obra/superpowers]
  [✓/✗] Layers       [OK / MISSING — git clone https://github.com/jamiemill/layers-skills <workspace>/layers-skills]
  [✓/✗] CodeGraph    [OK / MISSING CLI — irm .../install.ps1 | iex (Windows)]
  [✓/✗] Impeccable   [OK / FAILED — npx impeccable skills install]

Fix the issues above, then restart Antigravity if needed, and run /vorth init again.
```

STOP. Do not proceed to Phase 1 until all checks are OK or INITIALIZED.

**IF all stacks are OK or INITIALIZED:**
- Proceed silently to Phase 1
- Any `INITIALIZED` items will be reported in the final announcement (Phase 4)

---

### Phase 1 — Auto-detect from codebase

Before asking the user anything, read the following (silently, do not announce each step):

- `package.json` or `requirements.txt` or `Cargo.toml` or `go.mod` → detect stack
- Presence of `/src/app/`, `/pages/`, `/components/`, `index.html`, or UI framework imports → detect UI layer
- Presence of `/api/`, `/routes/`, `/controllers/`, `server.`, `main.py`, `main.go` → detect backend layer
- Root-level README if it exists → detect project name and purpose

### Phase 2 — Ask only what you couldn't detect

Send ONE message with only the unknowns. Do not ask for things you already know. Example format:

```
I detected: Next.js + PostgreSQL fullstack project with a UI layer.

A few things I need to confirm for Vorth:

1. Project name: (I'll use the folder name "[folder]" if you skip this)
2. Design register for the UI — is this a **brand** surface (landing page, marketing, portfolio) or a **product** surface (app, dashboard, tool)?
3. Anything else I should know about conventions or constraints?
```

### Phase 3 — Write project files

After collecting answers, create all four files:

---

**FILE: `GEMINI.md`** (project root)

```markdown
# Vorth Engineering Harness — Active

This project uses **Vorth** for all engineering work.

## Session Bootstrap (run every time)

When starting any session in this project:
1. Invoke the `vorth` skill immediately
2. Load `.vorth/vorth.config.md` for project configuration
3. Load `.vorth/context.md` for living project context
4. Follow Vorth orchestration for all engineering tasks — do not bypass it

## Project Summary

Name: [project_name]
Stack: [stack]
Type: [project_type]
UI Layer: [yes/no]
Design Register: [brand/product/n/a]
Impeccable: [active/inactive]
```

---

**FILE: `.vorth/vorth.config.md`**

```markdown
# Vorth Project Configuration

project_name: [name]
project_type: [backend-only|frontend-only|fullstack|api-only|prototype]
ui_layer: [yes|no]
stack: [detected stack]
design_register: [brand|product|n/a]
layers_threshold: ambiguous
impeccable_active: [yes|no]
codegraph_active: [yes|no]
initialized: [ISO date]

## Stack Notes

[Any relevant notes about the detected stack — framework versions, known constraints, etc.]

## Conventions

[Leave blank. Vorth will populate this as patterns emerge from your work.]
```

---

**FILE: `.vorth/context.md`**

```markdown
# Vorth Project Context

Last updated: [ISO date]

## Active Branch

(none yet)

## In Progress

(nothing active)

## Recent Decisions

(none yet)

## Known Patterns

(none yet — Vorth will populate this as work progresses)

## Session Log

(empty)
```

---

**FILE: `docs/vorth/plans/.gitkeep`** (create directory structure)

---

### Phase 4 — Announce completion

```
✓ Vorth initialized for [project_name]

Environment:
  ✓ ECC          — specialist agents active
  ✓ Superpowers  — planning & execution methodology active
  ✓ Layers       — design thinking active (triggers on UX ambiguity)
  ✓ CodeGraph    — [OK (existing index) / INITIALIZED (new index built)]
  [✓/—] Impeccable — [INITIALIZED (auto-installed) / inactive (no UI layer)]

Files created:
  GEMINI.md              ← activates Vorth automatically in all future sessions
  .vorth/
    vorth.config.md      ← project configuration (edit anytime to adjust behavior)
    context.md           ← living context, updated after every session
  docs/vorth/plans/      ← implementation plans will be saved here

Configuration:
  Type:  [type]
  Stack: [stack]
  UI:    [yes/no]
  Register: [brand/product/n/a]

You're ready. Describe what you want to build or fix, and Vorth handles the rest.

Two moments will require your approval:
  ⏸ Checkpoint 1 — before execution begins (you review the plan)
  ⏸ Checkpoint 2 — before merge (you review the result)
```

---

## STATUS FLOW

Read `.vorth/vorth.config.md` and `.vorth/context.md`, call `codegraph_status` if `.codegraph/` exists, list files in `docs/vorth/plans/`, then display:

```
⚙ Vorth Status — [project_name]

Configuration
  Type:      [project_type]
  Stack:     [stack]
  UI Layer:  [yes/no]
  Register:  [brand/product/n/a]

Active Stacks
  ✓ ECC           agents: tdd-guide, code-reviewer, security-reviewer, architect, build-error-resolver
  ✓ Superpowers   brainstorming, writing-plans, subagent-driven-development, systematic-debugging
  [✓/—] Layers    [active if layers_threshold: ambiguous / inactive if layers_threshold: never]
  [✓/—] Impeccable [active if impeccable_active: yes / inactive if impeccable_active: no]
  [✓/—] CodeGraph [✓ if .codegraph/ exists — show: files indexed, languages, pending sync count]
                  [— if not initialized — show: "run `codegraph init -i` to activate"]

Current State
  Branch:    [active_branch or "none"]
  In Progress: [in_progress from context.md or "nothing active"]

Plans
  [list filenames in docs/vorth/plans/ or "none yet"]
```

---

## ORCHESTRATION ENGINE

This is the core of Vorth. It runs for any engineering request when Vorth is active (not for /vorth commands).

### Step 1 — Classify the request

Classify the user's request into one of three types:

| Type | Key Signals |
|------|------------|
| `NEW_PROJECT` | No existing source code in the repo; starting from zero |
| `NEW_FEATURE` | Adding to an existing codebase — new functionality, page, endpoint, component |
| `BUG_FIX_TASK` | Small and well-defined — fix an error, refactor a function, update a value |

When ambiguous between `NEW_FEATURE` and `BUG_FIX_TASK`: if any planning or design work is needed, treat as `NEW_FEATURE`.

Announce classification (one line): `→ Classified: [TYPE]`

### Step 2 — Run the matching pipeline

---

### PIPELINE A — NEW_PROJECT

**1. Brainstorm**
- Invoke `superpowers:brainstorming`
- Do not proceed past this step until a spec emerges and the user acknowledges it

**2. Layers — conditional**
- ACTIVATE IF: spec has undefined user flows, unclear personas, or ambiguous product strategy
- Check: "Is it clear who uses this, what they need, and why?" — if NO, activate Layers
- Invoke `layers-skills:layers-orient` first
- Follow with `layers-skills:layers-user-needs` if job stories are missing
- Follow with `layers-skills:layers-interaction-flow` if navigation/flow is unclear
- Skip entirely if spec already answers these questions clearly

**3. Impeccable shape — conditional**
- ACTIVATE IF: `impeccable_active: yes` in vorth.config.md
- Invoke `/impeccable shape` for each major UI surface identified in the spec
- Purpose: establish visual direction and UX structure BEFORE writing code
- Do not write any frontend code until shape pass is done

**4. Write implementation plan**
- Invoke `superpowers:writing-plans`
- Save to `docs/vorth/plans/YYYY-MM-DD-[feature-name].md`
- Plan must have: goal, architecture, tech stack, bite-sized tasks with full code, exact file paths, test commands

**5. ⏸ CHECKPOINT 1 — PLAN REVIEW**

```
⏸ CHECKPOINT 1 of 2: Implementation Plan Ready

Plan saved to: docs/vorth/plans/[filename]

Summary:
  [3-5 bullet points of what will be built]
  [estimated task count]
  [key architectural decisions made]

Stacks that will run during execution:
  [list which ECC agents, and whether Impeccable audit will run]

Reply "approved" to begin execution, or give feedback to revise the plan.
```

STOP. Do not proceed until the user explicitly approves.

**6. Repository setup (new projects only)**
- Initialize git if not already initialized
- Create `.gitignore` appropriate for the detected stack
- Set up testing framework scaffold based on stack

**7. Execute via Superpowers subagent-driven-development**
- Invoke `superpowers:subagent-driven-development`
- Follow its protocol exactly: implementer subagent → spec reviewer → code quality reviewer per task
- ECC agents called within the execution loop:
  - `tdd-guide` (ECC skill): every implementation task — write failing test first
  - `code-reviewer` (ECC agent): every task after implementation
  - `security-reviewer` (ECC agent): any task involving auth, API keys, user data, payments, permissions
  - `build-error-resolver` (ECC agent): immediately if any build or test fails
  - `architect` (ECC agent): if a task requires structural design decisions not covered in the plan

**8. Impeccable audit + polish — conditional**
- ACTIVATE IF: `impeccable_active: yes` AND any frontend code was written in this pipeline
- Run `/impeccable audit` → fix all flagged issues
- Run `/impeccable polish` → apply final quality pass
- Do not proceed to Checkpoint 2 until both commands report clean

**9. ⏸ CHECKPOINT 2 — FINAL REVIEW**

```
⏸ CHECKPOINT 2 of 2: Ready for Merge

All tasks complete. Summary:

  Tests:     [X passing / Y failing]
  Coverage:  [X%]
  ECC review: [summary of what was flagged and fixed]
  [Impeccable: audit clean / N issues fixed — only if UI exists]

Branch: [branch name]
Plan:   docs/vorth/plans/[filename]

Reply "approved" to commit and close, or give feedback to address before merging.
```

STOP. Do not commit or merge until the user explicitly approves.

**10. On approval**
- Format commit with ECC conventional commit: `feat: [description]`
- Update `.vorth/context.md` with session summary, decisions made, patterns found

---

### PIPELINE B — NEW_FEATURE

**1. CodeGraph codebase scan — conditional**
- ACTIVATE IF: `codegraph_active: yes` in vorth.config.md
- Before any planning, run ONE `codegraph_explore` call to understand the area being changed:
  - Use natural language: e.g. `codegraph_explore("auth flow and user session handling")`
  - Purpose: understand existing patterns, naming conventions, related symbols, and dependencies before writing the plan
- Also run `codegraph_impact` on the primary symbol(s) that will be changed, to know the blast radius before planning
- Do NOT skip this if CodeGraph is active — it makes the plan dramatically more accurate
- If `codegraph_active: no` → skip this step

**2. Layers — conditional**
- ACTIVATE IF: the request involves user-facing behavior that isn't clearly specified
- Ask yourself: "If I were to write a plan right now, would I have to guess how the UX works?"
- If YES → invoke the appropriate Layers skill:
  - `layers-skills:layers-user-needs` — if the user's goal/need is unclear
  - `layers-skills:layers-interaction-flow` — if the navigation or flow between states is unclear
  - `layers-skills:layers-domain` — if domain concepts / vocabulary in the feature are ambiguous
- If NO → skip Layers entirely

**3. Brainstorm or plan directly**
- If request is vague or has major design decisions unresolved → invoke `superpowers:brainstorming` first
- If request is clear with no major unknowns → go directly to `superpowers:writing-plans`
- Save plan to `docs/vorth/plans/YYYY-MM-DD-[feature-name].md`
- The plan should reference specific file paths and symbol names discovered via CodeGraph (if active)

**4. Impeccable shape — conditional**
- ACTIVATE IF: `impeccable_active: yes` AND the feature includes new UI surfaces or components
- Invoke `/impeccable shape` before writing any frontend code

**5. ⏸ CHECKPOINT 1 — PLAN REVIEW**

Same format as PIPELINE A Checkpoint 1. STOP and wait for approval.

**6. Execute via subagent-driven-development**
- Same as PIPELINE A Step 7
- During execution: use `codegraph_node` or `codegraph_callers` when you need to understand a specific symbol before modifying it

**7. Impeccable audit + polish — conditional**
- ACTIVATE IF: `impeccable_active: yes` AND any UI was written or modified

**8. ⏸ CHECKPOINT 2 — FINAL REVIEW**

Same format as PIPELINE A Checkpoint 2. STOP and wait for approval.

**9. On approval**
- Commit with ECC conventional format
- Update `.vorth/context.md`

---

### PIPELINE C — BUG_FIX_TASK

**1. CodeGraph investigation — conditional**
- ACTIVATE IF: `codegraph_active: yes` AND the bug cause is not immediately obvious
- Run `codegraph_callers` on the function or method where the bug manifests — understand who calls it and with what data
- Run `codegraph_explore` with the bug description as a natural-language query to surface related symbols
- Run `codegraph_impact` on the suspected root cause symbol to understand blast radius before the fix
- This replaces the grep/read loop — do NOT start file-scanning before trying CodeGraph first
- If `codegraph_active: no` → skip this step, proceed to systematic debugging

**2. Systematic debugging — conditional**
- ACTIVATE IF: the cause of the bug is still not known after CodeGraph investigation (or CodeGraph is inactive)
- Invoke `superpowers:systematic-debugging`
- If the cause is now clear from CodeGraph, skip this step

**3. TDD fix cycle (mandatory)**
- Invoke `superpowers:test-driven-development`
- Write a failing test that reproduces the bug (RED)
- Implement minimal fix (GREEN)
- Refactor if needed, verify tests still pass
- Use `codegraph_node` during implementation if you need to read a specific symbol's source before modifying it

**4. Quick code review**
- Invoke ECC `code-reviewer` agent on the changed files only

**5. Impeccable audit — conditional**
- ACTIVATE IF: `impeccable_active: yes` AND the bug fix touched UI code
- Run `/impeccable audit` on the affected components only

**6. Verify and commit**
- Invoke `superpowers:verification-before-completion` to confirm the bug is actually fixed
- Commit immediately with format: `fix: [description of what was broken and how it's fixed]`
- Update `.vorth/context.md` with the fix

**No checkpoints** for BUG_FIX_TASK — unless a blocker is encountered that requires design decisions, in which case escalate to PIPELINE B.

---

## CONTEXT UPDATES

After every completed pipeline (or at session end), update `.vorth/context.md`:

- **Active Branch**: current git branch name
- **In Progress**: what is actively being built (or "nothing" if session is complete)
- **Recent Decisions**: 2-5 key design/architecture decisions made this session, each 1 sentence
- **Known Patterns**: patterns discovered in this specific codebase (naming conventions, folder structure, preferred patterns found in existing code)
- **Session Log**: append one line per session: `[YYYY-MM-DD] [TYPE]: [brief summary]`

---

## STACK INVOCATION REFERENCE

| When you need this | Invoke this |
|--------------------|-------------|
| Ideate / clarify spec | `superpowers:brainstorming` |
| Write detailed implementation plan | `superpowers:writing-plans` |
| Execute plan with per-task subagents | `superpowers:subagent-driven-development` |
| Execute plan inline with checkpoints | `superpowers:executing-plans` |
| Investigate unknown bug | `superpowers:systematic-debugging` |
| Confirm fix is complete | `superpowers:verification-before-completion` |
| Pre-merge code review checklist | `superpowers:requesting-code-review` |
| TDD RED-GREEN-REFACTOR | `superpowers:test-driven-development` |
| Product design orientation | `layers-skills:layers-orient` |
| Job stories and user needs | `layers-skills:layers-user-needs` |
| Domain vocabulary and concepts | `layers-skills:layers-domain` |
| Navigation and interaction flow | `layers-skills:layers-interaction-flow` |
| UI shape / design before code | `/impeccable shape` |
| UI technical quality audit | `/impeccable audit` |
| Pre-ship design polish | `/impeccable polish` |
| UX design critique | `/impeccable critique` |
| ECC TDD cycle | `tdd-workflow` (ECC skill) |
| ECC implementation planning | `planner` (ECC agent) |
| ECC code quality review | `code-reviewer` (ECC agent) |
| ECC security audit | `security-reviewer` (ECC agent) |
| ECC build/compile failures | `build-error-resolver` (ECC agent) |
| ECC architecture decisions | `architect` (ECC agent) |
| ECC language-specific review | `typescript-reviewer` / `python-reviewer` / `go-reviewer` / etc. (ECC agents) |
| Understand how any area of code works | `codegraph_explore` (MCP — PRIMARY, use first) |
| Find a symbol by name across codebase | `codegraph_search` (MCP) |
| Know what calls a function | `codegraph_callers` (MCP) |
| Know what a function calls | `codegraph_callees` (MCP) |
| Blast radius before editing a symbol | `codegraph_impact` (MCP) |
| Read one specific symbol's full source | `codegraph_node` (MCP) |
| Get indexed file structure | `codegraph_files` (MCP) |
| Check index health / pending syncs | `codegraph_status` (MCP) |

---

## CHECKPOINT PROTOCOL

A checkpoint is a hard stop. No exceptions.

**When you reach a checkpoint:**
1. State clearly what phase has completed and what is ready for review
2. Show the artifact location (plan file path) or summarize results
3. **Stop completely** — do not continue execution
4. Wait for an explicit continuation signal from the user ("approved", "go ahead", "looks good", "lgtm", or similar)
5. If the user gives feedback instead of approval: incorporate the feedback, update the artifact, re-present the checkpoint

**Checkpoint message format:**
```
⏸ CHECKPOINT [1/2]: [description of what this gate covers]

[Summary of what's done and what's ready for review]
[Artifact location if applicable]
[List of key items to check]

Reply "approved" to continue, or give feedback to revise.
```

---

## RULES — NON-NEGOTIABLE

1. **Never skip a checkpoint.** Checkpoints are the only human-in-the-loop gates Vorth provides.
2. **Never start implementation without an approved plan** (PIPELINE A and B only).
3. **Always use TDD.** Tests before implementation. Always. No exceptions.
4. **Always invoke the right specialist.** Don't write code where ECC code-reviewer should review it; don't design UX where Layers should clarify it.
5. **Update `.vorth/context.md` after every session.** This is the memory of the project.
6. **Respect project type.** Impeccable never activates for `api-only` or `backend-only` projects.
7. **Layers when uncertain.** If there's genuine UX ambiguity, invoke Layers — don't guess.
8. **Never commit to `main` or `master`** without Checkpoint 2 approval.
9. **Never run the full Superpowers subagent-driven-development** without a written plan in `docs/vorth/plans/`.
10. **Security-sensitive code always gets `security-reviewer`.** Auth, payments, user data, permissions — non-negotiable.
11. **CodeGraph before grep.** When `codegraph_active: yes`, ALWAYS use `codegraph_explore` or `codegraph_search` BEFORE running grep, find, or file-read loops for code discovery. CodeGraph is the pre-built index — using grep first wastes tokens and time.
12. **Check CodeGraph staleness after edits.** If a tool response starts with ⚠️, those files are pending re-index — Read those files directly for accurate content.

---

## RED FLAGS — STOP if you notice any of these

| Situation | What to do |
|-----------|-----------|
| About to write implementation code without a test | Invoke `superpowers:test-driven-development` first |
| About to merge and `code-reviewer` hasn't run yet | Run code-reviewer before proceeding |
| Feature has a UI component but Impeccable `shape` hasn't run | Run `/impeccable shape` before coding |
| Plan document has "TBD", "TODO", or "handle edge cases" anywhere | Fix the plan using `superpowers:writing-plans` before execution |
| Code touches auth, API keys, user PII, or payments | Invoke `security-reviewer` — do not skip |
| Build fails mid-execution | Invoke `build-error-resolver` immediately, do not continue other tasks |
| User asks for something that changes the project type or stack | Update `.vorth/vorth.config.md` before continuing |
| Subagent is blocked and cannot resolve | Escalate to user — do not force retry |
| `codegraph_active: yes` but grep/Read loop used for code discovery | Stop — use `codegraph_explore` instead |
| CodeGraph reports "project isn't initialized" during a session | Offer to run `codegraph init -i` and set `codegraph_active: no` in config until done |
| CodeGraph response has ⚠️ staleness banner on a file you just edited | Read that file directly before using its content |
