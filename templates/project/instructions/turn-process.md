# Vorth Turn Process

## Without Vorth

User prompt -> default agent behavior -> default tool use -> final response.

## With Vorth

User prompt -> activation check -> context load -> stack routing -> CodeGraph if code scope is broad -> Layers if product/UX is unclear -> Superpowers workflow -> ECC/Impeccable gates when useful -> optional Agy Native Bridge bounded execution -> main agent applies/verifies/reviews -> context update.

## Rules

- The user instruction wins over Vorth.
- Vorth applies only when this repository is opted in.
- Superpowers remains the baseline process.
- Use CodeGraph before broad codebase exploration or reading many files.
- Skip CodeGraph for small changes when the target file is already clear.
- Use Layers only for product/UX ambiguity.
- Use Impeccable only for frontend/UI quality work.
- Agy Native Bridge is Antigravity-only.
- Codex ignores Agy bridge tools.
- CodeGraph, Impeccable, and Layers are selected by `.vorth/vorth.config.md` and stack routing.
