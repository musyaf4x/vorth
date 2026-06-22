# Vorth Layers Contract

Layers is the product/UX decision-discovery gate. Use it only when the product problem is unclear.

## Use Layers

- The user request has unclear audience, goal, domain model, user need, product strategy, conceptual model, interaction flow, or surface direction.
- A redesign or new feature needs product framing before UI implementation.
- The agent is tempted to jump into screens/components before understanding what the product should mean.

## Skip Layers

- The engineering task is clear.
- The target files and behavior are already known.
- The work is backend-only, build-only, or a small implementation detail.
- Impeccable can directly audit or polish an already clear UI.

## How To Apply

Use the lightest useful layer:

- observed behavior: what users actually do or need;
- domain: real objects, terms, and constraints;
- user needs: jobs, motivations, anxieties, and success conditions;
- product strategy: what this product should optimize for;
- conceptual model: entities, relationships, states, and mental model;
- interaction flow: steps, transitions, decisions, and recovery;
- surface: screens, copy, components, and visual hierarchy.

## Install Boundary

When `.vorth/vorth.config.md` sets `layers: advisory`, use this Vorth contract only.

When `.vorth/vorth.config.md` sets `layers: enabled`, Vorth expects a project-local vendor checkout at:

```text
.vorth/vendor/layers-skills/
```

Use the official Layers skills from that checkout when available. Do not activate Layers as a default ritual for every task.
