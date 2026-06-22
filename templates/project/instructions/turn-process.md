# Vorth Turn Process

## Without Vorth

User prompt -> default agent behavior -> default tool use -> final response.

## With Vorth

User prompt -> activation check -> context load -> CodeGraph routing for broad codebase exploration -> Superpowers workflow -> ECC specialist gate when useful -> optional Agy Native Bridge bounded execution -> main agent applies/verifies/reviews -> context update.

## Rules

- The user instruction wins over Vorth.
- Vorth applies only when this repository is opted in.
- Use CodeGraph before broad codebase exploration or reading many files.
- Skip CodeGraph for small changes when the target file is already clear.
- Agy Native Bridge is Antigravity-only.
- Codex ignores Agy bridge tools.
- Layers and Impeccable remain disabled. CodeGraph is active when `.vorth/vorth.config.md` sets `codegraph: enabled`.
