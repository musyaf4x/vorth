# Vorth Agy Native Bridge

Project-local MCP server for Vorth's Antigravity-only native OAuth delegation.

## Tools

- `vorth_agy_status`
- `vorth_agy_models`
- `vorth_agy_delegate`
- `vorth_agy_read_result`
- `vorth_flash_high_execute`

## Self Test

Run this after copying the template into a Vorth-enabled project:

```powershell
node .\.vorth\mcp\vorth-agy-native-bridge\server.mjs --self-test
```

The test prints safe readiness/model metadata only. It must not print Antigravity command lines, CSRF tokens, OAuth tokens, cookies, or user status values.

## MCP Registration

Prefer project-local MCP registration when Antigravity supports it. If only user-level registration is available, ask before editing `~/.gemini/config/mcp_config.json`.

Suggested entry:

```json
{
  "mcpServers": {
    "vorth-agy-native-bridge": {
      "command": "node",
      "args": ["<repo>/.vorth/mcp/vorth-agy-native-bridge/server.mjs"]
    }
  }
}
```

## Worker Profile

Use a worker profile only after the active-profile bridge works.

```powershell
node .\.vorth\mcp\vorth-agy-native-bridge\profile-manager.mjs init --user-data-dir C:\tmp\vorth-agy-worker --extensions-dir C:\tmp\vorth-agy-worker-ext
node .\.vorth\mcp\vorth-agy-native-bridge\profile-manager.mjs login --user-data-dir C:\tmp\vorth-agy-worker --extensions-dir C:\tmp\vorth-agy-worker-ext --workspace .
node .\.vorth\mcp\vorth-agy-native-bridge\profile-manager.mjs status --user-data-dir C:\tmp\vorth-agy-worker
```

The worker must be logged in interactively once before it can provide a usable workspace language server.
