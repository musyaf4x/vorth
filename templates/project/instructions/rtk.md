# Vorth RTK Policy

RTK is Vorth's command-output optimization layer. It may compress noisy shell output before the agent spends context on it.

## When To Use

Use RTK when available for noisy command output such as:

- Large `git diff`, `git status`, or `git log` output.
- Broad `rg` searches.
- Test, lint, typecheck, build, and log output.

## Bypass Rules

Do not use RTK when:

- The user asks for exact/raw command output.
- The output is machine-readable JSON or another exact format needed downstream.
- The command is interactive, auth-sensitive, destructive, or modifies external state.
- The RTK summary is ambiguous, missing the failing section, or hides relevant details.

## Fallback

If RTK is missing, stale, or unavailable, continue with normal command usage.

If a compressed output is insufficient, rerun a narrower raw command or inspect the preserved raw failing section. Mention that RTK mode is degraded only when it matters to the task.
