# Vorth CodeGraph Contract

CodeGraph is the codebase intelligence layer. It narrows exploration before the agent spends tokens reading many files.

## Use CodeGraph First

- Before broad codebase exploration, query CodeGraph first.
- Before reading many files, query CodeGraph first.
- For unfamiliar architecture, dependency flow, call graph, route mapping, or blast-radius analysis, query CodeGraph first.
- Ask CodeGraph for likely files, symbols, relationships, and next reads.

## Skip CodeGraph

- Skip CodeGraph for small changes when the exact file or symbol is already clear.
- Skip CodeGraph when a compiler, test, linter, or user instruction already points to the file to edit.
- Skip CodeGraph when the user explicitly asks for direct file inspection only.

## Query Shape

When using `codegraph_explore`, include:

- the user goal;
- suspected entry points, if any;
- the kind of answer needed: files, symbols, flows, dependencies, risks, or tests;
- constraints such as "avoid broad file reads" or "identify only likely files first".

## Fallback

If CodeGraph is unavailable, stale, or not registered as a tool:

- say the graph layer is degraded;
- fall back to `rg` and targeted file reads;
- keep exploration narrow and explain any broad read.

## Bounds

- CodeGraph does not replace Superpowers as the workflow baseline.
- CodeGraph does not replace ECC specialist review.
- CodeGraph should reduce exploration, not add an extra step to obvious one-file work.
