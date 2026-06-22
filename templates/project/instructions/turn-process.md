# Vorth Turn Process

## Without Vorth

User prompt -> default agent behavior -> default tool use -> final response.

## With Vorth

User prompt -> activation check -> context load -> Superpowers workflow -> ECC specialist gate when useful -> optional Agy Native Bridge bounded execution -> main agent applies/verifies/reviews -> context update.

## Rules

- The user instruction wins over Vorth.
- Vorth applies only when this repository is opted in.
- Agy Native Bridge is Antigravity-only.
- Codex ignores Agy bridge tools.
- Deferred stacks remain disabled.
