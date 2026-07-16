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

The test prints safe readiness/model metadata only. It does not call the user-status RPC and must not print Antigravity command lines, CSRF tokens, OAuth tokens, or cookies.

Delegation requires an absolute Vorth-enabled `repoRoot`, repository-relative
`filesAllowed`, and explicit `acceptanceCriteria`. When multiple usable
Antigravity sessions exist, pass `workspaceId`; the bridge refuses to guess.
Returned patches are validated against the delegated file scope before they are
returned to the main agent.

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
node .\.vorth\mcp\vorth-agy-native-bridge\profile-manager.mjs init
node .\.vorth\mcp\vorth-agy-native-bridge\profile-manager.mjs login --workspace .
node .\.vorth\mcp\vorth-agy-native-bridge\profile-manager.mjs status
```

The helper defaults to OS temporary directories and discovers the Antigravity IDE
CLI from `ANTIGRAVITY_IDE_CLI`, its standard LocalAppData location, or `PATH`.
The worker must be logged in interactively once; readiness requires a language
server exposing both HTTPS and CSRF runtime arguments.
