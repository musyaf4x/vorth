# Vorth Superpowers + ECC Contract

Superpowers owns process. ECC owns specialist review and targeted expertise.

## Workflow

- Small, obvious task: understand, make a narrow change, verify, update context.
- Bug or failing test: use systematic debugging, identify root cause, write/verify failing test, fix, review changed files.
- Non-trivial feature/refactor: brainstorm or clarify, write a plan, get approval, execute with TDD, review, verify.
- Large independent plan: use Superpowers subagent-driven-development when available.

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
- Do not use deferred stacks until Vorth explicitly enables them.
