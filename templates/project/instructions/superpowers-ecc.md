# Vorth Superpowers + ECC Contract

Superpowers owns process. ECC owns specialist review and targeted expertise.
CodeGraph owns codebase-intelligence routing before broad exploration.
Impeccable owns frontend/UI quality gates.
Layers owns product/UX decision discovery.

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

## Impeccable Routing

- Use Impeccable for frontend/UI creation, critique, audit, polish, harden, layout, responsive behavior, accessibility, and design-system fit.
- Skip Impeccable for backend-only or obvious one-line UI work.

## Layers Routing

- Use Layers before implementation when product/UX intent, conceptual model, or interaction flow is unclear.
- Skip Layers when the engineering task and target behavior are already clear.

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
- Do not let Impeccable replace Layers for product decisions.
- Do not let Layers become a ritual for every engineering task.
