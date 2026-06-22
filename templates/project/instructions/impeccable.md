# Vorth Impeccable Contract

Impeccable is the frontend/UI design execution and quality gate. Use it only when the task touches visible product experience.

## Use Impeccable

- Creating or changing frontend screens, pages, dashboards, portals, forms, onboarding, landing pages, empty states, or error states.
- Auditing UI for generic output, weak hierarchy, poor spacing, inaccessible controls, broken responsive behavior, or visual inconsistency.
- Polishing copy, layout, interaction states, component composition, and design-system fit.
- Hardening a UI after implementation with browser/manual evidence.

## Skip Impeccable

- Backend-only work.
- Tests, build config, scripts, data migrations, or docs that do not affect product UI.
- Small UI text or file changes where the visual behavior is already obvious and low risk.

## Install Boundary

When `.vorth/vorth.config.md` sets `impeccable: auto`, treat Impeccable as a conditional policy and use installed Impeccable assets if present.

When `.vorth/vorth.config.md` sets `impeccable: enabled`, Vorth expects the official installer path:

```powershell
npx --yes impeccable install --providers=gemini,codex --scope=project
```

Do not copy Impeccable internals by hand. Respect the creator's installer and generated files.

## Bounds

- Impeccable does not replace Superpowers as process.
- Impeccable does not replace Layers when product/UX decisions are still unclear.
- Impeccable does not replace ECC engineering/security review.
