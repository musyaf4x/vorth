# Vorth Ponytail Policy

Ponytail is Vorth's complexity guard. It decides how small the implementation should be after the main agent has enough context.

## When To Use

- Use Ponytail after context gathering and before editing code.
- Use Ponytail for implementation shape, dependency decisions, abstraction decisions, and diff-size pressure.
- Do not use Ponytail as a replacement for CodeGraph, Superpowers, ECC, or user clarification.

## Default Ladder

Before adding code, ask in order:

1. Does this behavior need to exist now?
2. Can existing project code already do it?
3. Can the standard library or native platform do it?
4. Can an already-installed dependency do it?
5. Can the change be expressed directly with fewer moving parts?
6. What is the smallest readable change that satisfies the request and tests?

## Safety Override

Minimalism must not reduce correctness, security, accessibility, data integrity, migrations, public API compatibility, concurrency safety, or clear error handling.

If a smaller implementation would hide a real risk, keep the safer implementation and mention why Ponytail did not shrink it further.

## Ultra Mode

Ponytail ultra-minimal behavior is explicit-only. Do not apply an extreme minimal style unless the user specifically asks for it.
