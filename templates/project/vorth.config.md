# Vorth Config

install_scope: project-local
mode: project-local

superpowers: missing
superpowers_scope: project-local

ecc_antigravity: skipped
ecc_codex: skipped

agy_native_bridge: {{AGY_NATIVE_BRIDGE}}
agy_native_bridge_profile: active
agy_native_bridge_server: .vorth/mcp/vorth-agy-native-bridge/server.mjs
agy_flash_high_executor: {{AGY_FLASH_HIGH_EXECUTOR}}
agy_flash_high_model_id: gemini-3-flash-agent
agy_flash_high_model_enum: auto
agy_flash_high_scope: agy-only
codex_flash_high_executor: disabled

codegraph: {{CODEGRAPH}}
codegraph_scope: project-local
codegraph_index: .codegraph
codegraph_policy: broad-exploration-first

impeccable: {{IMPECCABLE}}
impeccable_scope: project-local
impeccable_policy: frontend-quality-gate

layers: {{LAYERS}}
layers_scope: project-local
layers_policy: product-decision-gate

conditional_stacks: impeccable, layers
deferred_stacks: none
created_by: vorth-cli
