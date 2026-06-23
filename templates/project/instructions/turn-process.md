# Vorth Turn Process

## Without Vorth

User prompt -> default agent behavior -> default tool use -> final response.

## With Vorth

User prompt -> activation check -> context load -> stack routing -> CodeGraph if code scope is broad -> Layers if product/UX is unclear -> Superpowers workflow -> RTK for noisy shell output when useful -> Ponytail complexity guard before edit -> ECC/Impeccable gates when useful -> optional Agy Native Bridge bounded execution -> main agent applies/verifies/reviews -> Caveman compact report only for subagent/handoff output -> context update.

## Rules

- The user instruction wins over Vorth.
- Vorth applies only when this repository is opted in.
- Superpowers remains the baseline process.
- Use CodeGraph before broad codebase exploration or reading many files.
- Skip CodeGraph for small changes when the target file is already clear.
- Use Layers only for product/UX ambiguity.
- Use Impeccable only for frontend/UI quality work.
- Use Ponytail after sufficient context and before edits.
- Use RTK only to compress noisy command output, and bypass it for exact/raw output needs.
- Use Caveman only for compact subagent, status, or handoff reports.
- Agy Native Bridge is Antigravity-only.
- Codex ignores Agy bridge tools.
- CodeGraph, Impeccable, Layers, Ponytail, RTK, and Caveman are selected by `.vorth/vorth.config.md` and stack routing.
